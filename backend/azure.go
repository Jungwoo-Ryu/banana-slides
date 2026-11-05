package backend

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Azure struct {
	cfg    Config
	client *http.Client
}
type AzureError struct {
	Status                   int
	Code, RequestID, Message string
}

func (e *AzureError) Error() string {
	return fmt.Sprintf("Azure 요청 실패 (HTTP %d, %s): %s", e.Status, e.Code, e.Message)
}
func NewAzure(c Config) *Azure {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if path := os.Getenv("CORPORATE_CA_FILE"); path != "" {
		pool, _ := x509.SystemCertPool()
		if pool == nil {
			pool = x509.NewCertPool()
		}
		if pem, e := os.ReadFile(path); e == nil && pool.AppendCertsFromPEM(pem) {
			transport.TLSClientConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
		}
	}
	return &Azure{c, &http.Client{Transport: transport, Timeout: c.Timeout, CheckRedirect: func(*http.Request, []*http.Request) error {
		return errors.New("Azure 리디렉션은 허용하지 않습니다")
	}}}
}
func (a *Azure) safeError(err error) error {
	if err == nil {
		return nil
	}
	message := err.Error()
	if a.cfg.APIKey != "" {
		message = strings.ReplaceAll(message, a.cfg.APIKey, "[redacted]")
	}
	if len(message) > 2000 {
		message = message[:2000]
	}
	return errors.New(message)
}
func (a *Azure) endpoint(operation, deployment string) string {
	root := strings.TrimRight(a.cfg.Endpoint, "/")
	if a.cfg.APIVersion == "v1" {
		if !strings.HasSuffix(root, "/openai/v1") {
			root += "/openai/v1"
		}
		return root + "/" + operation
	}
	root = strings.TrimSuffix(root, "/openai")
	return root + "/openai/deployments/" + url.PathEscape(deployment) + "/" + operation + "?api-version=" + url.QueryEscape(a.cfg.APIVersion)
}
func (a *Azure) request(ctx context.Context, operation, deployment, contentType string, body []byte) (*http.Response, error) {
	if err := a.cfg.configured("text"); err != nil {
		return nil, err
	}
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequestWithContext(ctx, "POST", a.endpoint(operation, deployment), bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("api-key", a.cfg.APIKey)
		req.Header.Set("Content-Type", contentType)
		response, err := a.client.Do(req)
		if err != nil {
			return nil, a.safeError(err)
		}
		if response.StatusCode >= 200 && response.StatusCode < 300 {
			return response, nil
		}
		raw, _ := io.ReadAll(io.LimitReader(response.Body, 8192))
		response.Body.Close()
		var result struct {
			Error struct{ Code, Message string }
		}
		_ = json.Unmarshal(raw, &result)
		e := &AzureError{response.StatusCode, result.Error.Code, response.Header.Get("x-request-id"), result.Error.Message}
		if e.Message == "" {
			e.Message = http.StatusText(response.StatusCode)
		}
		if a.cfg.APIKey != "" {
			e.Message = strings.ReplaceAll(e.Message, a.cfg.APIKey, "[redacted]")
		}
		if response.StatusCode == http.StatusNotFound && strings.HasPrefix(operation, "images/") {
			e.Message += " AZURE_OPENAI_IMAGE_DEPLOYMENT와 엔드포인트를 확인하세요."
		}
		if attempt == 2 || (response.StatusCode != 429 && response.StatusCode != 503 && response.StatusCode != 502) {
			return nil, e
		}
		delay := time.Duration(1<<attempt) * time.Second
		if n, err := strconv.Atoi(response.Header.Get("Retry-After")); err == nil && n > 0 && n <= 30 {
			delay = time.Duration(n) * time.Second
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(delay):
		}
	}
	return nil, errors.New("Azure 재시도 횟수를 초과했습니다")
}
func (a *Azure) Text(ctx context.Context, prompt string, images []string, tokens int, chunk func(string)) (string, error) {
	content := any(prompt)
	deployment := a.cfg.TextDeployment
	if len(images) > 0 {
		deployment = a.cfg.CaptionDeployment
		parts := []any{Object{"type": "text", "text": prompt}}
		for _, path := range images {
			raw, err := os.ReadFile(path)
			if err != nil {
				return "", err
			}
			if len(raw) > 32<<20 {
				return "", bad("참고 이미지 파일이 너무 큽니다.")
			}
			mime := http.DetectContentType(raw)
			parts = append(parts, Object{"type": "image_url", "image_url": Object{"url": "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(raw)}})
		}
		content = parts
	}
	if tokens <= 0 {
		tokens = 16384
	}
	params := Object{"model": deployment, "messages": []any{Object{"role": "user", "content": content}}, "max_completion_tokens": tokens, "stream": chunk != nil}
	body, _ := json.Marshal(params)
	response, err := a.request(ctx, "chat/completions", deployment, "application/json", body)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if chunk == nil {
		var data struct {
			Choices []struct {
				Message      struct{ Content string }
				FinishReason string `json:"finish_reason"`
			}
		}
		if err = json.NewDecoder(io.LimitReader(response.Body, 16<<20)).Decode(&data); err != nil {
			return "", err
		}
		if len(data.Choices) == 0 {
			return "", errors.New("Azure 텍스트 응답이 비어 있습니다")
		}
		if data.Choices[0].FinishReason == "length" {
			return "", errors.New("모델 출력이 토큰 한도에서 중단되었습니다. 페이지 수를 줄이거나 토큰 한도를 늘리세요.")
		}
		return data.Choices[0].Message.Content, nil
	}
	var result strings.Builder
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 4096), 4<<20)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		raw := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if raw == "[DONE]" {
			break
		}
		var data struct {
			Choices []struct {
				Delta        struct{ Content string }
				FinishReason string `json:"finish_reason"`
			}
		}
		if err = json.Unmarshal([]byte(raw), &data); err != nil {
			return "", err
		}
		for _, choice := range data.Choices {
			if choice.FinishReason == "length" {
				return "", errors.New("모델 출력이 토큰 한도에서 중단되었습니다.")
			}
			if choice.Delta.Content != "" {
				result.WriteString(choice.Delta.Content)
				if result.Len() > 8<<20 {
					return "", errors.New("모델 응답이 너무 큽니다")
				}
				chunk(choice.Delta.Content)
			}
		}
	}
	return result.String(), scanner.Err()
}
func imageSize(ratio, resolution string) (string, error) {
	parts := strings.Split(ratio, ":")
	if len(parts) != 2 {
		return "", bad("이미지 비율이 올바르지 않습니다.")
	}
	w, e1 := strconv.ParseFloat(parts[0], 64)
	h, e2 := strconv.ParseFloat(parts[1], 64)
	if e1 != nil || e2 != nil || w <= 0 || h <= 0 || math.IsNaN(w) || math.IsNaN(h) || math.IsInf(w, 0) || math.IsInf(h, 0) || math.Max(w/h, h/w) > 3 {
		return "", bad("이미지 비율은 최대 3:1까지 지원합니다.")
	}
	edge := map[string]float64{"1K": 1024, "2K": 2048, "4K": 3840}[resolution]
	if edge == 0 {
		return "", bad("이미지 해상도가 올바르지 않습니다.")
	}
	scale := edge / math.Max(w, h)
	w = math.Max(16, math.Floor(w*scale/16)*16)
	h = math.Max(16, math.Floor(h*scale/16)*16)
	if w*h > 8294400 {
		scale = math.Sqrt(8294400 / (w * h))
		w = math.Floor(w*scale/16) * 16
		h = math.Floor(h*scale/16) * 16
	}
	return fmt.Sprintf("%dx%d", int(w), int(h)), nil
}
func (a *Azure) Image(ctx context.Context, prompt, ratio, resolution, quality string, refs []string) ([]byte, error) {
	if len(refs) > 16 {
		return nil, bad("참고 이미지는 최대 16개까지 사용할 수 있습니다.")
	}
	size, err := imageSize(ratio, resolution)
	if err != nil {
		return nil, err
	}
	if !oneOf(quality, "auto", "low", "medium", "high") {
		return nil, bad("이미지 품질 값이 올바르지 않습니다.")
	}
	params := Object{"model": a.cfg.ImageDeployment, "prompt": prompt, "size": size, "quality": quality, "n": 1}
	operation, contentType := "images/generations", "application/json"
	var body []byte
	if len(refs) == 0 {
		body, err = json.Marshal(params)
	} else {
		operation = "images/edits"
		var b bytes.Buffer
		writer := multipart.NewWriter(&b)
		for key, value := range params {
			_ = writer.WriteField(key, fmt.Sprint(value))
		}
		for i, path := range refs {
			if b.Len() > 96<<20 {
				return nil, bad("참고 이미지의 전체 크기를 줄이세요. 최대 96MB입니다.")
			}
			raw, e := normalizeImageFile(path)
			if e != nil {
				return nil, e
			}
			part, e := writer.CreateFormFile("image[]", fmt.Sprintf("reference-%d.png", i))
			if e != nil {
				return nil, e
			}
			if _, e = part.Write(raw); e != nil {
				return nil, e
			}
		}
		if err = writer.Close(); err != nil {
			return nil, err
		}
		body = b.Bytes()
		contentType = writer.FormDataContentType()
	}
	if err != nil {
		return nil, err
	}
	response, err := a.request(ctx, operation, a.cfg.ImageDeployment, contentType, body)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	var data struct {
		Data []struct {
			Base64 string `json:"b64_json"`
		}
	}
	if err = json.NewDecoder(io.LimitReader(response.Body, 64<<20)).Decode(&data); err != nil {
		return nil, err
	}
	if len(data.Data) == 0 || data.Data[0].Base64 == "" {
		return nil, errors.New("Azure 이미지 응답에 이미지 데이터가 없습니다")
	}
	raw, err := base64.StdEncoding.DecodeString(data.Data[0].Base64)
	if err != nil {
		return nil, err
	}
	return normalizeImageBytes(raw)
}
func (a *Azure) Speech(ctx context.Context, text, voice string, speed float64, output string) error {
	if err := a.cfg.configured("tts"); err != nil {
		return err
	}
	if len([]rune(text)) > 4000 || strings.TrimSpace(text) == "" {
		return bad("발표 스크립트는 1~4000자로 입력하세요.")
	}
	if !oneOf(voice, "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer") || speed < .5 || speed > 2 {
		return bad("음성 또는 읽기 속도가 올바르지 않습니다.")
	}
	params := Object{"model": a.cfg.TTSDeployment, "input": text, "voice": voice, "speed": speed, "response_format": "mp3"}
	if v := os.Getenv("AZURE_OPENAI_TTS_INSTRUCTIONS"); v != "" {
		params["instructions"] = v
	}
	body, _ := json.Marshal(params)
	response, err := a.request(ctx, "audio/speech", a.cfg.TTSDeployment, "application/json", body)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	file, err := os.Create(output)
	if err != nil {
		return err
	}
	_, err = io.Copy(file, io.LimitReader(response.Body, 64<<20))
	closeErr := file.Close()
	if err != nil {
		_ = os.Remove(output)
		return err
	}
	return closeErr
}
func oneOf(value string, choices ...string) bool {
	for _, choice := range choices {
		if value == choice {
			return true
		}
	}
	return false
}
func mimeFor(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	default:
		return "image/png"
	}
}
