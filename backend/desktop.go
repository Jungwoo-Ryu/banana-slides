package backend

import (
	"os"
	"strings"
)

func (s *Server) ExportPath(reference string) (string, error) {
	if !strings.HasPrefix(reference, "/files/") {
		return "", bad("파일 경로를 확인하세요.")
	}
	path, e := s.uploadPath(reference)
	if e != nil {
		return "", e
	}
	info, e := os.Stat(path)
	if e != nil {
		return "", e
	}
	if !info.Mode().IsRegular() {
		return "", bad("일반 파일만 저장할 수 있습니다.")
	}
	return path, nil
}
func CopyFile(from, to string) error { return copyFile(from, to) }
