// sola-server runs the same Go application service without the native window.
// It is intended for local integration tests and development, not public hosting.
package main

import (
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/Jungwoo-Ryu/banana-slides/wails/internal/backend"
)

func main() {
	data := flag.String("data-dir", "", "Local application data folder")
	listen := flag.String("listen", "127.0.0.1:5012", "Loopback listen address")
	noAuth := flag.Bool("no-auth", false, "Disable session auth for local tests only")
	testHTTP := flag.Bool("allow-test-http", false, "Allow a loopback HTTP Azure fixture only")
	envFile := flag.String("env-file", "", "Optional local environment file")
	importRoot := flag.String("import-legacy", "", "Import projects from an existing repository then exit")
	flag.Parse()
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
