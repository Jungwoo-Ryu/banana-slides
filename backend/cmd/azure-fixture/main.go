// azure-fixture is a loopback-only protocol fixture for automated tests.
package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

type object = map[string]any

var lock sync.Mutex
var failures []int
var folder string
var audio []byte

func record(file string, data any) {
	lock.Lock()
	defer lock.Unlock()
	f, e := os.OpenFile(filepath.Join(folder, file), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if e != nil {
		log.Print(e)
		return
	}
	defer f.Close()
	_ = json.NewEncoder(f).Encode(data)
}
func respond(w http.ResponseWriter, status int, data any, content string) {
	w.Header().Set("Content-Type", content)
	w.Header().Set("x-request-id", "fixture-image-request")
	w.WriteHeader(status)
	if raw, ok := data.([]byte); ok {
		_, _ = w.Write(raw)
	} else {
		_ = json.NewEncoder(w).Encode(data)
	}
}
func description(i int) string {
	return fmt.Sprintf("--- SLIDE_TEXT ---\n회귀 검증 %d\n- 저장과 내보내기를 확인합니다.\n--- SLIDE_TEXT_END ---\nVisual assets: A simple chart\nLayout and emphasis: Navy title with gold accents\nTTS_SCRIPT: %d번 슬라이드의 자동 생성 발표 대본입니다.\n", i, i)
}
func completion(prompt string, stream bool) string {
	if strings.Contains(prompt, "ONE presentation slide") {
		index := 0
		if match := regexp.MustCompile(`"order_index":(\d+)`).FindStringSubmatch(prompt); len(match) == 2 {
			index, _ = strconv.Atoi(match[1])
		}
		return description(index+1) + "<!-- PAGE_END -->"
	}
	if strings.Contains(prompt, "slide-template visual analyst") {
		return `{"template_role":"content","layout_structure":"title-top-two-column","extracted_text":"Fixture","content_capacity":"medium","text_regions":[],"image_regions":[],"visual_density":"low","style_keywords":["clean"],"color_palette":["#102040"],"notes":"Protocol fixture"}`
	}
	if strings.Contains(prompt, "passed:boolean") {
		return `{"passed":true,"feedback":"Verified"}`
	}
	if strings.Contains(prompt, "<!-- PAGE_END -->") && strings.Contains(prompt, "TTS_SCRIPT:") {
		return "<!-- BEGIN -->\n" + description(1) + "<!-- PAGE_END -->\n" + description(2) + "<!-- PAGE_END -->\n<!-- END -->"
	}
	if strings.Contains(prompt, "TTS_SCRIPT:") {
		return description(1)
	}
	if stream {
		return "<!-- BEGIN -->\n## 회귀 검증 1\n- 저장 흐름을 확인합니다.\n## 회귀 검증 2\n- 내보내기를 확인합니다.\n<!-- END -->\n"
	}
	return `[{"title":"회귀 검증 1","points":["저장과 내보내기"]},{"title":"회귀 검증 2","points":["저장과 내보내기"]}]`
}
func handle(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		respond(w, 200, object{"ok": true}, "application/json")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 100<<20)
	body := object{}
	references := 0
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/") {
		if e := r.ParseMultipartForm(8 << 20); e != nil {
			http.Error(w, e.Error(), 400)
			return
		}
		defer r.MultipartForm.RemoveAll()
		for key, values := range r.MultipartForm.Value {
			if len(values) > 0 {
				body[key] = values[0]
			}
		}
		for _, files := range r.MultipartForm.File {
			references += len(files)
		}
	} else if e := json.NewDecoder(r.Body).Decode(&body); e != nil {
		http.Error(w, e.Error(), 400)
		return
	}
	if r.URL.Path == "/__fixture__/image-failures" {
		lock.Lock()
		failures = nil
		if values, ok := body["statuses"].([]any); ok {
			for _, v := range values {
				failures = append(failures, int(v.(float64)))
			}
		}
		lock.Unlock()
		respond(w, 200, object{"ok": true}, "application/json")
		return
	}
	if strings.HasSuffix(r.URL.Path, "/audio/speech") {
		record("speech-inputs.jsonl", object{"input": body["input"], "model": body["model"]})
		respond(w, 200, audio, "audio/mpeg")
		return
	}
	prompt, _ := body["prompt"].(string)
	if messages, ok := body["messages"].([]any); ok {
		for _, message := range messages {
			content := message.(map[string]any)["content"]
			if s, ok := content.(string); ok {
				prompt += s + "\n"
			} else if parts, ok := content.([]any); ok {
				for _, part := range parts {
					if s, ok := part.(map[string]any)["text"].(string); ok {
						prompt += s + "\n"
					}
				}
			}
		}
	}
	stream, _ := body["stream"].(bool)
	record("model-requests.jsonl", object{"path": r.URL.Path, "model": body["model"], "prompt": prompt, "references": references, "stream": stream})
	if strings.HasSuffix(r.URL.Path, "/chat/completions") {
		text := completion(prompt, stream)
		if stream {
			w.Header().Set("Content-Type", "text/event-stream")
			runes := []rune(text)
			for i := 0; i < len(runes); i += 47 {
				chunk := object{"id": "fixture", "choices": []object{{"index": 0, "delta": object{"content": string(runes[i:min(i+47, len(runes))])}, "finish_reason": nil}}}
				raw, _ := json.Marshal(chunk)
				fmt.Fprintf(w, "data: %s\n\n", raw)
				if f, ok := w.(http.Flusher); ok {
					f.Flush()
				}
			}
			fmt.Fprint(w, "data: [DONE]\n\n")
			return
		}
		respond(w, 200, object{"id": "fixture", "choices": []object{{"index": 0, "message": object{"role": "assistant", "content": text}, "finish_reason": "stop"}}}, "application/json")
		return
	}
	if strings.Contains(r.URL.Path, "/images/") {
		status := 200
		lock.Lock()
		if len(failures) > 0 {
			status = failures[0]
			failures = failures[1:]
		}
		lock.Unlock()
		if status != 200 {
			respond(w, status, object{"error": object{"code": "FixtureImageError", "message": "sk-fixture-must-not-leak"}}, "application/json")
			return
		}
		background := color.RGBA{16, 38, 62, 255}
		if strings.HasSuffix(r.URL.Path, "edits") {
			background = color.RGBA{0, 128, 128, 255}
		}
		picture := image.NewRGBA(image.Rect(0, 0, 1280, 720))
		draw.Draw(picture, picture.Bounds(), &image.Uniform{background}, image.Point{}, draw.Src)
		draw.Draw(picture, image.Rect(70, 150, 1210, 570), &image.Uniform{color.RGBA{233, 243, 255, 255}}, image.Point{}, draw.Src)
		var buffer bytes.Buffer
		_ = png.Encode(&buffer, picture)
		respond(w, 200, object{"data": []object{{"b64_json": base64.StdEncoding.EncodeToString(buffer.Bytes())}}}, "application/json")
		return
	}
	http.NotFound(w, r)
}
func main() {
	folder = os.Getenv("SOLA_E2E_FOLDER")
	if folder == "" {
		log.Fatal("SOLA_E2E_FOLDER is required")
	}
	if e := os.MkdirAll(folder, 0700); e != nil {
		log.Fatal(e)
	}
	file := filepath.Join(folder, "fixture-speech.mp3")
	if out, e := exec.Command("ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.8", "-c:a", "libmp3lame", file).CombinedOutput(); e != nil {
		log.Fatalf("audio fixture: %v %s", e, out)
	}
	var e error
	audio, e = os.ReadFile(file)
	if e != nil {
		log.Fatal(e)
	}
	log.Fatal(http.ListenAndServe("127.0.0.1:5044", http.HandlerFunc(handle)))
}
