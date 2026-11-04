package backend

import (
	"bufio"
	"crypto/rand"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Config is process-local. Credentials are never persisted in the project database.
type Config struct {
	DataDir, Endpoint, APIKey, APIVersion, TextDeployment, ImageDeployment, CaptionDeployment, TTSDeployment string
	OCRLanguages, Tesseract, FFmpeg, FFprobe, PDFText, PDFRender, Office                                     string
	AllowTestHTTP                                                                                            bool
	Timeout                                                                                                  time.Duration
	MaxUpload                                                                                                int64
	MaxPages                                                                                                 int
}

func DefaultDataDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	return filepath.Join(base, "SolA")
}

func LoadEnvFile(path string) error {
	file, err := os.Open(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 4096), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(strings.TrimPrefix(scanner.Text(), "\ufeff"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(strings.TrimPrefix(line, "export "), "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if len(value) >= 2 && ((value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'')) {
			value = value[1 : len(value)-1]
		}
		if _, set := os.LookupEnv(key); !set {
			if err := os.Setenv(key, value); err != nil {
				return err
			}
		}
	}
	return scanner.Err()
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
func secret(key string) (string, error) {
	if path := os.Getenv(key + "_FILE"); path != "" {
		v, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("%s_FILE 설정 파일을 읽을 수 없습니다", key)
		}
		return strings.TrimSpace(string(v)), nil
	}
	return os.Getenv(key), nil
}

func NewConfig(data string, testHTTP bool) (Config, error) {
	if data == "" {
		data = env("SOLA_DATA_DIR", DefaultDataDir())
	}
	data, err := filepath.Abs(data)
	if err != nil {
		return Config{}, err
	}
	if err = os.MkdirAll(data, 0700); err != nil {
		return Config{}, err
	}
	if err = LoadEnvFile(filepath.Join(data, "settings.env")); err != nil {
		return Config{}, err
	}
	if path := os.Getenv("CORPORATE_CA_FILE"); path != "" {
		pem, e := os.ReadFile(path)
		if e != nil {
			return Config{}, fmt.Errorf("CORPORATE_CA_FILE 인증서 파일을 읽을 수 없습니다: %w", e)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(pem) {
			return Config{}, errors.New("CORPORATE_CA_FILE에 유효한 PEM 인증서가 없습니다")
		}
	}
	key, err := secret("AZURE_OPENAI_API_KEY")
	if err != nil {
		return Config{}, err
	}
	cfg := Config{DataDir: data, Endpoint: strings.TrimRight(os.Getenv("AZURE_OPENAI_ENDPOINT"), "/"), APIKey: key,
		APIVersion: env("AZURE_OPENAI_API_VERSION", "v1"), TextDeployment: env("AZURE_OPENAI_DEPLOYMENT", "gpt-5.5"),
		ImageDeployment: env("AZURE_OPENAI_IMAGE_DEPLOYMENT", "gpt-image-2"), CaptionDeployment: os.Getenv("AZURE_OPENAI_CAPTION_DEPLOYMENT"), TTSDeployment: os.Getenv("AZURE_OPENAI_TTS_DEPLOYMENT"),
		OCRLanguages: env("OCR_LANGUAGES", "kor+eng"), Tesseract: env("TESSERACT_CMD", "tesseract"), FFmpeg: env("FFMPEG_PATH", "ffmpeg"), FFprobe: env("FFPROBE_PATH", "ffprobe"),
		PDFText: env("PDFTOTEXT_PATH", "pdftotext"), PDFRender: env("PDFTOPPM_PATH", "pdftoppm"), Office: env("LIBREOFFICE_PATH", "soffice"), AllowTestHTTP: testHTTP, Timeout: 480 * time.Second, MaxUpload: 64 << 20, MaxPages: 100}
	cfg.Tesseract = resolveTool(cfg.Tesseract, filepath.Join(os.Getenv("ProgramFiles"), "Tesseract-OCR", "tesseract.exe"))
	cfg.Office = resolveTool(cfg.Office, filepath.Join(os.Getenv("ProgramFiles"), "LibreOffice", "program", "soffice.exe"))
	if cfg.CaptionDeployment == "" {
		cfg.CaptionDeployment = cfg.TextDeployment
	}
	if raw := os.Getenv("AZURE_OPENAI_TIMEOUT"); raw != "" {
		v, e := strconv.Atoi(raw)
		if e != nil || v < 5 || v > 1800 {
			return cfg, errors.New("AZURE_OPENAI_TIMEOUT은 5~1800초로 설정하세요")
		}
		cfg.Timeout = time.Duration(v) * time.Second
	}
	if cfg.Endpoint != "" {
		if err = cfg.validateEndpoint(); err != nil {
			return cfg, err
		}
	}
	for _, name := range []string{"DOCUMENT_PARSER", "OCR_PROVIDER"} {
		if v := os.Getenv(name); v != "" && v != "local" {
			return cfg, fmt.Errorf("%s는 local만 지원합니다", name)
		}
	}
	return cfg, nil
}

func (c Config) validateEndpoint() error {
	u, err := url.Parse(c.Endpoint)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return errors.New("Azure 엔드포인트 형식이 올바르지 않습니다")
	}
	if u.Scheme != "https" && !(c.AllowTestHTTP && u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost")) {
		return errors.New("Azure 엔드포인트는 HTTPS여야 합니다")
	}
	return nil
}
func (c Config) configured(role string) error {
	if c.Endpoint == "" || c.APIKey == "" {
		return errors.New("settings.env에 사내 Azure 엔드포인트와 API 키를 설정하세요")
	}
	if role == "tts" && c.TTSDeployment == "" {
		return errors.New("Azure TTS 배포 이름을 설정하세요")
	}
	return c.validateEndpoint()
}
func uid() string {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	h := hex.EncodeToString(b)
	return h[:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]
}
func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func resolveTool(name string, candidates ...string) string {
	if path, e := exec.LookPath(name); e == nil {
		return path
	}
	if filepath.IsAbs(name) {
		return name
	}
	if exe, e := os.Executable(); e == nil {
		candidates = append([]string{filepath.Join(filepath.Dir(exe), "tools", name), filepath.Join(filepath.Dir(exe), "tools", name+".exe")}, candidates...)
	}
	for _, path := range candidates {
		if filepath.IsAbs(path) {
			if info, e := os.Stat(path); e == nil && info.Mode().IsRegular() {
				return path
			}
		}
	}
	return name
}
