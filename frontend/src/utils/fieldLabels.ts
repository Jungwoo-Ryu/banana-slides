const labels: Record<string, string> = {'Visual assets':'이미지와 소재','Layout and emphasis':'배치와 강조점','Speaker notes':'발표자 노트','Visual elements':'시각 자료','Visual focus':'강조할 부분','Page layout':'페이지 배치','Layout suggestions':'배치 제안'};
export const fieldLabel = (name: string) => labels[name] || name;

// Read-only aliases for field names saved by older releases.
const legacyFields: Record<string, string> = {
  "\u914d\u56fe\u4e0e\u7d20\u6750": "Visual assets",
  "\u7248\u5f0f\u4e0e\u91cd\u70b9": "Layout and emphasis",
  "\u6f14\u8bb2\u8005\u5907\u6ce8": "Speaker notes",
  "\u89c6\u89c9\u5143\u7d20": "Visual elements",
  "\u89c6\u89c9\u7126\u70b9": "Visual focus",
  "\u6392\u7248\u5e03\u5c40": "Page layout",
  "\u6392\u7248\u5efa\u8bae": "Layout suggestions"
};
for (const [legacy, english] of Object.entries(legacyFields)) labels[legacy] = labels[english];
