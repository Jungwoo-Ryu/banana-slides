import { useState } from 'react';
import { desktopConfig, isWails, nativeApp } from '@/utils/wails';
import { apiClient } from '@/api/client';

export function DesktopSettings() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  if (!isWails()) return null;
  const action = async (run: () => Promise<unknown>, done: string) => {
    setBusy(true); setMessage('');
    try { const result = await run(); setMessage(typeof result === 'string' ? result : done); }
    catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  const button = 'rounded-xl border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50';
  return <section className="rounded-2xl border bg-white p-6">
    <h2 className="text-xl font-semibold">☀ Sol.A 데스크톱</h2>
    <p className="mt-3 text-sm text-gray-600">프로젝트는 이 PC에 저장됩니다. Azure 연결 설정을 변경한 뒤 앱을 다시 실행하세요.</p>
    <p className="mt-2 break-all text-sm text-gray-500">{desktopConfig()?.dataDir}</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button className={button} disabled={busy} onClick={() => action(() => nativeApp()!.OpenSettings(), '설정 파일을 열었습니다. 저장 후 앱을 다시 실행하세요.')}>Azure 연결 설정</button>
      <button className={button} disabled={busy} onClick={() => action(() => nativeApp()!.OpenDataFolder(), '데이터 폴더를 열었습니다.')}>데이터·로그 폴더</button>
      <button className={button} disabled={busy} onClick={() => action(async () => {
        const counts = await nativeApp()!.ImportLegacy();
        return counts ? `가져오기 완료: ${Object.entries(counts).map(([key, value]) => `${key} ${value}`).join(', ')}` : '가져오기를 취소했습니다.';
      }, '')}>기존 프로젝트 가져오기</button>
      <button className={button} disabled={busy} onClick={() => action(async () => {
        const { data } = await apiClient.get('/api/desktop/tools');
        return Object.entries(data.data).map(([name, tool]) => {
          if (typeof tool === 'object' && tool && 'available' in tool) return `${name}: ${tool.available ? '설치됨' : '설치 필요'}`;
          return name === 'ocr_error' ? String(tool) : '';
        }).filter(Boolean).join(' / ');
      }, '')}>로컬 도구 확인</button>
    </div>
    {message && <p role="status" className="mt-4 whitespace-pre-wrap text-sm">{message}</p>}
  </section>;
}
