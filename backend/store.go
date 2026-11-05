package backend

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"sync"

	_ "modernc.org/sqlite"
)

type Object map[string]any

func str(o Object, k string) string { v, _ := o[k].(string); return v }
func num(o Object, k string) int {
	switch v := o[k].(type) {
	case float64:
		return int(v)
	case int:
		return v
	case json.Number:
		n, _ := v.Int64()
		return int(n)
	}
	return 0
}
func boolean(o Object, k string) bool { v, _ := o[k].(bool); return v }
func object(v any) Object {
	switch m := v.(type) {
	case Object:
		return m
	case map[string]any:
		return Object(m)
	}
	return Object{}
}
func stringsOf(v any) []string {
	out := []string{}
	switch a := v.(type) {
	case []any:
		for _, x := range a {
			if s, ok := x.(string); ok {
				out = append(out, s)
			}
		}
	case []string:
		return a
	}
	return out
}
func clone(o Object) Object {
	b, _ := json.Marshal(o)
	var copy Object
	_ = json.Unmarshal(b, &copy)
	return copy
}
func clean(v any) any {
	switch x := v.(type) {
	case Object:
		m := Object{}
		for k, v := range x {
			if len(k) > 0 && k[0] != '_' {
				m[k] = clean(v)
			}
		}
		return m
	case map[string]any:
		return clean(Object(x))
	case []Object:
		a := make([]any, len(x))
		for i, v := range x {
			a[i] = clean(v)
		}
		return a
	case []any:
		a := make([]any, len(x))
		for i, v := range x {
			a[i] = clean(v)
		}
		return a
	}
	return v
}

var ErrNotFound = errors.New("항목을 찾을 수 없습니다")

type Store struct {
	db *sql.DB
	mu sync.Mutex
}
type Record struct {
	Kind, ID, Project string
	Order             int
	Data              Object
}

func OpenStore(root string) (*Store, error) {
	db, err := sql.Open("sqlite", filepath.Join(root, "sola-go.db"))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	for _, q := range []string{"PRAGMA journal_mode=WAL", "PRAGMA busy_timeout=10000", "PRAGMA foreign_keys=ON", `CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,project TEXT NOT NULL DEFAULT '',ord INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL,PRIMARY KEY(kind,id))`, `CREATE INDEX IF NOT EXISTS entities_project ON entities(kind,project,ord)`, `CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL)`} {
		if _, err = db.Exec(q); err != nil {
			db.Close()
			return nil, err
		}
	}
	return &Store{db: db}, nil
}
func (s *Store) Close() error { return s.db.Close() }
func (s *Store) Get(kind, id string) (Object, error) {
	var raw string
	err := s.db.QueryRow("SELECT data FROM entities WHERE kind=? AND id=?", kind, id).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	var data Object
	err = json.Unmarshal([]byte(raw), &data)
	return data, err
}
func (s *Store) List(kind, project string) ([]Object, error) {
	query := "SELECT data FROM entities WHERE kind=?"
	args := []any{kind}
	if project != "*" {
		query += " AND project=?"
		args = append(args, project)
	}
	query += " ORDER BY ord,id"
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Object{}
	for rows.Next() {
		var raw string
		var data Object
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &data); err != nil {
			return nil, err
		}
		out = append(out, data)
	}
	return out, rows.Err()
}
func (s *Store) Put(kind, id, project string, order int, data Object) error {
	return s.Batch([]Record{{kind, id, project, order, data}})
}
func (s *Store) Batch(records []Record) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, r := range records {
		raw, e := json.Marshal(r.Data)
		if e != nil {
			return e
		}
		if _, err = tx.Exec(`INSERT INTO entities(kind,id,project,ord,data) VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET project=excluded.project,ord=excluded.ord,data=excluded.data`, r.Kind, r.ID, r.Project, r.Order, string(raw)); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (s *Store) Update(kind, id string, fn func(Object) error) (Object, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var raw string
	var order int
	if err = tx.QueryRow("SELECT data,ord FROM entities WHERE kind=? AND id=?", kind, id).Scan(&raw, &order); errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, err
	}
	var data Object
	if err = json.Unmarshal([]byte(raw), &data); err != nil {
		return nil, err
	}
	if err = fn(data); err != nil {
		return nil, err
	}
	data["updated_at"] = now()
	b, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	if kind == "page" {
		order = num(data, "order_index")
	}
	if kind == "asset" {
		order = num(data, "sort_order")
	}
	_, err = tx.Exec("UPDATE entities SET data=?,ord=? WHERE kind=? AND id=?", string(b), order, kind, id)
	if err != nil {
		return nil, err
	}
	return data, tx.Commit()
}
func (s *Store) Delete(kind, id string) error {
	_, err := s.db.Exec("DELETE FROM entities WHERE kind=? AND id=?", kind, id)
	return err
}
func (s *Store) DeleteProject(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec("DELETE FROM entities WHERE (kind='project' AND id=?) OR project=?", id, id); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) RemovePages(project string, pages []Object) error {
	versions, err := s.List("version", project)
	if err != nil {
		return err
	}
	for _, p := range pages {
		for _, version := range versions {
			if str(version, "page_id") == str(p, "page_id") {
				if err := s.Delete("version", str(version, "version_id")); err != nil {
					return err
				}
			}
		}
		if err := s.Delete("page", str(p, "page_id")); err != nil {
			return err
		}
	}
	return nil
}
func sortedRecent(items []Object) {
	sort.SliceStable(items, func(i, j int) bool { return str(items[i], "updated_at") > str(items[j], "updated_at") })
}
func required(o Object, key string) error {
	if str(o, key) == "" {
		return fmt.Errorf("%s 항목을 입력하세요", key)
	}
	return nil
}
