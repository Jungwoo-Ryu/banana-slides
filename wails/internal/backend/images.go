package backend

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "golang.org/x/image/webp"
)

const maxImagePixels = 16_777_216

func decodeImage(raw []byte) (image.Image, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil {
		return nil, bad("지원하지 않거나 손상된 이미지입니다. PNG/JPEG/WebP/GIF를 사용하세요.")
	}
	if cfg.Width < 1 || cfg.Height < 1 || int64(cfg.Width)*int64(cfg.Height) > maxImagePixels {
		return nil, bad("이미지는 최대 1600만 픽셀까지 지원합니다.")
	}
	img, _, err := image.Decode(bytes.NewReader(raw))
	return img, err
}
func normalizeImageBytes(raw []byte) ([]byte, error) {
	img, err := decodeImage(raw)
	if err != nil {
		return nil, err
	}
	var out bytes.Buffer
	err = png.Encode(&out, img)
	return out.Bytes(), err
}
func normalizeImageFile(path string) ([]byte, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return normalizeImageBytes(raw)
}
func atomicFile(path string, raw []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".sola-*")
	if err != nil {
		return err
	}
	temporary := f.Name()
	defer os.Remove(temporary)
	if _, err = f.Write(raw); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(temporary, path)
}
func (s *Server) savePart(header *multipart.FileHeader, directory string, asImage bool) (string, string, error) {
	if header == nil {
		return "", "", bad("파일을 선택하세요.")
	}
	file, err := header.Open()
	if err != nil {
		return "", "", err
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, s.Config.MaxUpload+1))
	if err != nil {
		return "", "", err
	}
	if int64(len(raw)) > s.Config.MaxUpload {
		return "", "", bad("파일 크기가 64MB를 초과합니다.")
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if asImage {
		raw, err = normalizeImageBytes(raw)
		ext = ".png"
	} else if !oneOf(ext, ".pdf", ".pptx", ".ppt", ".docx", ".xlsx", ".xls", ".txt", ".md", ".csv") {
		return "", "", bad("지원하지 않는 문서 형식입니다.")
	}
	if err != nil {
		return "", "", err
	}
	relative := filepath.ToSlash(filepath.Join(directory, uid()+ext))
	path, err := s.uploadPath(relative)
	if err != nil {
		return "", "", err
	}
	err = atomicFile(path, raw)
	return relative, header.Filename, err
}
func (s *Server) form(r *http.Request) error {
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		return bad("업로드 요청을 읽을 수 없습니다. 파일 크기와 형식을 확인하세요.")
	}
	return nil
}
func (s *Server) upload(r *http.Request, field, directory string, asImage bool) (string, string, error) {
	if r.MultipartForm == nil {
		if err := s.form(r); err != nil {
			return "", "", err
		}
	}
	files := r.MultipartForm.File[field]
	if len(files) == 0 {
		return "", "", bad("파일을 선택하세요.")
	}
	return s.savePart(files[0], directory, asImage)
}
func (s *Server) saveImage(project, page string, raw []byte) (Object, error) {
	s.imageMu.Lock()
	defer s.imageMu.Unlock()
	p, err := s.Store.Get("page", page)
	if err != nil {
		return nil, err
	}
	if str(p, "project_id") != project {
		return nil, ErrNotFound
	}
	versions, err := s.Store.List("version", project)
	if err != nil {
		return nil, err
	}
	next := 1
	records := []Record{}
	for _, version := range versions {
		if str(version, "page_id") == page {
			if num(version, "version_number") >= next {
				next = num(version, "version_number") + 1
			}
			version["is_current"] = false
			records = append(records, Record{"version", str(version, "version_id"), project, num(version, "version_number"), version})
		}
	}
	id := uid()
	relative := project + "/pages/" + page + "-" + id + ".png"
	path, _ := s.uploadPath(relative)
	if err = atomicFile(path, raw); err != nil {
		return nil, err
	}
	version := Object{"version_id": id, "page_id": page, "project_id": project, "version_number": next, "is_current": true, "image_url": "/files/" + relative, "image_path": relative, "created_at": now()}
	p["_image"] = relative
	p["generated_image_url"] = "/files/" + relative
	p["status"] = "COMPLETED"
	p["updated_at"] = now()
	records = append(records, Record{"version", id, project, next, version}, Record{"page", page, project, num(p, "order_index"), p})
	if err = s.Store.Batch(records); err != nil {
		_ = os.Remove(path)
		return nil, err
	}
	return p, nil
}
func (s *Server) referencePath(ctx context.Context, reference string) (string, func(), error) {
	reference = strings.TrimSpace(reference)
	if strings.HasPrefix(reference, "/files/") {
		path, err := s.uploadPath(strings.Split(reference, "?")[0])
		return path, func() {}, err
	}
	u, err := url.Parse(reference)
	if err != nil || !oneOf(u.Scheme, "https", "http") {
		return "", func() {}, bad("참고 이미지 경로가 올바르지 않습니다.")
	}
	raw, err := fetchPublicImage(ctx, reference)
	if err != nil {
		return "", func() {}, err
	}
	raw, err = normalizeImageBytes(raw)
	if err != nil {
		return "", func() {}, err
	}
	f, err := os.CreateTemp("", "sola-reference-*.png")
	if err != nil {
		return "", func() {}, err
	}
	path := f.Name()
	if _, err = f.Write(raw); err == nil {
		err = f.Close()
	} else {
		f.Close()
	}
	if err != nil {
		os.Remove(path)
		return "", func() {}, err
	}
	return path, func() { os.Remove(path) }, nil
}
func fetchPublicImage(ctx context.Context, address string) ([]byte, error) {
	transport := &http.Transport{Proxy: nil, DialContext: func(ctx context.Context, network, hostport string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(hostport)
		if err != nil {
			return nil, err
		}
		addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}
		for _, addr := range addresses {
			ip := addr.IP
			if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
				return nil, bad("내부 네트워크 이미지 주소는 가져올 수 없습니다.")
			}
		}
		if len(addresses) == 0 {
			return nil, errors.New("이미지 서버를 찾을 수 없습니다")
		}
		return (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, network, net.JoinHostPort(addresses[0].IP.String(), port))
	}}
	defer transport.CloseIdleConnections()
	client := http.Client{Transport: transport, Timeout: 30 * time.Second, CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if len(via) > 3 || r.URL.User != nil || !oneOf(r.URL.Scheme, "http", "https") {
			return bad("이미지 리디렉션을 허용하지 않습니다.")
		}
		return nil
	}}
	u, err := url.Parse(address)
	if err != nil || u.User != nil {
		return nil, bad("이미지 URL이 올바르지 않습니다.")
	}
	req, err := http.NewRequestWithContext(ctx, "GET", address, nil)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return nil, fmt.Errorf("이미지를 가져올 수 없습니다 (HTTP %d)", response.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 32<<20+1))
	if len(raw) > 32<<20 {
		return nil, bad("참고 이미지가 너무 큽니다.")
	}
	return raw, err
}

