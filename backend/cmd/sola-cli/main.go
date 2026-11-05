// sola-cli exposes all Go HTTP API routes without an interpreter dependency.
package main

import (
	"bytes"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

func run() error {
	base := flag.String("base-url", "http://127.0.0.1:5011", "Go API base URL")
	method := flag.String("method", "GET", "HTTP method")
	path := flag.String("path", "/health", "API path, including optional query")
	data := flag.String("data", "", "JSON body, or @filename")
	out := flag.String("out", "", "Save response to a file instead of stdout")
	flag.Parse()
	b, e := url.Parse(*base)
	if e != nil || b.Host == "" || !((b.Scheme == "http" && (b.Hostname() == "127.0.0.1" || b.Hostname() == "localhost")) || b.Scheme == "https") {
		return fmt.Errorf("use a loopback HTTP or trusted HTTPS API address")
	}
	p, e := url.Parse(*path)
	if e != nil || p.IsAbs() || p.Host != "" || !strings.HasPrefix(p.Path, "/") {
		return fmt.Errorf("path must be an API path without a hostname")
	}
	b.Path, b.RawQuery = p.Path, p.RawQuery
	raw := []byte(*data)
	if strings.HasPrefix(*data, "@") {
		raw, e = os.ReadFile(strings.TrimPrefix(*data, "@"))
		if e != nil {
			return e
		}
	}
	r, e := http.NewRequest(strings.ToUpper(*method), b.String(), bytes.NewReader(raw))
	if e != nil {
		return e
	}
	r.Header.Set("Content-Type", "application/json")
	if token := os.Getenv("SOLA_SESSION_TOKEN"); token != "" {
		r.Header.Set("X-SolA-Session", token)
	}
	client := &http.Client{Timeout: 15 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error { return fmt.Errorf("API redirects are not allowed") }}
	response, e := client.Do(r)
	if e != nil {
		return e
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(response.Body, 8192))
		return fmt.Errorf("HTTP %d: %s", response.StatusCode, raw)
	}
	destination := io.Writer(os.Stdout)
	if *out != "" {
		file, e := os.Create(*out)
		if e != nil {
			return e
		}
		defer file.Close()
		destination = file
	}
	_, e = io.Copy(destination, response.Body)
	return e
}
func main() {
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
}
