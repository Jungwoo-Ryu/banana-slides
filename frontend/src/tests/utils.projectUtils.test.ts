import { describe, expect, test } from 'vitest';
import { parseMarkdownPages } from '@/utils/projectUtils';

describe('parseMarkdownPages', () => {
  test('imports sentence-style outline and required page text markers', () => {
    const pages = parseMarkdownPages(`
## Page 1 Page: Market opportunities

> Section: Industry analysis

This page shows growing market size, fragmented competition patterns and growing enterprise-level opportunities。

**Page description：**
--- SLIDE_TEXT ---

### Market opportunities are expanding rapidly.

- Enterprise-level scenes are growing faster than consumer-level scenes

--- SLIDE_TEXT_END ---

Visual elements：Growth curve, comparative data cards
Visual focus：Enterprise rate of growth
`);

    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe('Market opportunities');
    expect(pages[0].part).toBe('Industry analysis');
    expect(pages[0].points).toEqual(['This page shows growing market size, fragmented competition patterns and growing enterprise-level opportunities。']);
    expect(pages[0].text).toContain('--- SLIDE_TEXT ---');
    expect(pages[0].text).toContain('--- SLIDE_TEXT_END ---');
    expect(pages[0].extra_fields).toEqual({
      'Visual elements': 'Growth curve, comparative data cards',
      'Visual focus': 'Enterprise rate of growth',
    });
  });

  test('imports outline content with or without markdown bullet prefixes', () => {
    const pages = parseMarkdownPages(`
## Page 1 Page: Yin Weidar’s history.

**Outline points：**

Let’s just say one word about the main line.。
* Ying Wei Dynasty. GPU One step at a time. AI The Infrastructure of the Age。
+ CUDA Create software ecological barriers。
- Data centres become the second growth curve。

**Page description：**
--- SLIDE_TEXT ---
Yin Weidar’s history.
--- SLIDE_TEXT_END ---
`);

    expect(pages[0].points).toEqual([
      'Let’s just say one word about the main line.。',
      'Ying Wei Dynasty. GPU One step at a time. AI The Infrastructure of the Age。',
      'CUDA Create software ecological barriers。',
      'Data centres become the second growth curve。',
    ]);
  });
});
