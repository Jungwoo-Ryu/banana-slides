package backend

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// ImportLegacy copies a read-only SQLite snapshot and uploads into a separate
// namespace. Existing desktop projects and all source files remain untouched.
func (s *Server) ImportLegacy(root string) (map[string]int, error) {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	tasks, e := s.Store.List("task", "*")
	if e != nil {
		return nil, e
	}
	for _, t := range tasks {
		if oneOf(str(t, "status"), "PENDING", "PROCESSING") {
			return nil, bad("실행 중인 작업이 끝난 뒤 기존 데이터를 가져오세요.")
		}
	}
	root, e = filepath.Abs(root)
	if e != nil {
		return nil, e
	}
	matches, _ := filepath.Glob(filepath.Join(root, "backend", "instance", "*.db"))
	database := ""
	for _, p := range matches {
		if filepath.Base(p) == "banana_slides.db" {
			database = p
		}
	}
	if database == "" && len(matches) == 1 {
		database = matches[0]
	}
	if database == "" {
		return nil, errors.New("backend/instance에서 기존 SQLite 데이터베이스를 찾을 수 없습니다")
	}
	db, e := sql.Open("sqlite", fileURI(database, "mode=ro"))
	if e != nil {
		return nil, e
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	tx, e := db.Begin()
	if e != nil {
		return nil, e
	}
	defer tx.Rollback()
	tables := []struct{ name, kind string }{{"projects", "project"}, {"pages", "page"}, {"page_image_versions", "version"}, {"image_versions", "version"}, {"materials", "material"}, {"reference_files", "reference"}, {"project_template_assets", "asset"}, {"user_templates", "user-template"}, {"user_style_templates", "user-style"}, {"settings", "settings"}}
	records := []Record{}
	counts := map[string]int{}
	skipped := map[string]bool{}
	pageProjects := map[string]string{}
	prefix := "legacy-" + uid()
	sourceRoot := filepath.Join(root, "uploads")
	if _, e = os.Stat(sourceRoot); e != nil {
		return nil, errors.New("선택한 폴더에서 uploads 폴더를 찾을 수 없습니다")
	}
	targetRoot, e := s.uploadPath(prefix)
	if e != nil {
		return nil, e
	}
	committed := false
	defer func() {
		if !committed {
			os.RemoveAll(targetRoot)
		}
	}()
	mapPath := func(raw string) (string, error) {
		raw = strings.ReplaceAll(raw, "\\", "/")
		raw = strings.TrimPrefix(raw, "/files/")
		if index := strings.Index(raw, "/uploads/"); index >= 0 {
			raw = raw[index+9:]
		} else {
			raw = strings.TrimPrefix(raw, "uploads/")
		}
		if raw == "" {
			return "", nil
		}
		if !filepath.IsLocal(filepath.FromSlash(raw)) || strings.Contains(raw, ":") {
			return "", fmt.Errorf("안전하지 않은 파일 경로입니다: %s", filepath.Base(raw))
		}
		return prefix + "/" + raw, nil
	}
	for _, table := range tables {
		var exists int
		if e = tx.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", table.name).Scan(&exists); e != nil {
			return nil, e
		}
		if exists == 0 {
			continue
		}
		rows, e := tx.Query("SELECT * FROM " + table.name)
		if e != nil {
			return nil, e
		}
		cols, e := rows.Columns()
		if e != nil {
			rows.Close()
			return nil, e
		}
		for rows.Next() {
			values := make([]any, len(cols))
			ptrs := make([]any, len(cols))
			for i := range values {
				ptrs[i] = &values[i]
			}
			if e = rows.Scan(ptrs...); e != nil {
				rows.Close()
				return nil, e
			}
			data := Object{}
			for i, k := range cols {
				v := values[i]
				if b, ok := v.([]byte); ok {
					v = string(b)
				}
				if n, ok := v.(int64); ok {
					v = int(n)
				}
				data[k] = v
			}
			id := fmt.Sprint(data["id"])
			pid := str(data, "project_id")
			if table.kind == "project" {
				pid = ""
				if _, e = s.Store.Get("project", id); e == nil {
					skipped[id] = true
					counts["skipped_projects"]++
					continue
				}
			}
			if table.kind == "page" {
				pageProjects[id] = pid
			}
			if table.kind == "version" {
				pid = pageProjects[str(data, "page_id")]
				data["project_id"] = pid
			}
			if skipped[pid] {
				continue
			}
			if _, e = s.Store.Get(table.kind, id); e == nil {
				continue
			}
			for _, key := range []string{"outline_content", "description_content", "analysis_json", "description_extra_fields", "image_prompt_extra_fields"} {
				if raw := str(data, key); raw != "" {
					var decoded any
					if json.Unmarshal([]byte(raw), &decoded) == nil {
						data[key] = decoded
					}
				}
			}
			for _, key := range []string{"export_allow_partial", "enable_icon_subject_extraction", "user_edited_analysis", "is_current", "enable_image_quality_control"} {
				if value, ok := data[key].(int); ok {
					data[key] = value != 0
				}
			}
			rename := func(from, to, urlKey string) error {
				raw := str(data, from)
				if raw == "" {
					return nil
				}
				relative, e := mapPath(raw)
				if e != nil {
					return e
				}
				data[to] = relative
				if urlKey != "" {
					data[urlKey] = "/files/" + relative
				}
				return nil
			}
			switch table.kind {
			case "project":
				data["project_id"] = id
				e = rename("template_image_path", "_template", "template_image_url")
			case "page":
				data["page_id"] = id
				e = rename("generated_image_path", "_image", "generated_image_url")
			case "version":
				data["version_id"] = id
				e = rename("image_path", "image_path", "image_url")
			case "material":
				e = rename("relative_path", "relative_path", "url")
			case "reference":
				e = rename("file_path", "_file", "")
			case "asset":
				e = rename("image_path", "_file", "image_url")
				data["thumb_url"] = data["image_url"]
			case "user-template":
				data["template_id"] = id
				e = rename("file_path", "_file", "template_image_url")
				data["thumb_url"] = data["template_image_url"]
			case "settings":
				if _, existing := s.Store.Get("settings", "preferences"); existing == nil {
					continue
				}
				id = "preferences"
				settings := defaults()
				for key := range settings {
					if value, ok := data[key]; ok && value != nil {
						settings[key] = value
					}
				}
				data = settings
			}
			if e != nil {
				rows.Close()
				return nil, e
			}
			order := num(data, "order_index")
			if table.kind == "asset" {
				order = num(data, "sort_order")
			}
			if table.kind == "version" {
				order = num(data, "version_number")
			}
			records = append(records, Record{table.kind, id, pid, order, data})
			counts[table.kind]++
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return nil, e
		}
	}
	if len(records) == 0 {
		return counts, nil
	}
	var total int64
	e = filepath.WalkDir(sourceRoot, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relative, e := filepath.Rel(sourceRoot, path)
		if e != nil {
			return e
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return errors.New("uploads의 심볼릭 링크는 가져올 수 없습니다")
		}
		if entry.IsDir() {
			return os.MkdirAll(filepath.Join(targetRoot, relative), 0700)
		}
		info, e := entry.Info()
		if e != nil {
			return e
		}
		if !info.Mode().IsRegular() {
			return errors.New("일반 파일만 가져올 수 있습니다")
		}
		total += info.Size()
		if total > 20<<30 {
			return errors.New("uploads가 가져오기 한도 20GB를 초과합니다")
		}
		return copyFile(path, filepath.Join(targetRoot, relative))
	})
	if e != nil {
		return nil, e
	}
	if e = s.Store.Batch(records); e != nil {
		return nil, e
	}
	committed = true
	return counts, nil
}
