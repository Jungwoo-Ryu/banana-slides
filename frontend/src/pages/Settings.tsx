import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '@/api/client';

type Config = Record<string, any>;
const providers = [['azure', 'Azure OpenAI'], ['openai', 'OpenAI / 호환 API'], ['gemini', 'Google Gemini'], ['vertex', 'Google Vertex AI'], ['anthropic', 'Anthropic (텍스트 전용)']];
const roles = [['text', '텍스트 생성'], ['image', '이미지 생성·영역 수정'], ['image_caption', '이미지 인식']] as const;

export function SettingsPage() {
  const [config, setConfig] = useState<Config>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState<Record<string, string>>({});
  const load = () => apiClient.get('/api/settings').then(r => setConfig(r.data.data));
  useEffect(() => { load().catch(() => setMessage('설정을 불러오지 못했습니다. 백엔드 실행 상태를 확인하세요.')); }, []);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      for (const [name, value] of Object.entries(tests)) {
        if (!value.startsWith('task:')) continue;
        try {
          const { data } = await apiClient.get(`/api/settings/tests/${value.slice(5)}/status`);
          if (!active) return;
          const result = data.data;
          if (['COMPLETED', 'FAILED'].includes(result.status)) {
            setTests(prev => ({ ...prev, [name]: result.status === 'COMPLETED' ? '연결 확인 완료' : result.error || '연결 테스트에 실패했습니다.' }));
          }
        } catch { if (active) setTests(prev => ({ ...prev, [name]: '테스트 상태를 확인하지 못했습니다.' })); }
      }
    };
    const timer = window.setInterval(poll, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [tests]);
  const set = (key: string, value: unknown) => setConfig(prev => ({ ...prev, [key]: value }));
  const save = async () => {
    if (!config) return;
    setBusy(true); setMessage('');
    try {
      const { providers: _, external_services: __, ...values } = config;
      const response = await apiClient.put('/api/settings', Object.fromEntries(Object.entries(values).filter(([, v]) => v != null)));
      setConfig(response.data.data); setMessage('설정을 저장했습니다.');
    } catch (e: any) { setMessage(e.response?.data?.error?.message || '설정을 저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const test = async (name: string) => {
    setTests(prev => ({ ...prev, [name]: '테스트 시작 중…' }));
    try {
      const result = await apiClient.post(`/api/settings/tests/${name}`, {});
      setTests(prev => ({ ...prev, [name]: `task:${result.data.data.task_id}` }));
    } catch (e: any) { setTests(prev => ({ ...prev, [name]: e.response?.data?.error?.message || '테스트를 시작하지 못했습니다.' })); }
  };
  const inputClass = 'mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900';
  return <main className="min-h-screen bg-gray-50 px-6 py-10 text-gray-900">
    <div className="mx-auto max-w-4xl space-y-7">
      <Link to="/" className="text-sm text-blue-700">← 홈으로</Link>
      <div><h1 className="text-3xl font-bold">설정</h1><p className="mt-2 text-gray-600">슬라이드 생성에 사용할 모델과 작업 방식을 설정하세요.</p></div>
      {message && <p role="status" className="rounded-xl bg-blue-50 p-4">{message}</p>}
      {!config ? <p>설정을 불러오는 중…</p> : <>
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-semibold">모델 연결</h2>
          <p className="mt-2 text-sm text-gray-600">API 키는 서버의 .env 또는 Secret Manager에서 설정합니다. 이 화면에는 키를 저장하거나 표시하지 않습니다.</p>
          <label className="mt-5 block">기본 제공자<select className={inputClass} value={config.ai_provider_format || 'azure'} onChange={e => set('ai_provider_format', e.target.value)}>{providers.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <div className="mt-6 space-y-6">{roles.map(([role,label]) => <div key={role} className="border-t pt-5">
            <h3 className="font-semibold">{label}</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label>제공자<select className={inputClass} value={config[`${role}_model_source`] || ''} onChange={e => set(`${role}_model_source`, e.target.value)}><option value="">기본 제공자 사용</option>{providers.filter(([v]) => role !== 'image' || v !== 'anthropic').map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>모델 이름<input className={inputClass} value={config[`${role}_model`] || ''} onChange={e => set(`${role}_model`, e.target.value)} /></label>
              <label className="sm:col-span-2">역할별 서비스 주소 (선택)<input className={inputClass} placeholder="비워두면 서버 환경변수 사용" value={config[`${role}_api_base_url`] || ''} onChange={e => set(`${role}_api_base_url`, e.target.value)} /></label>
            </div>
            <p className="mt-3 text-sm text-gray-600">{config.providers?.[role]?.configured ? `설정 준비됨 · ${config.providers[role].format}${config.providers[role].deployment ? ` · 배포 ${config.providers[role].deployment}` : ''}` : config.providers?.[role]?.message}</p>
          </div>)}</div>
          <p className="mt-5 rounded-lg bg-gray-50 p-3 text-sm">Azure는 AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT를 사용합니다. 이미지 생성은 별도의 AZURE_OPENAI_IMAGE_DEPLOYMENT가 필요합니다. Azure 요청의 모델 값에는 배포 이름이 사용됩니다.</p>
        </section>
        <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-semibold">생성 설정</h2><div className="mt-4 grid gap-5 sm:grid-cols-2">
          <label>출력 언어<select className={inputClass} value={config.output_language} onChange={e => set('output_language',e.target.value)}><option value="ko">한국어</option><option value="en">영어</option><option value="auto">입력 언어에 맞춤</option></select></label>
          <label>이미지 해상도<select className={inputClass} value={config.image_resolution} onChange={e => set('image_resolution',e.target.value)}>{['1K','2K','4K'].map(x=><option key={x}>{x}</option>)}</select></label>
          <label>설명 생성 방식<select className={inputClass} value={config.description_generation_mode} onChange={e=>set('description_generation_mode',e.target.value)}><option value="streaming">순서대로 표시</option><option value="parallel">여러 페이지 동시 생성</option></select></label>
          <label>이미지 품질<select className={inputClass} value={config.image_quality || 'auto'} onChange={e=>set('image_quality',e.target.value)}>{[['auto','자동'],['low','낮음'],['medium','보통'],['high','높음']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label>설명 동시 작업 수<input type="number" min="1" max="20" className={inputClass} value={config.max_description_workers} onChange={e=>set('max_description_workers',Number(e.target.value))}/></label>
          <label>이미지 동시 작업 수<input type="number" min="1" max="20" className={inputClass} value={config.max_image_workers} onChange={e=>set('max_image_workers',Number(e.target.value))}/></label>
        </div></section>
        <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-semibold">문서·OCR 처리 위치</h2><p className="mt-3">문서: {config.external_services?.document_parser} / OCR: {config.external_services?.ocr_provider} / 배경 복원: {config.external_services?.inpainting_provider}</p><p className="mt-2 text-sm text-gray-600">local은 이 PC에서 처리합니다. http 또는 mineru를 선택하면 파일이 설정한 서비스에 전송됩니다. AI 생성·영역 수정 시에는 선택한 모델 서비스에 프롬프트와 관련 이미지가 전송됩니다. 연결 변경은 .env에서 설정한 뒤 다시 실행하세요.</p></section>
        <button className="rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={save}>{busy ? '저장 중…' : '설정 저장'}</button>
        <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-semibold">서비스 테스트</h2><p className="my-3 text-sm text-gray-600">저장된 설정으로 실제 API를 호출합니다. 모델 서비스 이용 요금이 발생할 수 있습니다.</p><div className="space-y-3">{[['text-model','텍스트 생성'],['image-model','이미지 생성'],['caption-model','이미지 인식'],['ocr','OCR']].map(([name,label]) => <div key={name} className="flex flex-wrap items-center gap-3"><button className="rounded-lg border px-4 py-2 disabled:opacity-50" disabled={tests[name]?.startsWith('task:') || tests[name]==='테스트 시작 중…'} onClick={()=>test(name)}>{label} 테스트</button><span role="status" className="text-sm">{tests[name]?.startsWith('task:') ? '테스트 중…' : tests[name]}</span></div>)}</div></section>
        <p className="text-sm text-gray-500">Banana Slides · AGPL-3.0 · 원본 및 변경 소스와 라이선스 고지는 저장소에서 확인할 수 있습니다.</p>
      </>}
    </div>
  </main>;
}
