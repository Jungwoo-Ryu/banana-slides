/** Native Wails bridge. Credentials stay in Go; only a local session token crosses. */
interface Bootstrap {
  baseURL: string;
  session: string;
  dataDir: string;
  runtime: 'wails';
}
interface NativeApp {
  Bootstrap(): Promise<Bootstrap>;
  SaveDownload(path: string, filename: string): Promise<string>;
  SaveData(base64: string, filename: string): Promise<string>;
  OpenSettings(): Promise<void>;
  OpenDataFolder(): Promise<void>;
  ImportLegacy(): Promise<Record<string, number> | null>;
  UIReady(): Promise<void>;
}
declare global {
  interface Window { go?: { main?: { App?: NativeApp } }; }
}
let bootstrap: Bootstrap | undefined;
export const isWails = () => Boolean(window.go?.main?.App);
export const nativeApp = () => window.go?.main?.App;
export const desktopConfig = () => bootstrap;
export async function initializeWails(): Promise<void> {
  const app = nativeApp();
  if (!app) return;
  bootstrap = await app.Bootstrap();
  const address = new URL(bootstrap.baseURL);
  if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1') {
    throw new Error('로컬 데스크톱 API 주소가 올바르지 않습니다.');
  }
}
export function sessionHeaders(): Record<string, string> {
  return bootstrap ? { 'X-SolA-Session': bootstrap.session } : {};
}
export function desktopFileURL(path: string): string {
  if (!bootstrap || !path.startsWith('/files/')) return path;
  const url = new URL(path, bootstrap.baseURL);
  url.searchParams.set('session', bootstrap.session);
  return url.toString();
}
export async function saveNative(url: string, filename: string): Promise<void> {
  const app = nativeApp();
  if (!app) return;
  if (/^(blob:|data:)/i.test(url)) {
    const blob = await (await fetch(url)).blob();
    if (blob.size > 64 * 1024 * 1024) throw new Error('파일은 최대 64MB입니다.');
    const encoded = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    await app.SaveData(encoded, filename);
  } else {
    const parsed = new URL(url, bootstrap?.baseURL || window.location.origin);
    if (parsed.origin !== bootstrap?.baseURL) throw new Error('앱에서 생성한 파일만 저장할 수 있습니다.');
    await app.SaveDownload(parsed.pathname, filename);
  }
}
