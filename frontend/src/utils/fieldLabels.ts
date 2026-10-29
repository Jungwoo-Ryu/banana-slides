const labels: Record<string, string> = {'配图与素材':'이미지와 소재','版式与重点':'배치와 강조점','演讲者备注':'발표자 노트','视觉元素':'시각 자료','视觉焦点':'강조할 부분','排版布局':'페이지 배치','排版建议':'배치 제안'};
export const fieldLabel = (name: string) => labels[name] || name;
