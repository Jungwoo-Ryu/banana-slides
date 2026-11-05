package backend

import "net/http"

type response struct {
	status int
	data   any
}

func created(v any) response  { return response{201, v} }
func accepted(v any) response { return response{202, v} }
func (s *Server) routes() {
	if s.Config.WebDir != "" {
		s.mux.Handle("GET /", webAssets(s.Config.WebDir))
	}
	s.mux.HandleFunc("GET /files/{path...}", s.serveFile)
	s.handle("GET /health", func(http.ResponseWriter, *http.Request) (any, error) {
		return Object{"status": "ok", "runtime": "go", "version": "desktop-preview"}, nil
	})
	s.handle("GET /api/access-code/check", func(http.ResponseWriter, *http.Request) (any, error) { return Object{"enabled": false}, nil })
	s.handle("POST /api/access-code/verify", func(http.ResponseWriter, *http.Request) (any, error) { return Object{"valid": true}, nil })
	s.handle("GET /api/output-language", func(http.ResponseWriter, *http.Request) (any, error) {
		return Object{"language": s.preferences()["output_language"]}, nil
	})
	s.handle("GET /api/desktop/tools", func(w http.ResponseWriter, r *http.Request) (any, error) {
		health, e := s.toolHealth(r.Context())
		if e != nil {
			health["ocr_error"] = e.Error()
		}
		return health, nil
	})
	for _, method := range []string{"GET", "PUT", "PATCH"} {
		s.handle(method+" /api/settings", s.settings)
	}
	s.handle("POST /api/settings/reset", s.settings)
	s.handle("GET /api/settings/active-config", s.settings)
	s.handle("POST /api/settings/verify", func(http.ResponseWriter, *http.Request) (any, error) {
		e := s.Config.configured("text")
		message := "텍스트 모델 설정을 확인했습니다."
		if e != nil {
			message = e.Error()
		}
		return Object{"available": e == nil, "message": message}, nil
	})
	s.handle("POST /api/settings/tests/{name}", s.settingsTest)
	s.handle("GET /api/settings/tests/{task}/status", s.settingsTestStatus)
	s.handle("GET /api/projects", s.listProjects)
	s.handle("POST /api/projects", s.createProject)
	s.handle("POST /api/projects/renovation", s.renovation)
	s.handle("GET /api/projects/{project}", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return s.fullProject(r.PathValue("project"))
	})
	s.handle("PUT /api/projects/{project}", s.updateProject)
	s.handle("DELETE /api/projects/{project}", s.deleteProject)
	s.handle("POST /api/projects/{project}/pages", s.createPages)
	s.handle("POST /api/projects/{project}/pages/batch", s.createPages)
	s.handle("DELETE /api/projects/{project}/pages/{page}", s.deletePage)
	for _, suffix := range []string{"", "/outline", "/description", "/narration"} {
		s.handle("PUT /api/projects/{project}/pages/{page}"+suffix, s.updatePage)
	}
	for _, suffix := range []string{"/generate/outline", "/generate/from-description", "/refine/outline"} {
		s.handle("POST /api/projects/{project}"+suffix, s.generateOutline)
	}
	s.mux.HandleFunc("POST /api/projects/{project}/generate/outline/stream", s.generationStream)
	s.mux.HandleFunc("POST /api/projects/{project}/generate/descriptions/stream", s.generationStream)
	for _, suffix := range []string{"/generate/descriptions", "/refine/descriptions", "/pages/{page}/generate/description"} {
		s.handle("POST /api/projects/{project}"+suffix, s.generateDescriptions)
	}
	for _, suffix := range []string{"/generate/images", "/pages/{page}/generate/image", "/pages/{page}/edit/image", "/pages/{page}/regenerate-renovation"} {
		s.handle("POST /api/projects/{project}"+suffix, s.generateImages)
	}
	for _, suffix := range []string{"/generate/narrations", "/pages/{page}/generate/narration"} {
		s.handle("POST /api/projects/{project}"+suffix, s.generateNarration)
	}
	s.handle("GET /api/projects/{project}/tasks/{task}", s.taskStatus)
	s.handle("GET /api/projects/{project}/pages/{page}/image-versions", s.versions)
	s.handle("POST /api/projects/{project}/pages/{page}/image-versions/{version}/set-current", s.restoreVersion)
	s.handle("POST /api/extract-style", s.extractStyle)
	s.handle("POST /api/generate-style-from-content", s.extractStyle)
	s.handle("POST /api/projects/{project}/template", s.legacyTemplate)
	s.handle("DELETE /api/projects/{project}/template", s.legacyTemplate)
	s.handle("GET /api/projects/templates", func(http.ResponseWriter, *http.Request) (any, error) { return Object{"templates": []Object{}}, nil })
	for _, path := range []string{"/api/user-templates", "/api/user-style-templates"} {
		for _, method := range []string{"GET", "POST"} {
			s.handle(method+" "+path, s.userTemplate)
		}
		s.handle("DELETE "+path+"/{id}", s.userTemplate)
	}
	s.handle("GET /api/projects/{project}/template-assets", s.assetList)
	for _, suffix := range []string{"/template-assets", "/template-assets/upload-pdf", "/template-mode/single-with-upload"} {
		s.handle("POST /api/projects/{project}"+suffix, s.assetUpload)
	}
	s.handle("PATCH /api/projects/{project}/template-assets/{id}", s.assetAction)
	s.handle("DELETE /api/projects/{project}/template-assets/{id}", s.assetAction)
	s.handle("POST /api/projects/{project}/template-assets/{id}/reanalyze", s.assetAction)
	s.handle("PATCH /api/projects/{project}/pages/{page}/template", s.pageTemplate)
	s.handle("PATCH /api/projects/{project}/template-mode", s.templateMode)
	s.handle("POST /api/projects/{project}/template-assets/auto-match", s.autoMatch)
	s.handle("POST /api/projects/{project}/pages/{page}/template/auto-match", s.autoMatch)
	s.handle("POST /api/reference-files/upload", s.referenceUpload)
	for _, method := range []string{"GET", "DELETE"} {
		s.handle(method+" /api/reference-files/{id}", s.referenceAction)
	}
	for _, suffix := range []string{"parse", "associate", "dissociate"} {
		s.handle("POST /api/reference-files/{id}/"+suffix, s.referenceAction)
	}
	s.handle("GET /api/reference-files/project/{project}", func(w http.ResponseWriter, r *http.Request) (any, error) {
		pid := r.PathValue("project")
		if pid == "all" {
			pid = "*"
		} else if oneOf(pid, "none", "global") {
			pid = ""
		} else if _, e := s.project(r); e != nil {
			return nil, e
		}
		all, e := s.Store.List("reference", pid)
		sortedRecent(all)
		return Object{"files": all}, e
	})
	s.handle("GET /api/materials", s.materialList)
	s.handle("GET /api/projects/{project}/materials", s.materialList)
	s.handle("POST /api/materials/upload", s.materialUpload)
	s.handle("POST /api/projects/{project}/materials/upload", s.materialUpload)
	s.handle("POST /api/materials/associate", s.materialAssociate)
	s.mux.HandleFunc("POST /api/materials/download", s.materialsZip)
	s.handle("DELETE /api/materials/{id}", s.materialAction)
	s.handle("GET /api/materials/{id}/caption", s.materialAction)
	s.handle("GET /api/materials/by-url", s.materialAction)
	s.handle("POST /api/projects/{project}/materials/generate", s.materialProcess)
	s.handle("POST /api/projects/{project}/materials/process", s.materialProcess)
	s.handle("GET /api/projects/{project}/export/{format}", s.exportFile)
	s.handle("POST /api/projects/{project}/export/editable-pptx", s.exportEditable)
	s.handle("POST /api/projects/{project}/export/video", s.exportVideo)
	s.handle("GET /api/projects/{project}/exports", s.exportList)
	s.handle("DELETE /api/projects/{project}/exports/{filename}", s.deleteExport)
}
