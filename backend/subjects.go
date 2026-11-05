package backend

import (
	"context"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"path/filepath"
)

type exportGraphic struct {
	Path   string
	Bounds image.Rectangle
}

// removeBorderBackground removes only a connected, nearly uniform border
// colour. Interior highlights stay opaque; complex photos retain their pixels.
func removeBorderBackground(source image.Image) *image.NRGBA {
	b := source.Bounds()
	out := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(out, out.Bounds(), source, b.Min, draw.Src)
	if b.Empty() {
		return out
	}
	corners := []color.NRGBA{out.NRGBAAt(0, 0), out.NRGBAAt(b.Dx()-1, 0), out.NRGBAAt(0, b.Dy()-1), out.NRGBAAt(b.Dx()-1, b.Dy()-1)}
	distance := func(a, b color.NRGBA) int {
		r, g, bl := int(a.R)-int(b.R), int(a.G)-int(b.G), int(a.B)-int(b.B)
		return r*r + g*g + bl*bl
	}
	background := corners[0]
	for _, c := range corners[1:] {
		if distance(background, c) > 1200 {
			return out
		}
	}
	width, height := out.Bounds().Dx(), out.Bounds().Dy()
	visited := make([]bool, width*height)
	queue := make([]int, 0, width*2+height*2)
	add := func(x, y int) {
		if x < 0 || y < 0 || x >= width || y >= height {
			return
		}
		idx := y*width + x
		if visited[idx] {
			return
		}
		visited[idx] = true
		if distance(out.NRGBAAt(x, y), background) <= 1200 {
			queue = append(queue, idx)
		}
	}
	for x := 0; x < width; x++ {
		add(x, 0)
		add(x, height-1)
	}
	for y := 0; y < height; y++ {
		add(0, y)
		add(width-1, y)
	}
	for head := 0; head < len(queue); head++ {
		idx := queue[head]
		x, y := idx%width, idx/width
		c := out.NRGBAAt(x, y)
		c.A = 0
		out.SetNRGBA(x, y, c)
		add(x-1, y)
		add(x+1, y)
		add(x, y-1)
		add(x, y+1)
	}
	return out
}
func (s *Server) extractGraphics(ctx context.Context, originalPath, folder string, index int, img image.Image) ([]exportGraphic, []image.Rectangle, error) {
	b := img.Bounds()
	prompt := fmt.Sprintf("Identify separate visual objects (icons, charts, diagrams, photographs) in this presentation slide. Do not select text-only regions or the full background. Image dimensions: %d x %d pixels. Return ONLY JSON {\"elements\":[{\"x\":integer,\"y\":integer,\"width\":integer,\"height\":integer}]}. Use original pixel coordinates, at most 24 nonoverlapping objects. Return an empty array when there are no suitable objects.", b.Dx(), b.Dy())
	raw, e := s.text(ctx, prompt, []string{originalPath}, nil)
	if e != nil {
		return nil, nil, e
	}
	var data Object
	if e = extractJSON(raw, &data); e != nil {
		return nil, nil, e
	}
	elements := items(data["elements"])
	if len(elements) > 24 {
		return nil, nil, bad("추출할 시각 요소가 24개를 초과합니다.")
	}
	graphics := []exportGraphic{}
	boxes := []image.Rectangle{}
	for j, element := range elements {
		x, y, width, height := num(element, "x"), num(element, "y"), num(element, "width"), num(element, "height")
		box := image.Rect(x, y, x+width, y+height)
		if width < 8 || height < 8 || !box.In(b) || width*height > b.Dx()*b.Dy()*8/10 {
			return nil, nil, bad("모델이 반환한 시각 요소 영역을 확인할 수 없습니다.")
		}
		overlaps := false
		for _, prior := range boxes {
			if !prior.Intersect(box).Empty() {
				overlaps = true
				break
			}
		}
		if overlaps {
			continue
		}
		crop := image.NewNRGBA(image.Rect(0, 0, width, height))
		draw.Draw(crop, crop.Bounds(), img, box.Min, draw.Src)
		path := filepath.Join(folder, fmt.Sprintf("graphic-%d-%d.png", index, j))
		if e = writePNG(path, removeBorderBackground(crop)); e != nil {
			return nil, nil, e
		}
		graphics = append(graphics, exportGraphic{path, box})
		boxes = append(boxes, box)
	}
	return graphics, boxes, nil
}