type OCRLine struct {
	Text       string
	X, Y, W, H int
	Confidence float64
}

// RestoreRegions propagates boundary colours into text masks, then smooths only
// the replaced pixels. The source and every unselected pixel remain unchanged.
func RestoreRegions(source image.Image, boxes []image.Rectangle) image.Image {
	b := source.Bounds()
	out := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(out, out.Bounds(), source, b.Min, draw.Src)
	for _, box := range boxes {
		box = box.Intersect(out.Bounds())
		if box.Empty() {
			continue
		}
		left, right, top, bottom := box.Min.X, box.Max.X-1, box.Min.Y, box.Max.Y-1
		for y := top; y <= bottom; y++ {
			for x := left; x <= right; x++ {
				dist := []int{x - left, right - x, y - top, bottom - y}
				points := []image.Point{{max(0, left-1), y}, {min(out.Bounds().Dx()-1, right+1), y}, {x, max(0, top-1)}, {x, min(out.Bounds().Dy()-1, bottom+1)}}
				best := 0
				for i := 1; i < 4; i++ {
					if dist[i] < dist[best] {
						best = i
					}
				}
				out.SetNRGBA(x, y, out.NRGBAAt(points[best].X, points[best].Y))
			}
		}
		for pass := 0; pass < 8; pass++ {
			copyImage := image.NewNRGBA(box)
			draw.Draw(copyImage, box, out, box.Min, draw.Src)
			for y := top + 1; y < bottom; y++ {
				for x := left + 1; x < right; x++ {
					a, b, c, d := copyImage.NRGBAAt(x-1, y), copyImage.NRGBAAt(x+1, y), copyImage.NRGBAAt(x, y-1), copyImage.NRGBAAt(x, y+1)
					out.SetNRGBA(x, y, color.NRGBA{uint8((int(a.R) + int(b.R) + int(c.R) + int(d.R)) / 4), uint8((int(a.G) + int(b.G) + int(c.G) + int(d.G)) / 4), uint8((int(a.B) + int(b.B) + int(c.B) + int(d.B)) / 4), 255})
				}
			}
		}
	}
	return out
}
