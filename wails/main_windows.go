//go:build windows

package main

import (
	"context"
	"embed"
	"encoding/base64"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/Jungwoo-Ryu/banana-slides/wails/internal/backend"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

type App struct {
	ctx          context.Context
	server       *backend.Server
	startupError string
	dataDir      string
	saveMu       sync.Mutex
	smokeOnce    sync.Once
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.dataDir = backend.DefaultDataDir()
	if dir := os.Getenv("SOLA_DATA_DIR"); dir != "" {
		a.dataDir = dir
	}
	cfg, e := backend.NewConfig("", false)
	if e == nil {
		a.dataDir = cfg.DataDir
		a.server, e = backend.NewServer(cfg)
	}
	if e == nil {
		e = a.server.Listen("127.0.0.1:0", true)
	}
	if e != nil {
		a.startupError = e.Error()
		slog.Error("desktop startup failed", "error", e)
	}
}
func (a *App) Bootstrap() (map[string]string, error) {
	slog.Info("desktop bootstrap requested")
	if a.startupError != "" {
		return nil, errors.New(a.startupError)
	}
	if a.server == nil {
		return nil, errors.New("앱 초기화를 기다려 주세요")
	}
	return map[string]string{"baseURL": a.server.BaseURL, "session": a.server.Token, "dataDir": a.dataDir, "runtime": "wails"}, nil
}
func (a *App) SaveDownload(reference, name string) (string, error) {
	a.saveMu.Lock()
	defer a.saveMu.Unlock()
	if a.server == nil {
		return "", errors.New("앱이 초기화되지 않았습니다")
	}
	u, e := url.Parse(reference)
	if e != nil || u.IsAbs() || u.Host != "" || !strings.HasPrefix(u.Path, "/files/") {
		return "", errors.New("앱에서 생성한 파일만 저장할 수 있습니다")
	}
	source, e := a.server.ExportPath(u.Path)
	if e != nil {
		return "", e
	}
	if name == "" {
		name = filepath.Base(source)
	}
	destination, e := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "Sol.A 파일 저장", DefaultFilename: filepath.Base(name)})
	if e != nil || destination == "" {
		return "", e
	}
	return destination, backend.CopyFile(source, destination)
}
func (a *App) SaveData(encoded, name string) (string, error) {
	a.saveMu.Lock()
	defer a.saveMu.Unlock()
	if len(encoded) > 90<<20 {
		return "", errors.New("파일은 최대 64MB입니다")
	}
	raw, e := base64.StdEncoding.DecodeString(encoded)
	if e != nil {
		return "", e
	}
	if len(raw) > 64<<20 {
		return "", errors.New("파일은 최대 64MB입니다")
	}
	destination, e := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "Sol.A 파일 저장", DefaultFilename: filepath.Base(name)})
	if e != nil || destination == "" {
		return "", e
	}
	return destination, os.WriteFile(destination, raw, 0600)
}
func (a *App) OpenSettings() error {
	path := filepath.Join(a.dataDir, "settings.env")
	if _, e := os.Stat(path); os.IsNotExist(e) {
		template := "# Sol.A desktop: corporate Azure Foundry OpenAI only. Restart after editing.\nAZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com\nAZURE_OPENAI_API_KEY=\nAZURE_OPENAI_API_VERSION=v1\nAZURE_OPENAI_DEPLOYMENT=gpt-5.5\nAZURE_OPENAI_IMAGE_DEPLOYMENT=gpt-image-2\nAZURE_OPENAI_TTS_DEPLOYMENT=\nOCR_LANGUAGES=kor+eng\n"
		if e = os.WriteFile(path, []byte(template), 0600); e != nil {
			return e
		}
	}
	return exec.Command("notepad.exe", path).Start()
}
func (a *App) OpenDataFolder() error { return exec.Command("explorer.exe", a.dataDir).Start() }
func (a *App) ImportLegacy() (map[string]int, error) {
	if a.server == nil {
		return nil, errors.New("앱이 초기화되지 않았습니다")
	}
	root, e := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "기존 banana-slides 프로젝트 폴더 선택"})
	if e != nil || root == "" {
		return nil, e
	}
	return a.server.ImportLegacy(root)
}
func (a *App) UIReady() {
	slog.Info("desktop UI ready")
	if path := os.Getenv("SOLA_SMOKE_REPORT"); path != "" {
		a.smokeOnce.Do(func() {
			defer runtime.Quit(a.ctx)
			// The Windows CI harness drives the real save dialog. No credentials
			// or model calls are needed to exercise native file delivery.
			folder := filepath.Join(a.dataDir, "uploads", "desktop-smoke")
			if e := os.MkdirAll(folder, 0700); e != nil {
				slog.Error("desktop smoke mkdir", "error", e)
				return
			}
			content := []byte("Sol.A native file save verified\n")
			if e := os.WriteFile(filepath.Join(folder, "smoke.txt"), content, 0600); e != nil {
				slog.Error("desktop smoke write", "error", e)
				return
			}
			saved, e := a.SaveDownload("/files/desktop-smoke/smoke.txt", "sola-smoke.txt")
			if e != nil || saved == "" {
				slog.Error("desktop smoke save", "error", e)
				return
			}
			raw, e := os.ReadFile(saved)
			if e != nil || string(raw) != string(content) {
				slog.Error("desktop smoke verify", "error", e)
				return
			}
			_ = os.WriteFile(path, []byte(`{"window":true,"ui":true,"nativeSave":true,"runtime":"wails-go"}`), 0600)
		})
	}
}
func main() {
	root := backend.DefaultDataDir()
	_ = os.MkdirAll(filepath.Join(root, "logs"), 0700)
	logfile, e := os.OpenFile(filepath.Join(root, "logs", "desktop.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if e == nil {
		defer logfile.Close()
		slog.SetDefault(slog.New(slog.NewJSONHandler(logfile, &slog.HandlerOptions{Level: slog.LevelInfo})))
	}
	app := &App{}
	static, e := fs.Sub(assets, "frontend/dist")
	if e != nil {
		panic(e)
	}
	e = wails.Run(&options.App{Title: "Sol.A ☀", Width: 1440, Height: 960, MinWidth: 1000, MinHeight: 700, AssetServer: &assetserver.Options{Assets: static}, OnStartup: app.startup, OnDomReady: func(context.Context) { slog.Info("desktop DOM ready") }, OnShutdown: func(context.Context) {
		if app.server != nil {
			app.server.Close()
		}
	}, Bind: []interface{}{app}, SingleInstanceLock: &options.SingleInstanceLock{UniqueId: "1c544e83-169c-4310-92b8-35c026cdfa6a", OnSecondInstanceLaunch: func(options.SecondInstanceData) { runtime.WindowShow(app.ctx); runtime.WindowUnminimise(app.ctx) }}, Windows: &windows.Options{WebviewUserDataPath: filepath.Join(root, "webview2"), Theme: windows.Light}})
	if e != nil {
		slog.Error("desktop failed", "error", e)
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
}
