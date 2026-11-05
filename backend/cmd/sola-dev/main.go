// sola-dev starts the Go API and Vite together, without an interpreter backend.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"syscall"
	"time"

	"github.com/Jungwoo-Ryu/banana-slides/backend"
)

func tool(directory, name string, args ...string) error {
	if runtime.GOOS == "windows" && name == "npm" {
		args = append([]string{"/d", "/c", "npm.cmd"}, args...)
		name = "cmd.exe"
	}
	command := exec.Command(name, args...)
	command.Dir, command.Stdout, command.Stderr = directory, os.Stdout, os.Stderr
	return command.Run()
}
func port(name string, fallback int) (int, error) {
	if raw := os.Getenv(name); raw != "" {
		n, e := strconv.Atoi(raw)
		if e != nil || n < 1 || n > 65535 {
			return 0, fmt.Errorf("invalid %s", name)
		}
		return n, nil
	}
	return fallback, nil
}
func run() error {
	repo := flag.String("repo", "..", "Repository root (relative to backend module)")
	noBrowser := flag.Bool("no-browser", false, "Do not open the browser")
	flag.Parse()
	root, e := filepath.Abs(*repo)
	if e != nil {
		return e
	}
	if e = backend.LoadEnvFile(filepath.Join(root, ".env")); e != nil {
		return e
	}
	apiPort, e := port("BACKEND_PORT", 5011)
	if e != nil {
		return e
	}
	uiPort, e := port("FRONTEND_PORT", 3011)
	if e != nil {
		return e
	}
	if e = tool(root, "node", "scripts/check-node.cjs"); e != nil {
		return e
	}
	front := filepath.Join(root, "frontend")
	if _, e = os.Stat(filepath.Join(front, "node_modules", "vite", "bin", "vite.js")); e != nil {
		if e = tool(front, "npm", "ci"); e != nil {
			return e
		}
	}
	runRoot := filepath.Join(root, ".runtime")
	if e = os.MkdirAll(filepath.Join(runRoot, "bin"), 0700); e != nil {
		return e
	}
	if e = os.MkdirAll(filepath.Join(runRoot, "logs"), 0700); e != nil {
		return e
	}
	executable := filepath.Join(runRoot, "bin", "sola-server")
	if runtime.GOOS == "windows" {
		executable += ".exe"
	}
	if e = tool(filepath.Join(root, "backend"), "go", "build", "-o", executable, "./cmd/sola-server"); e != nil {
		return e
	}
	data := os.Getenv("SOLA_DATA_DIR")
	if data == "" {
		data = filepath.Join(runRoot, "data")
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	commands := []*exec.Cmd{
		exec.Command(executable, "--no-auth", "--listen", fmt.Sprintf("127.0.0.1:%d", apiPort), "--data-dir", data),
		exec.Command("node", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1"),
	}
	commands[0].Dir = root
	commands[1].Dir = front
	commands[1].Env = append(os.Environ(), fmt.Sprintf("BACKEND_PORT=%d", apiPort), fmt.Sprintf("FRONTEND_PORT=%d", uiPort))
	exited := make(chan error, 2)
	for i, c := range commands {
		name := []string{"backend", "frontend"}[i]
		log, e := os.Create(filepath.Join(runRoot, "logs", name+".log"))
		if e != nil {
			return e
		}
		defer log.Close()
		c.Stdout, c.Stderr = log, log
		if e = c.Start(); e != nil {
			return e
		}
		defer c.Process.Kill()
		go func() { exited <- c.Wait() }()
	}
	client := &http.Client{Timeout: time.Second}
	uiURL := fmt.Sprintf("http://127.0.0.1:%d", uiPort)
	apiURL := fmt.Sprintf("http://127.0.0.1:%d/health", apiPort)
	ready := false
	for attempt := 0; attempt < 60; attempt++ {
		select {
		case <-ctx.Done():
			return nil
		case e := <-exited:
			return fmt.Errorf("service exited; check .runtime/logs: %v", e)
		default:
		}
		ready = true
		for _, url := range []string{apiURL, uiURL} {
			r, e := client.Get(url)
			if e != nil {
				ready = false
				break
			}
			r.Body.Close()
			if r.StatusCode != 200 {
				ready = false
			}
		}
		if ready {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if !ready {
		return errors.New("startup timed out; check .runtime/logs")
	}
	fmt.Printf("Sol.A web: %s\nGo API: %s\nLogs: %s\n", uiURL, apiURL, filepath.Join(runRoot, "logs"))
	if !*noBrowser {
		var c *exec.Cmd
		switch runtime.GOOS {
		case "windows":
			c = exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", uiURL)
		case "darwin":
			c = exec.Command("open", uiURL)
		default:
			c = exec.Command("xdg-open", uiURL)
		}
		if e := c.Run(); e != nil {
			fmt.Println("Open the URL above in your browser.")
		}
	}
	select {
	case <-ctx.Done():
		return nil
	case e := <-exited:
		return fmt.Errorf("service stopped; check .runtime/logs: %v", e)
	}
}
func main() {
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
}
