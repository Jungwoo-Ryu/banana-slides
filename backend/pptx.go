package backend

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"os"
	"strings"
)

const xmlHeader = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
const nsP = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`
const groupShape = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`

func esc(s string) string { var b bytes.Buffer; _ = xml.EscapeText(&b, []byte(s)); return b.String() }
func relationships(entries ...string) string {
	return xmlHeader + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` + strings.Join(entries, "") + `</Relationships>`
}
func rel(id, kind, target string) string {
	return `<Relationship Id="` + id + `" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/` + kind + `" Target="` + esc(target) + `"/>`
}

type exportSlide struct {
	Graphics             []exportGraphic
	Width, Height        int
	ImagePath, Narration string
	Lines                []OCRLine
	TextColours          []string
}

// writePPTX streams media to the archive so a deck does not retain every raster.
func writePPTX(path string, slides []exportSlide, ratio string, transitions []string) error {
	parts := strings.Split(ratio, ":")
	w, h := 16., 9.
	if len(parts) == 2 {
		fmt.Sscan(parts[0], &w)
		fmt.Sscan(parts[1], &h)
	}
	if w <= 0 || h <= 0 {
		return bad("슬라이드 비율을 확인하세요.")
	}
	cx, cy := int64(12192000), int64(12192000*h/w)
	file, e := os.Create(path)
	if e != nil {
		return e
	}
	archive := zip.NewWriter(file)
	var firstErr error
	put := func(name, body string) {
		if firstErr != nil {
			return
		}
		entry, e := archive.Create(name)
		if e == nil {
			_, e = io.WriteString(entry, body)
		}
		if e != nil {
			firstErr = e
		}
	}
	types := `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>`
	override := func(part, kind string) {
		types += `<Override PartName="/` + part + `" ContentType="application/vnd.openxmlformats-officedocument.presentationml.` + kind + `+xml"/>`
	}
	override("ppt/presentation.xml", "presentation.main")
	override("ppt/slideMasters/slideMaster1.xml", "slideMaster")
	override("ppt/slideLayouts/slideLayout1.xml", "slideLayout")
	override("ppt/notesMasters/notesMaster1.xml", "notesMaster")
	types += `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`
	put("_rels/.rels", relationships(rel("rId1", "officeDocument", "ppt/presentation.xml")))
	prsRels := []string{rel("rId1", "slideMaster", "slideMasters/slideMaster1.xml"), rel("rId2", "notesMaster", "notesMasters/notesMaster1.xml")}
	ids := ""
	for i, slide := range slides {
		n := i + 1
		override(fmt.Sprintf("ppt/slides/slide%d.xml", n), "slide")
		override(fmt.Sprintf("ppt/notesSlides/notesSlide%d.xml", n), "notesSlide")
		ids += fmt.Sprintf(`<p:sldId id="%d" r:id="rId%d"/>`, 255+n, n+2)
		prsRels = append(prsRels, rel(fmt.Sprintf("rId%d", n+2), "slide", fmt.Sprintf("slides/slide%d.xml", n)))
		pic := fmt.Sprintf(`<p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide image"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`, cx, cy)
		media, e := os.Open(slide.ImagePath)
		if e != nil {
			firstErr = e
			break
		}
		cfg, _, e := image.DecodeConfig(media)
		if e != nil {
			media.Close()
			firstErr = e
			break
		}
		_, e = media.Seek(0, 0)
		if e != nil {
			media.Close()
			firstErr = e
			break
		}
		entry, e := archive.Create(fmt.Sprintf("ppt/media/image%d.png", n))
		if e == nil {
			_, e = io.Copy(entry, media)
		}
		media.Close()
		if e != nil {
			firstErr = e
			break
		}
		if slide.Width > 0 && slide.Height > 0 {
			cfg.Width = slide.Width
			cfg.Height = slide.Height
		}
		slideRelationships := []string{rel("rId1", "image", fmt.Sprintf("../media/image%d.png", n)), rel("rId2", "slideLayout", "../slideLayouts/slideLayout1.xml"), rel("rId3", "notesSlide", fmt.Sprintf("../notesSlides/notesSlide%d.xml", n))}
		for j, graphic := range slide.Graphics {
			filename := fmt.Sprintf("graphic%d-%d.png", n, j)
			input, err := os.Open(graphic.Path)
			if err != nil {
				firstErr = err
				break
			}
			entry, err := archive.Create("ppt/media/" + filename)
			if err == nil {
				_, err = io.Copy(entry, input)
			}
			input.Close()
			if err != nil {
				firstErr = err
				break
			}
			rid := fmt.Sprintf("rId%d", j+4)
			slideRelationships = append(slideRelationships, rel(rid, "image", "../media/"+filename))
			b := graphic.Bounds
			pic += fmt.Sprintf(`<p:pic><p:nvPicPr><p:cNvPr id="%d" name="Visual object %d"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="%s"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="%d" y="%d"/><a:ext cx="%d" cy="%d"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`, 10000+j, j+1, rid, int64(b.Min.X)*cx/int64(cfg.Width), int64(b.Min.Y)*cy/int64(cfg.Height), int64(b.Dx())*cx/int64(cfg.Width), int64(b.Dy())*cy/int64(cfg.Height))
		}
		for j, line := range slide.Lines {
			colour := "111827"
			if j < len(slide.TextColours) {
				colour = slide.TextColours[j]
			}
			x, y, tw, th := int64(line.X)*cx/int64(cfg.Width), int64(line.Y)*cy/int64(cfg.Height), int64(line.W)*cx/int64(cfg.Width), int64(line.H)*cy/int64(cfg.Height)
			font := max(600, int(th*100/12700*8/10))
			pic += fmt.Sprintf(`<p:sp><p:nvSpPr><p:cNvPr id="%d" name="Text %d"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="%d" y="%d"/><a:ext cx="%d" cy="%d"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p><a:pPr/><a:r><a:rPr lang="ko-KR" sz="%d"><a:solidFill><a:srgbClr val="%s"/></a:solidFill><a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/></a:rPr><a:t>%s</a:t></a:r><a:endParaRPr lang="ko-KR"/></a:p></p:txBody></p:sp>`, j+3, j+1, x, y, tw, th, font, colour, esc(line.Text))
		}
		transition := ""
		if len(transitions) > 0 && transitions[i%len(transitions)] != "none" {
			effect := transitions[i%len(transitions)]
			if !oneOf(effect, "fade", "push", "wipe", "split", "cover", "uncover", "cut", "page_turn", "blinds", "checker", "wheel") {
				firstErr = bad("지원하지 않는 슬라이드 전환 효과입니다.")
				break
			}
			suffix := ""
			if oneOf(effect, "push", "wipe", "cover", "uncover") {
				suffix = ` dir="l"`
			}
			if effect == "split" {
				suffix = ` orient="horz" dir="out"`
			}
			if oneOf(effect, "blinds", "checker") {
				suffix = ` dir="horz"`
			}
			if effect == "wheel" {
				suffix = ` spokes="4"`
			}
			transition = `<p:transition spd="med"><p:` + effect + suffix + `/></p:transition>`
			if effect == "page_turn" {
				transition = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><mc:Choice Requires="p14"><p:transition spd="med"><p14:prstTrans prst="pageCurlSingle"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="med"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`
			}
		}
		put(fmt.Sprintf("ppt/slides/slide%d.xml", n), xmlHeader+`<p:sld `+nsP+`><p:cSld><p:spTree>`+groupShape+pic+`</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>`+transition+`</p:sld>`)
		put(fmt.Sprintf("ppt/slides/_rels/slide%d.xml.rels", n), relationships(slideRelationships...))
		notes := `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>`
		for _, line := range strings.Split(slide.Narration, "\n") {
			notes += `<a:p><a:r><a:rPr lang="ko-KR"/><a:t>` + esc(line) + `</a:t></a:r></a:p>`
		}
		notes += `</p:txBody></p:sp>`
		put(fmt.Sprintf("ppt/notesSlides/notesSlide%d.xml", n), xmlHeader+`<p:notes `+nsP+`><p:cSld><p:spTree>`+groupShape+notes+`</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`)
		put(fmt.Sprintf("ppt/notesSlides/_rels/notesSlide%d.xml.rels", n), relationships(rel("rId1", "notesMaster", "../notesMasters/notesMaster1.xml"), rel("rId2", "slide", fmt.Sprintf("../slides/slide%d.xml", n))))
	}
	put("[Content_Types].xml", xmlHeader+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`+types+`</Types>`)
	put("ppt/presentation.xml", xmlHeader+`<p:presentation `+nsP+`><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst>`+ids+fmt.Sprintf(`</p:sldIdLst><p:sldSz cx="%d" cy="%d"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`, cx, cy))
	put("ppt/_rels/presentation.xml.rels", relationships(prsRels...))
	colourMap := `<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>`
	put("ppt/slideMasters/slideMaster1.xml", xmlHeader+`<p:sldMaster `+nsP+`><p:cSld><p:spTree>`+groupShape+`</p:spTree></p:cSld>`+colourMap+`<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`)
	put("ppt/slideMasters/_rels/slideMaster1.xml.rels", relationships(rel("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"), rel("rId2", "theme", "../theme/theme1.xml")))
	put("ppt/slideLayouts/slideLayout1.xml", xmlHeader+`<p:sldLayout `+nsP+` type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>`+groupShape+`</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`)
	put("ppt/slideLayouts/_rels/slideLayout1.xml.rels", relationships(rel("rId1", "slideMaster", "../slideMasters/slideMaster1.xml")))
	put("ppt/notesMasters/notesMaster1.xml", xmlHeader+`<p:notesMaster `+nsP+`><p:cSld><p:spTree>`+groupShape+`</p:spTree></p:cSld>`+colourMap+`<p:notesStyle/></p:notesMaster>`)
	put("ppt/notesMasters/_rels/notesMaster1.xml.rels", relationships(rel("rId1", "theme", "../theme/theme1.xml")))
	colours := ""
	for i, name := range []string{"dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"} {
		value := []string{"111827", "FFFFFF", "1F2937", "F9FAFB", "F59E0B", "2563EB", "10B981", "8B5CF6", "EF4444", "06B6D4", "2563EB", "8B5CF6"}[i]
		colours += `<a:` + name + `><a:srgbClr val="` + value + `"/></a:` + name + `>`
	}
	fill := `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`
	line := `<a:ln w="9525">` + fill + `<a:prstDash val="solid"/></a:ln>`
	put("ppt/theme/theme1.xml", xmlHeader+`<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Sol.A"><a:themeElements><a:clrScheme name="Sol.A">`+colours+`</a:clrScheme><a:fontScheme name="Sol.A"><a:majorFont><a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Sol.A"><a:fillStyleLst>`+strings.Repeat(fill, 3)+`</a:fillStyleLst><a:lnStyleLst>`+strings.Repeat(line, 3)+`</a:lnStyleLst><a:effectStyleLst>`+strings.Repeat(`<a:effectStyle><a:effectLst/></a:effectStyle>`, 3)+`</a:effectStyleLst><a:bgFillStyleLst>`+strings.Repeat(fill, 3)+`</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`)
	closeErr := archive.Close()
	fileErr := file.Close()
	if firstErr != nil {
		os.Remove(path)
		return firstErr
	}
	if closeErr != nil {
		return closeErr
	}
	return fileErr
}
func textColour(img image.Image, line OCRLine) string {
	b := image.Rect(line.X, line.Y, line.X+line.W, line.Y+line.H).Intersect(img.Bounds())
	if b.Empty() {
		return "111827"
	}
	background := color.NRGBAModel.Convert(img.At(max(0, b.Min.X-1), max(0, b.Min.Y-1))).(color.NRGBA)
	best := -1
	selected := background
	for y := b.Min.Y; y < b.Max.Y; y += 2 {
		for x := b.Min.X; x < b.Max.X; x += 2 {
			c := color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA)
			dr, dg, db := int(c.R)-int(background.R), int(c.G)-int(background.G), int(c.B)-int(background.B)
			distance := dr*dr + dg*dg + db*db
			if distance > best {
				best = distance
				selected = c
			}
		}
	}
	return fmt.Sprintf("%02X%02X%02X", selected.R, selected.G, selected.B)
}
func writePNG(path string, img image.Image) error {
	file, e := os.Create(path)
	if e != nil {
		return e
	}
	e = png.Encode(file, img)
	closeErr := file.Close()
	if e != nil {
		return e
	}
	return closeErr
}
