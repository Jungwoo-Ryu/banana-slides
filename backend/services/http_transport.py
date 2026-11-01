"""Verified HTTPS for SDKs, requests and internal provider adapters.

Standard HTTPS_PROXY/HTTP_PROXY/NO_PROXY are inherited. A corporate root is
added to public roots, never used to disable certificate verification.
"""
import os
import ssl
from pathlib import Path


def configure_tls():
    corporate = os.getenv('CORPORATE_CA_FILE', '').strip()
    if corporate:
        import certifi
        source = Path(corporate).expanduser().resolve()
        context = ssl.create_default_context()
        context.load_verify_locations(cafile=str(source))  # validate PEM before startup
        public_path = Path(os.getenv('SSL_CERT_FILE') or certifi.where())
        if public_path.name == 'ca-bundle.pem' and public_path.parent.name == '.runtime':
            public_path = Path(certifi.where())
        public = public_path.read_bytes()
        target = Path(__file__).resolve().parents[2] / '.runtime' / 'ca-bundle.pem'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(public + b'\n' + source.read_bytes())
        os.environ['SSL_CERT_FILE'] = str(target)
        os.environ['REQUESTS_CA_BUNDLE'] = str(target)
    elif os.getenv('SSL_CERT_FILE') and not os.getenv('REQUESTS_CA_BUNDLE'):
        os.environ['REQUESTS_CA_BUNDLE'] = os.environ['SSL_CERT_FILE']
    elif os.getenv('REQUESTS_CA_BUNDLE') and not os.getenv('SSL_CERT_FILE'):
        os.environ['SSL_CERT_FILE'] = os.environ['REQUESTS_CA_BUNDLE']


def http_client(timeout=300):
    import httpx
    return httpx.Client(verify=ssl.create_default_context(), trust_env=True, timeout=timeout)


def validate_endpoint(url: str):
    from urllib.parse import urlsplit
    parsed = urlsplit(url)
    if parsed.username or parsed.password or not parsed.hostname:
        raise ValueError('서비스 주소에 계정 정보가 포함되어 있거나 올바른 주소가 아닙니다.')
    if parsed.scheme == 'https':
        return url.rstrip('/')
    if parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1'):
        return url.rstrip('/')
    raise ValueError('외부 서비스에는 HTTPS 주소를 사용하세요. 로컬 서비스만 HTTP를 허용합니다.')
