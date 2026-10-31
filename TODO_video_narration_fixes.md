# Video Narrative — Issues to be repaired TODO

Branch：`feat/video-narration-template`
Document-related：`backend/services/tts_video_service.py`、`backend/services/prompts.py`

---

## Problem 1：Sometimes it’s a box code, sometimes it’s normal Chinese. ✅ It’s been fixed in the branch.

### Gene.

ASS Dialogue It’s... Text Fields：
- `{...}` Yes. libass Interconnection override Blocks；
- `\N` `\h` `\n` The second slash sequence is... libass Conversion。

Every once in a while. `{` / `}` / `\` Time，libass It’s going to be treated like a control code, and it’s going to be visualized./diamonds. Cross-export with machine and font"It’s good and bad."The only variable is the text itself, so the roots aren’t in fonts, they’re parsed.。

### Legal reform

Yes. `tts_video_service.py` Writing Dialogue Clean the text before the line, and these three will be libass Replace the misunderstanding character with the full-angle equivalent：

```python
def _sanitize_ass_dialogue_text(text: str) -> str:
    return (text
        .replace('\\', '＼')
        .replace('{', '｛')
        .replace('}', '｝')
        .replace('\n', ' ')
        .replace('\r', ''))
```

♪ And put on `generate_ass_subtitle` Medium Original `text = entry['text'].replace('\n', ' ').replace('\r', '')` Change to call this function。

### Receiving and Inspection

- [ ] Use a paragraph to contain `{Key points}` or `\N` narration text exports to video with correct subtitles and no"Chaos./diamonds"。
- [ ] It was a normal narration re-entry test, and it was still normal.。

---

## Problem 2：Each page sounds split and incoherent. 🔧 To be modified (structure change)）

### GEN (core)）

Current `generate_narration_video` It’s... Phase A It’s page by page. TTS：

```python
for i, page in enumerate(pages_data):
    duration, alignment = generate_elevenlabs_audio_sync(narration, ...)
```

Each page is independent. TTS Call，TTS The model every time."Cold Start"，There is no hymn in the previous page. So even if the text has a transitional word, there’s a slight beginning on every page."Restart"The tone, there must be a listening seam between the page and the page.。

**Conclusions**：To be completely resolved, we have to change it to"Synthesis of the whole paragraph. TTS"。Light change. prompt（To make the text more coherent) can only improve the content layer and not the acoustic layer. prompt Don’t move. Focus. Phase A。

### Legal reform（ElevenLabs Path Priority）

Take it. Phase A Replace with"Synthetic, time-stamped slices"，Phase B After that, the collage logic is almost intact.：

1. **Collapse the whole text**：All the pages with the narrations. `narration_text` Use a stable separator (recommendation) `\n\n` . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . `[char_start_i, char_end_i)`（Note that the number of characters of the separator is also included in the offset）。
2. **One call. ElevenLabs**：Rotation `client.text_to_speech.convert_with_timestamps(...)`，Got the whole piece at once. mp3 + Character Level alignment（`character_start_times_seconds` / `character_end_times_seconds`）。
3. **Map time horizons by character**：Every page. `[char_start_i, char_end_i)` Yes. alignment They’ve got a match. `[t_start_i, t_end_i)`（milliseconds）。
4. **Slice into a single page mp3**：Use it. ffmpeg `-ss t_start_i -to t_end_i -c copy`（Or recode the whole section. mp3 Cut N Single Page mp3，As it was. `audio_paths[i]` Location。`page_durations[i]` Use it. `t_end_i - t_start_i`。
5. **alignment It’s also slashed to the subtitle logic.**：Put the whole paragraph. alignment Press char It’s cut into a single piece of a page. alignment，Pass it to the existing one. `_build_timed_subtitle_entries_from_alignment`。This subtitle is more accurate than the current page alignment.。
6. **Phase B And then the logic stays the same.**：Every page. audio_path、page_durations、alignment Still. N Entries, downstream mux/We don’t need to move the coding code.。

When whole paragraph is not synthesized（API I’m sorry, I’m sorry."Page-by-page"Path, retain semi-finished capacity.。

### edge-tts Path

edge-tts Nothing. ElevenLabs That kind of end to end. alignment。Two options.：

- **Select A（Just hold on to the recommendation.）**：Keep page-by-page synthesis，edge-tts Weak in itself. TTS，Limited benefits of coherence。
- **Select B（If you want to do it,）**：Use it. `edge_tts.Communicate` Fluid interface. `WordBoundary` Event(s) offset/duration）Synthesis of the whole paragraph + word-boundary Slice。

### Receiving and Inspection

- [ ] Three pages or more of verb video, blindly hearing no obvious seams (unless a transitional word is used to suggest it)）。
- [ ] Subtitles and voice matching error < 200ms。
- [ ] ElevenLabs Number of calls from"Pages N"Down to"1"；The whole export time and failure rate is acceptable。
- [ ] If the whole section fails, it returns elegantly to page-by-page synthesis and is exported without being suspended.。
- [ ] Existing `_build_timed_subtitle_entries_from_alignment` Subtitles are still working and timetamps are better.。

### Don’t do anything.

- Don’t do it for me."Hypocrisy."Acoustic fade-out at every page suture / Mute gasket —— It’s just a cover-up. It doesn’t solve the root causes.。
- Don’t change it. prompt or font-related code —— The last round has been verified.，prompt Only improves text layer consistency, fonts and"It’s good and bad."It’s nothing.。
