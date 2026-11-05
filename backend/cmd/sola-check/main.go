// sola-check enforces source language, package provenance and the Go-only backend.
package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"
)

func main() {
	root, e := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if e != nil {
		panic(e)
	}
	directory := strings.TrimSpace(string(root))
	cmd := exec.Command("git", "ls-files", "--cached", "--others", "--exclude-standard", "-z")
	cmd.Dir = directory
	raw, e := cmd.Output()
	if e != nil {
		panic(e)
	}
	issues := []string{}
	cjk := regexp.MustCompile("[\u3400-\u9fff\uf900-\ufaff\U00020000-\U0002fa1f]")
	for _, name := range strings.Split(string(raw), "\x00") {
		if name == "" {
			continue
		}
		data, e := os.ReadFile(filepath.Join(directory, name))
		if e != nil {
			continue
		}
		if strings.HasSuffix(name, ".py") || name == "uv.lock" || name == "pyproject.toml" || strings.HasPrefix(name, "desktop/") {
			issues = append(issues, name+": retired backend/runtime source")
		}
		if !utf8.Valid(data) || strings.ContainsRune(string(data), 0) {
			continue
		}
		for i, line := range strings.Split(string(data), "\n") {
			if cjk.MatchString(line) {
				issues = append(issues, fmt.Sprintf("%s:%d: use English or Korean source", name, i+1))
			}
		}
	}
	var lock struct {
		Packages map[string]struct {
			Resolved  string `json:"resolved"`
			Integrity string `json:"integrity"`
		}
	}
	data, e := os.ReadFile(filepath.Join(directory, "frontend/package-lock.json"))
	if e != nil {
		panic(e)
	}
	if e = json.Unmarshal(data, &lock); e != nil {
		panic(e)
	}
	retired := regexp.MustCompile(`(?i)mineru|baidu|volcengine|dashscope|zhipuai|lazyllm|sensenova|paddleocr|deepseek|doubao|qwen|modelscope|siliconflow|aihubmix|apimart`)
	for name, p := range lock.Packages {
		if name == "" {
			continue
		}
		u, e := url.Parse(p.Resolved)
		if e != nil || u.Scheme != "https" || u.Host != "registry.npmjs.org" || p.Integrity == "" {
			issues = append(issues, name+": package provenance/integrity missing")
		}
		if retired.MatchString(name) {
			issues = append(issues, name+": retired provider package")
		}
	}
	if len(issues) > 0 {
		fmt.Fprintln(os.Stderr, strings.Join(issues, "\n"))
		os.Exit(1)
	}
	fmt.Println("Repository checks passed: Go backend, English/Korean source, official registry integrity.")
}
