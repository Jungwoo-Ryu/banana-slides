package backend

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type APIError struct {
	Code, Message string
	Status        int
}

func (e *APIError) Error() string { return e.Message }
func bad(message string) error    { return &APIError{"BAD_REQUEST", message, 400} }

type endpoint func(http.ResponseWriter, *http.Request) (any, error)
type job struct {
	id  string
	run func(context.Context, *Task) error
}
type Server struct {
	Config                         Config
	Store                          *Store
	Azure                          *Azure
	ctx                            context.Context
	cancel                         context.CancelFunc
	wg                             sync.WaitGroup
	jobs                           chan job
	imageSlot, heavySlot, textSlot chan struct{}
	mux                            *http.ServeMux
	httpServer                     *http.Server
	Token, BaseURL                 string
	closing                        sync.Once
	operationMu                    sync.Mutex
	imageMu                        sync.Mutex
}

func NewServer(cfg Config) (*Server, error) {
	store, err := OpenStore(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	s := &Server{Config: cfg, Store: store, ctx: ctx, cancel: cancel, jobs: make(chan job, 32), imageSlot: make(chan struct{}, 1), heavySlot: make(chan struct{}, 1), textSlot: make(chan struct{}, 2), mux: http.NewServeMux()}
	if err = os.MkdirAll(filepath.Join(cfg.DataDir, "uploads"), 0700); err != nil {
		store.Close()
		cancel()
		return nil, err
	}
	token := make([]byte, 32)
	if _, err = rand.Read(token); err != nil {
		store.Close()
		cancel()
		return nil, err
	}
	s.Token = hex.EncodeToString(token)
	s.Azure = NewAzure(cfg)
	tasks, _ := store.List("task", "*")
	for _, task := range tasks {
		if state := str(task, "status"); state == "PENDING" || state == "PROCESSING" || state == "RUNNING" {
			task["status"] = "FAILED"
			task["error_message"] = "앱이 종료되어 작업이 중단되었습니다. 다시 실행하세요."
			task["completed_at"] = now()
			_ = store.Put("task", str(task, "task_id"), str(task, "project_id"), 0, task)
		}
	}
	s.routes()
	for i := 0; i < 2; i++ {
		s.wg.Add(1)
		go s.worker()
	}
	return s, nil
}
func (s *Server) Close() {
	s.closing.Do(func() {
		s.cancel()
		if s.httpServer != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = s.httpServer.Shutdown(ctx)
		}
		s.wg.Wait()
		_ = s.Store.Close()
	})
}
func (s *Server) Listen(address string, authenticated bool) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	if host != "127.0.0.1" && host != "localhost" {
		return errors.New("데스크톱 API는 로컬 루프백 주소에서만 실행할 수 있습니다")
	}
	listener, err := net.Listen("tcp4", address)
	if err != nil {
		return err
	}
	s.BaseURL = "http://" + listener.Addr().String()
	s.httpServer = &http.Server{Handler: s.Handler(authenticated), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second, MaxHeaderBytes: 1 << 20, BaseContext: func(net.Listener) context.Context { return s.ctx }}
	go func() {
		if err := s.httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("API stopped", "error", err)
		}
	}()
	return nil
}
func (s *Server) Handler(authenticated bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		defer func() {
			if v := recover(); v != nil {
				slog.Error("request panic", "path", r.URL.Path, "panic", fmt.Sprint(v))
				failure(w, &APIError{"INTERNAL_ERROR", "내부 오류가 발생했습니다. 로그를 확인하세요.", 500})
			}
			slog.Debug("http", "method", r.Method, "path", r.URL.Path, "elapsed_ms", time.Since(started).Milliseconds())
		}()
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		origin := r.Header.Get("Origin")
		if origin != "" {
			allowed := origin == "wails://wails" || origin == "http://wails.localhost" || origin == "https://wails.localhost" || origin == s.BaseURL
			if !authenticated {
				u, e := url.Parse(origin)
				allowed = allowed || (e == nil && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost"))
			}
			if !allowed {
				failure(w, &APIError{"ORIGIN_DENIED", "허용하지 않는 요청 출처입니다.", 403})
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-SolA-Session, X-Access-Code, Accept-Language")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		}
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		if authenticated && r.URL.Path != "/health" {
			token := r.Header.Get("X-SolA-Session")
			if r.Method == "GET" && token == "" && strings.HasPrefix(r.URL.Path, "/files/") {
				token = r.URL.Query().Get("session")
			}
			if subtle.ConstantTimeCompare([]byte(token), []byte(s.Token)) != 1 {
				failure(w, &APIError{"UNAUTHORIZED", "앱 세션이 만료되었습니다. 앱을 다시 실행하세요.", 401})
				return
			}
		}
		r.Body = http.MaxBytesReader(w, r.Body, s.Config.MaxUpload)
		defer func() {
			if r.MultipartForm != nil {
				_ = r.MultipartForm.RemoveAll()
			}
		}()
		s.mux.ServeHTTP(w, r)
	})
}
func (s *Server) handle(pattern string, fn endpoint) {
	s.mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		data, err := fn(w, r)
		if err != nil {
			slog.Error("API request failed", "method", r.Method, "path", r.URL.Path, "error", s.Azure.safeError(err))
			failure(w, err)
			return
		}
		success(w, data)
	})
}
func success(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if result, ok := data.(response); ok {
		w.WriteHeader(result.status)
		data = result.data
	}
	_ = json.NewEncoder(w).Encode(Object{"success": true, "data": clean(data)})
}
func failure(w http.ResponseWriter, err error) {
	code, status, message := "BAD_REQUEST", 400, err.Error()
	var api *APIError
	if errors.As(err, &api) {
		code, status, message = api.Code, api.Status, api.Message
	} else if errors.Is(err, ErrNotFound) {
		code, status = "NOT_FOUND", 404
	} else if errors.Is(err, context.Canceled) {
		code, status, message = "CANCELLED", 409, "작업이 취소되었습니다."
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Object{"success": false, "error": Object{"code": code, "message": message}})
}
func payload(r *http.Request) (Object, error) {
	if r.Body == nil {
		return Object{}, nil
	}
	defer r.Body.Close()
	var data Object
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&data); err == io.EOF {
		return Object{}, nil
	} else if err != nil {
		return nil, bad("JSON 요청 형식이 올바르지 않습니다.")
	}
	if data == nil {
		return nil, bad("JSON 객체가 필요합니다.")
	}
	if decoder.Decode(new(any)) != io.EOF {
		return nil, bad("JSON 객체 하나만 전달하세요.")
	}
	return data, nil
}
func (s *Server) project(r *http.Request) (Object, error) {
	return s.Store.Get("project", r.PathValue("project"))
}
func (s *Server) page(r *http.Request) (Object, error) {
	p, err := s.Store.Get("page", r.PathValue("page"))
	if err != nil {
		return nil, err
	}
	if str(p, "project_id") != r.PathValue("project") {
		return nil, ErrNotFound
	}
	return p, nil
}
func (s *Server) pages(project string) ([]Object, error) { return s.Store.List("page", project) }
func (s *Server) fullProject(id string) (Object, error) {
	p, e := s.Store.Get("project", id)
	if e != nil {
		return nil, e
	}
	p["pages"], e = s.pages(id)
	return p, e
}
func (s *Server) uploadPath(relative string) (string, error) {
	relative = strings.TrimPrefix(relative, "/files/")
	if !filepath.IsLocal(filepath.FromSlash(relative)) || strings.ContainsAny(relative, "\\:") {
		return "", bad("잘못된 파일 경로입니다.")
	}
	root, err := filepath.EvalSymlinks(filepath.Join(s.Config.DataDir, "uploads"))
	if err != nil {
		return "", err
	}
	candidate := filepath.Join(root, filepath.FromSlash(relative))
	ancestor := candidate
	for {
		resolved, err := filepath.EvalSymlinks(ancestor)
		if err == nil {
			rel, err := filepath.Rel(root, resolved)
			if err != nil || (rel != "." && !filepath.IsLocal(rel)) {
				return "", bad("저장 폴더 밖의 파일은 접근할 수 없습니다.")
			}
			break
		}
		if !os.IsNotExist(err) {
			return "", err
		}
		parent := filepath.Dir(ancestor)
		if parent == ancestor {
			return "", bad("잘못된 파일 경로입니다.")
		}
		ancestor = parent
	}
	return candidate, nil
}

