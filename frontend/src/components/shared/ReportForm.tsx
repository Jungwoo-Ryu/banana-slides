import React from 'react';

export type ReportFields = {
  topic: string; purpose: string; audience: string; style: string;
  pages: string; points: string; requirements: string;
};
export const emptyReport: ReportFields = {
  topic: '', purpose: '', audience: '', style: '', pages: '', points: '', requirements: '',
};
const labels = {
  zh: { topic: '主题（必填）', purpose: '用途', audience: '目标受众', style: '视觉风格', pages: '预计页数', points: '内容要点', requirements: '补充要求' },
  en: { topic: '주제 (필수)', purpose: '목적', audience: '대상 청중', style: '디자인 스타일', pages: '예상 페이지 수', points: '핵심 내용', requirements: '추가 요구사항' },
};
const presets = {
  zh: [
    ['周报/月报', '汇报本期工作进展', '团队成员', '简洁清晰', '8'],
    ['项目汇报', '汇报项目阶段成果', '项目相关方', '专业简洁', '10'],
    ['产品介绍', '介绍产品及其价值', '潜在用户', '清晰直观', '10'],
    ['培训课件', '讲解知识与实践方法', '培训学员', '易读易懂', '15'],
    ['自定义', '', '', '', ''],
  ],
  en: [
    ['주간 / 월간 보고', '이번 기간 업무 현황 보고', '팀원', '명료하고 간결하게', '8'],
    ['프로젝트 보고', '프로젝트 성과 보고', '프로젝트 관계자', '전문적이고 간결하게', '10'],
    ['제품 소개', '제품과 가치 소개', '잠재 고객', '직관적인 시각 자료', '10'],
    ['교육 자료', '개념과 실무 방법 설명', '교육 참가자', '이해하기 쉽게', '15'],
    ['직접 작성', '', '', '', ''],
  ],
};
export function buildReportPrompt(fields: ReportFields, zh: boolean): string {
  const names = labels[zh ? 'zh' : 'en'];
  return (Object.keys(fields) as (keyof ReportFields)[])
    .filter(key => fields[key].trim())
    .map(key => `${names[key]}: ${fields[key].trim()}`).join('\n');
}
export function applyReportPreset(fields: ReportFields, index: number, zh: boolean): ReportFields {
  const [, purpose, audience, style, pages] = presets[zh ? 'zh' : 'en'][index];
  return { ...fields, purpose: fields.purpose || purpose, audience: fields.audience || audience,
    style: fields.style || style, pages: fields.pages || pages };
}
export const ReportForm: React.FC<{
  fields: ReportFields; onChange: (fields: ReportFields) => void;
  onRebuild: () => void; zh: boolean; disabled: boolean;
}> = ({ fields, onChange, onRebuild, zh, disabled }) => {
  const names = labels[zh ? 'zh' : 'en'];
  return <fieldset disabled={disabled} className="space-y-3 mb-4" data-testid="report-form">
    <label className="block text-sm">
      {zh ? '场景预设' : '발표 유형'}
      <select defaultValue="" className="block w-full p-2 border rounded-lg dark:bg-background-secondary" onChange={e => onChange(applyReportPreset(fields, Number(e.target.value), zh))}>
        <option value="" disabled>{zh ? '选择场景' : '발표 유형 선택'}</option>
        {presets[zh ? 'zh' : 'en'].map(([name], index) => <option key={index} value={index}>{name}</option>)}
      </select>
    </label>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {(Object.keys(names) as (keyof ReportFields)[]).map(key => <label key={key} className="text-sm">
        {names[key]}
        {key === 'points' || key === 'requirements'
          ? <textarea className="block w-full p-2 border rounded-lg dark:bg-background-secondary" value={fields[key]} onChange={e => onChange({ ...fields, [key]: e.target.value })} />
          : <input className="block w-full p-2 border rounded-lg dark:bg-background-secondary" type={key === 'pages' ? 'number' : 'text'} min={key === 'pages' ? 1 : undefined} required={key === 'topic'} value={fields[key]} onChange={e => onChange({ ...fields, [key]: e.target.value })} />}
      </label>)}
    </div>
    {!fields.topic.trim() && <p className="text-sm text-amber-700 dark:text-amber-300">{zh ? '请填写主题后继续' : '주제를 입력하세요'}</p>}
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{zh ? 'Prompt 预览（可直接编辑；手动编辑后，更新字段不会覆盖预览）' : '프롬프트 미리보기 (직접 수정한 내용은 유지됩니다)'}</span>
      <button type="button" className="text-blue-600 shrink-0" onClick={onRebuild}>{zh ? '从表单更新 Prompt' : '입력 내용으로 프롬프트 갱신'}</button>
    </div>
  </fieldset>;
};
