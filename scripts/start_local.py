"""Start and supervise backend + Vite; Windows/macOS/Linux, no Docker required."""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]


def port_available(port):
    with socket.socket() as sock:
        try:
            sock.bind(('127.0.0.1', port))
            return True
        except OSError:
            return False


def wait_ready(url, process, timeout=90):
    # Local health checks must not leave the machine via a corporate proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('서비스가 시작 중 종료되었습니다. .runtime/logs의 로그를 확인하세요.')
        try:
            with opener.open(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, ValueError):
            pass
        time.sleep(.3)
    raise RuntimeError(f'서비스 시작을 기다리다 시간이 초과되었습니다: {url}')


def stop(process):
    if process.poll() is not None:
        return
    if os.name == 'nt':
        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    os.environ.setdefault('PYTHONUTF8', '1')
    os.chdir(ROOT)
    if not (ROOT / '.env').exists():
        shutil.copyfile(ROOT / '.env.example', ROOT / '.env')
        print('.env를 만들었습니다. 화면은 바로 열 수 있으며, AI 기능은 모델 키를 설정한 후 다시 실행하세요.', flush=True)
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env', override=False)
    sys.path.insert(0, str(ROOT / 'backend'))
    from services.http_transport import configure_tls
    configure_tls()
    if os.getenv('CORPORATE_CA_FILE'):
        os.environ.setdefault('NODE_EXTRA_CA_CERTS', str(Path(os.environ['CORPORATE_CA_FILE']).resolve()))
    os.environ.setdefault('NO_PROXY', 'localhost,127.0.0.1,::1')
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node.js 22.23.4 LTS 또는 지원되는 보안 패치 버전을 설치하세요.')
    version = subprocess.check_output([node, '-p', 'process.versions.node'], text=True).strip()
    from node_version import require_secure_node
    require_secure_node(version)
    ports = [int(os.getenv('BACKEND_PORT', '5011')), int(os.getenv('FRONTEND_PORT', '3011'))]
    if len(set(ports)) != 2 or any(not 1 <= p <= 65535 for p in ports):
        raise RuntimeError('백엔드와 프론트엔드는 서로 다른 1~65535 포트를 사용해야 합니다.')
    for port in ports:
        if not port_available(port):
            raise RuntimeError(f'{port} 포트가 사용 중입니다. 기존 실행 창을 닫거나 .env의 포트를 변경하세요.')
    frontend = ROOT / 'frontend'
    lock_hash = hashlib.sha256((frontend / 'package-lock.json').read_bytes()).hexdigest()
    marker = frontend / 'node_modules' / '.banana-lock-hash'
    if not marker.exists() or marker.read_text().strip() != lock_hash:
        npm = shutil.which('npm')
        if not npm:
            raise RuntimeError('npm을 찾을 수 없습니다. Node.js 설치를 확인하세요.')
        command = [npm, 'ci', '--registry=https://registry.npmjs.org']
        if os.name == 'nt':
            command = [os.environ.get('COMSPEC', 'cmd.exe'), '/d', '/c', 'npm.cmd', 'ci', '--registry=https://registry.npmjs.org']
        print('프론트엔드 의존성을 설치합니다...', flush=True)
        subprocess.run(command, cwd=frontend, check=True)
        marker.write_text(lock_hash)
    logs = ROOT / '.runtime' / 'logs'
    logs.mkdir(parents=True, exist_ok=True)
    processes = []
    handles = []
    options = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}
    try:
        for name, command, cwd, url in [
            ('backend', [sys.executable, '-u', str(ROOT / 'scripts/run_backend.py')], ROOT, f'http://127.0.0.1:{ports[0]}/health'),
            ('frontend', [node, str(frontend / 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], frontend, f'http://127.0.0.1:{ports[1]}'),
        ]:
            log = (logs / f'{name}.log').open('w', encoding='utf-8')
            handles.append(log)
            process = subprocess.Popen(command, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, **options)
            processes.append(process)
            wait_ready(url, process)
            print(f'{name} 실행 완료: {url}', flush=True)
        url = f'http://127.0.0.1:{ports[1]}'
        if not args.no_browser:
            webbrowser.open(url)
        print('브라우저에서 사용할 수 있습니다. 종료하려면 이 창에서 Ctrl+C를 누르세요.', flush=True)
        while all(p.poll() is None for p in processes):
            time.sleep(.5)
        raise RuntimeError('서비스가 종료되었습니다. .runtime/logs를 확인하세요.')
    except KeyboardInterrupt:
        print('\n서비스를 종료합니다.', flush=True)
    finally:
        for process in reversed(processes): stop(process)
        for handle in handles: handle.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'실행 실패: {error}', file=sys.stderr)
        sys.exit(1)