func (s *Server) serveFile(w http.ResponseWriter, r *http.Request) {
	p, err := s.uploadPath(r.PathValue("path"))
	if err != nil {
		failure(w, err)
		return
	}
	info, err := os.Stat(p)
	if err != nil || info.IsDir() {
		failure(w, ErrNotFound)
		return
	}
	http.ServeFile(w, r, p)
}
func withSlot(ctx context.Context, slot chan struct{}, fn func() error) error {
	select {
	case slot <- struct{}{}:
		defer func() { <-slot }()
		return fn()
	case <-ctx.Done():
		return ctx.Err()
	}
}

type Task struct {
	s  *Server
	ID string
}

func (t *Task) Progress(values Object) {
	_, err := t.s.Store.Update("task", t.ID, func(data Object) error {
		progress := object(data["progress"])
		for k, v := range values {
			progress[k] = v
		}
		progress["heartbeat_at"] = now()
		data["progress"] = progress
		return nil
	})
	if err != nil {
		slog.Error("task progress", "task_id", t.ID, "error", err)
	}
}
func (s *Server) enqueue(project, kind, requestedID string, run func(context.Context, *Task) error) (Object, error) {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	if requestedID != "" {
		if old, e := s.Store.Get("task", requestedID); e == nil {
			if str(old, "project_id") != project || str(old, "task_type") != kind {
				return nil, ErrNotFound
			}
			return Object{"task_id": requestedID, "status": old["status"]}, nil
		}
	}
	if len(s.jobs) == cap(s.jobs) {
		return nil, &APIError{"QUEUE_FULL", "대기 중인 작업이 많습니다. 잠시 후 다시 시도하세요.", 429}
	}
	id := requestedID
	if id == "" {
		id = uid()
	}
	if len(id) > 80 || strings.ContainsAny(id, "/\\") {
		return nil, bad("작업 ID가 올바르지 않습니다.")
	}
	data := Object{"task_id": id, "project_id": project, "task_type": kind, "status": "PENDING", "progress": Object{"total": 0, "completed": 0, "failed": 0, "percent": 0, "message": "작업을 대기하고 있습니다."}, "error_message": nil, "created_at": now(), "completed_at": nil}
	if err := s.Store.Put("task", id, project, 0, data); err != nil {
		return nil, err
	}
	select {
	case s.jobs <- job{id, run}:
		return Object{"task_id": id, "status": "PENDING"}, nil
	case <-s.ctx.Done():
		return nil, s.ctx.Err()
	}
}
func (s *Server) worker() {
	defer s.wg.Done()
	for {
		select {
		case <-s.ctx.Done():
			return
		case j := <-s.jobs:
			s.runJob(j)
		}
	}
}
func (s *Server) runJob(j job) {
	_, _ = s.Store.Update("task", j.id, func(o Object) error { o["status"] = "PROCESSING"; return nil })
	task := &Task{s, j.id}
	slog.Info("task started", "task_id", j.id)
	var err error
	func() {
		defer func() {
			if v := recover(); v != nil {
				err = fmt.Errorf("작업 처리 중 내부 오류가 발생했습니다: %v", v)
			}
		}()
		err = j.run(s.ctx, task)
	}()
	_, updateErr := s.Store.Update("task", j.id, func(o Object) error {
		o["completed_at"] = now()
		if err != nil {
			o["status"] = "FAILED"
			o["error_message"] = s.Azure.safeError(err).Error()
		} else {
			o["status"] = "COMPLETED"
			progress := object(o["progress"])
			progress["percent"] = 100
			o["progress"] = progress
		}
		return nil
	})
	if err != nil {
		slog.Error("task failed", "task_id", j.id, "error", s.Azure.safeError(err))
	}
	if updateErr != nil {
		slog.Error("task state save failed", "task_id", j.id, "error", updateErr)
	}
}
