// sola-verify validates actual exported files with ZIP/XML and independent
// Poppler/LibreOffice readers. It never calls the application's export writer.
package main

import (
	"archive/zip"
	"encoding/xml"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

func verify(file, kind string, count int) error {
	if kind == "pdf" {
		return pdfPages(file, count)
	}
	z, e := zip.OpenReader(file)
	if e != nil {
		return e
	}
	defer z.Close()
	counted := 0
	slides := 0
	shapes := 0
	for _, f := range z.File {
		r, e := f.Open()
		if e != nil {
			return e
		}
		raw, e := io.ReadAll(io.LimitReader(r, 128<<20))
		r.Close()
		if e != nil {
			return e
		}
		if kind == "images" && !f.FileInfo().IsDir() {
			counted++
			continue
		}
		if strings.HasSuffix(f.Name, ".xml") || strings.HasSuffix(f.Name, ".rels") {
			d := xml.NewDecoder(strings.NewReader(string(raw)))
			for {
				token, e := d.Token()
				if e == io.EOF {
					break
				}
				if e != nil {
					return fmt.Errorf("%s: %w", f.Name, e)
				}
				if start, ok := token.(xml.StartElement); ok {
					if f.Name == "ppt/presentation.xml" && start.Name.Local == "sldId" {
						slides++
					}
					if strings.HasPrefix(f.Name, "ppt/slides/slide") && start.Name.Local == "pic" {
						shapes++
					}
				}
			}
		}
	}
	if kind == "images" {
		if counted != count {
			return fmt.Errorf("ZIP images: got %d want %d", counted, count)
		}
		return nil
	}
	if slides != count || shapes < count {
		return fmt.Errorf("PPTX: slides=%d pictures=%d want=%d", slides, shapes, count)
	}
	// Open the actual presentation in another implementation before accepting it.
	temp, e := os.MkdirTemp("", "sola-office-verify-*")
	if e != nil {
		return e
	}
	defer os.RemoveAll(temp)
	profile := filepath.ToSlash(filepath.Join(temp, "profile"))
	if !strings.HasPrefix(profile, "/") {
		profile = "/" + profile
	}
	profileURL := (&url.URL{Scheme: "file", Path: profile}).String()
	out, e := exec.Command("soffice", "-env:UserInstallation="+profileURL, "--headless", "--convert-to", "pdf", "--outdir", temp, file).CombinedOutput()
	if e != nil {
		return fmt.Errorf("LibreOffice: %w %s", e, out)
	}
	return pdfPages(filepath.Join(temp, strings.TrimSuffix(filepath.Base(file), filepath.Ext(file))+".pdf"), count)
}
func pdfPages(file string, count int) error {
	out, e := exec.Command("pdfinfo", file).CombinedOutput()
	if e != nil {
		return fmt.Errorf("pdfinfo: %w %s", e, out)
	}
	match := regexp.MustCompile(`(?m)^Pages:\s+(\d+)`).FindStringSubmatch(string(out))
	if len(match) != 2 {
		return errors.New("PDF page count missing")
	}
	n, _ := strconv.Atoi(match[1])
	if n != count {
		return fmt.Errorf("PDF pages: got %d want %d", n, count)
	}
	return nil
}
func main() {
	kind := flag.String("kind", "pptx", "pptx, pdf or images")
	count := flag.Int("count", 1, "Expected page/image count")
	flag.Parse()
	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: sola-verify -kind pptx -count 2 file")
		os.Exit(2)
	}
	file, e := filepath.Abs(flag.Arg(0))
	if e == nil {
		e = verify(file, *kind, *count)
	}
	if e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
	fmt.Println("Export verified")
}
