// sola-server runs the same Go application service without the native window.
// Public deployment must be behind an authenticated gateway; local web mode
// and the default Compose publication bind only to loopback.
package main

import (
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Jungwoo-Ryu/banana-slides/backend"
)

func main() {
	data := flag.String("data-dir", "", "Local application data folder")
	listen := flag.String("listen", "127.0.0.1:5011", "HTTP listen address")
	allowNetwork := flag.Bool("allow-network", false, "Explicitly permit a container/private network listener")
	webDir := flag.String("web-dir", "", "Built frontend folder to serve from Go")
	healthcheck := flag.String("healthcheck", "", "Check this health URL and exit (container probe)")
	noAuth := flag.Bool("no-auth", false, "Disable session auth for local tests only")
	testHTTP := flag.Bool("allow-test-http", false, "Allow a loopback HTTP Azure fixture only")
	envFile := flag.String("env-file", "", "Optional local environment file")
	importRoot := flag.String("import-legacy", "", "Import projects from an existing repository then exit")
	flag.Parse()
	if *healthcheck != "" {
		client := &http.Client{Timeout: 5 * time.Second}
		response, e := client.Get(*healthcheck)
		if e != nil {
			fmt.Fprintln(os.Stderr, e)
			os.Exit(1)
		}
		response.Body.Close()
		if response.StatusCode != 200 {
			os.Exit(1)
		}
		return
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug})))
	if *envFile != "" {
		if e := backend.LoadEnvFile(*envFile); e != nil {
			panic(e)
		}
	}
	cfg, e := backend.NewConfig(*data, *testHTTP)
	if e != nil {
		panic(e)
	}
	cfg.AllowNetwork = *allowNetwork
	cfg.WebDir = *webDir
	cfg.AllowedOrigin = os.Getenv("SOLA_ALLOWED_ORIGIN")
	server, e := backend.NewServer(cfg)
	if e != nil {
		panic(e)
	}
	defer server.Close()
	if *importRoot != "" {
		result, e := server.ImportLegacy(*importRoot)
		if e != nil {
			panic(e)
		}
		fmt.Println(result)
		return
	}
	if e = server.Listen(*listen, !*noAuth); e != nil {
		panic(e)
	}
	fmt.Printf("Sol.A Go API: %s\n", server.BaseURL)
	if !*noAuth {
		fmt.Println("Session authentication enabled. Use Wails for authenticated desktop access.")
	}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
}
