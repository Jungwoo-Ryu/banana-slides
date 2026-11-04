import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './i18n'
import './index.css'
import { initializeWails, nativeApp } from './utils/wails'


async function start() {
  await initializeWails();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>,
  );
}
start().catch(error => {
  console.error('Sol.A startup failed', error);
  const root = document.getElementById('root');
  if (root) {
    root.textContent = `Sol.A를 시작하지 못했습니다: ${String(error)}`;
    const button = document.createElement('button');
    button.textContent = 'Azure 연결 설정 열기';
    button.onclick = () => { void nativeApp()?.OpenSettings(); };
    root.appendChild(button);
  }
});
