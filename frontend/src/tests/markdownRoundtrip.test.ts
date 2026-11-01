import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportProjectToMarkdown, parseMarkdownPages } from '@/utils/projectUtils';
import i18n from '@/i18n';
import type { Project } from '@/types';
const { download } = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('@/utils/index', async importOriginal => ({ ...(await importOriginal<any>()), downloadFile: download }));
const readBlob = (blob: Blob) => new Promise<string>(resolve => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob);
});

afterEach(() => download.mockClear());
describe('Markdown export/import preserves reviewed content', () => {
  it.each(['ko', 'en'])('round-trips %s titles, chapters, multiline fields and narration', async lang => {
    await i18n.changeLanguage(lang);
    const script = '첫 문장입니다.\n시간: 오전 10시\n마지막 문장입니다.';
    const project = { id: 'roundtrip', project_id: 'roundtrip', pages: [{
      id: 'page-1', part: '첫 장', outline_content: { title: '검증 제목', points: ['첫 항목', '둘째 항목'] },
      description_content: { text: '표시할 본문\n두 번째 줄', extra_fields: { 'Visual assets': '차트\n색상: 금색', 'Layout and emphasis': '두 단 구성' } },
      narration_text: script,
    }] } as unknown as Project;
    exportProjectToMarkdown(project);
    const markdown = await readBlob(download.mock.calls[0][0]);
    expect(parseMarkdownPages(markdown)).toEqual([{
      title: '검증 제목', part: '첫 장', points: ['첫 항목', '둘째 항목'], text: '표시할 본문\n두 번째 줄',
      extra_fields: { 'Visual assets': '차트\n색상: 금색', 'Layout and emphasis': '두 단 구성', TTS_SCRIPT: script },
    }]);
  });

  it('keeps old saved field labels readable', () => {
    const legacy = '\u7b2c 1 \u9875';
    const outline = '\u5927\u7eb2\u8981\u70b9';
    const description = '\u9875\u9762\u63cf\u8ff0';
    const parsed = parseMarkdownPages(`## ${legacy}: Title\n\n**${outline}:**\n- Point\n\n**${description}:**\nBody`);
    expect(parsed[0]).toMatchObject({ title: 'Title', points: ['Point'], text: 'Body' });
  });
});
