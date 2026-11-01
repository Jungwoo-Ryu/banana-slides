"""Loopback Azure protocol fixture. Exercises the real SDK without paid model calls."""
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
import base64
import json
import os
import subprocess
import threading

image_failures = []
failure_lock = threading.Lock()
from PIL import Image

folder = Path(os.environ.get('SOLA_E2E_FOLDER', '.runtime/sola-e2e')).resolve()
folder.mkdir(parents=True, exist_ok=True)
audio = folder / 'fixture-speech.mp3'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.8', '-c:a', 'libmp3lame', str(audio)], check=True)


def description(index):
    return (f'--- SLIDE_TEXT ---\n회귀 검증 {index}\n- 저장과 내보내기를 확인합니다.\n--- SLIDE_TEXT_END ---\n'
            'Visual assets: A simple chart\nLayout and emphasis: Navy title with gold accents\n'
            f'TTS_SCRIPT: {index}번 슬라이드의 자동 생성 발표 대본입니다.\n')


def completion(prompt, stream):
    if 'slide-template visual analyst' in prompt:
        return json.dumps(dict(template_role='content', layout_structure='title-top-two-column', extracted_text='Fixture',
            content_capacity='medium', text_regions=[], image_regions=[], visual_density='low',
            style_keywords=['clean'], color_palette=['#102040'], notes='Protocol fixture'), ensure_ascii=False)
    if '<!-- PAGE_END -->' in prompt and 'TTS_SCRIPT:' in prompt:
        return '<!-- BEGIN -->\n' + ''.join(description(i) + '<!-- PAGE_END -->\n' for i in (1, 2)) + '<!-- END -->\n'
    if 'TTS_SCRIPT:' in prompt:
        return description(1)
    if stream:
        return '<!-- BEGIN -->\n## 회귀 검증 1\n- 저장 흐름을 확인합니다.\n## 회귀 검증 2\n- 내보내기를 확인합니다.\n<!-- END -->\n'
    return json.dumps([{'title': f'회귀 검증 {i}', 'points': ['저장과 내보내기']} for i in (1, 2)], ensure_ascii=False)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, payload, content_type='application/json', status=200):
        if not isinstance(payload, bytes):
            payload = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('x-request-id', 'fixture-image-request')
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        raw = self.rfile.read(int(self.headers['Content-Length']))
        references = 0
        if self.headers.get('Content-Type', '').startswith('multipart/'):
            message = BytesParser(policy=policy.default).parsebytes(
                ('Content-Type: ' + self.headers['Content-Type'] + '\r\n\r\n').encode() + raw)
            body = {}
            for part in message.iter_parts():
                if part.get_filename():
                    references += 1
                else:
                    body[part.get_param('name', header='content-disposition')] = part.get_payload(decode=True).decode()
        else:
            body = json.loads(raw)
        if self.path == '/__fixture__/image-failures':
            with failure_lock:
                image_failures[:] = body.get('statuses', [])
            return self.respond({'ok': True})
        if self.path == '/openai/v1/audio/speech':
            with (folder / 'speech-inputs.jsonl').open('a') as out:
                out.write(json.dumps({'input': body['input'], 'model': body['model']}, ensure_ascii=False) + '\n')
            return self.respond(audio.read_bytes(), 'audio/mpeg')
        prompt = body.get('prompt', '')
        if body.get('messages'):
            content = body['messages'][0]['content']
            prompt = content if isinstance(content, str) else '\n'.join(p.get('text', '') for p in content)
        with (folder / 'model-requests.jsonl').open('a') as out:
            out.write(json.dumps({'path': self.path, 'model': body.get('model'), 'prompt': prompt,
                                 'references': references, 'stream': bool(body.get('stream'))}, ensure_ascii=False) + '\n')
        if self.path == '/openai/v1/chat/completions':
            text = completion(prompt, body.get('stream'))
            if body.get('stream'):
                chunks = [{'id': 'fixture', 'object': 'chat.completion.chunk', 'choices': [{'index': 0, 'delta': {'content': text[i:i+47]}, 'finish_reason': None}]} for i in range(0, len(text), 47)]
                payload = ''.join('data: ' + json.dumps(chunk) + '\n\n' for chunk in chunks) + 'data: [DONE]\n\n'
                return self.respond(payload.encode(), 'text/event-stream')
            return self.respond({'id': 'fixture', 'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': text}, 'finish_reason': 'stop'}]})
        if self.path in ('/openai/v1/images/generations', '/openai/v1/images/edits'):
            with failure_lock:
                status = image_failures.pop(0) if image_failures else 200
            if status != 200:
                return self.respond({'error': {'code': 'FixtureImageError', 'message': 'sk-fixture-must-not-leak'}}, status=status)
            with BytesIO() as buffer:
                with Image.new('RGB', (2048, 1152), 'navy' if self.path.endswith('generations') else 'teal') as picture:
                    picture.save(buffer, format='PNG')
                return self.respond({'data': [{'b64_json': base64.b64encode(buffer.getvalue()).decode()}]})
        self.send_error(404)


ThreadingHTTPServer(('127.0.0.1', 5044), Handler).serve_forever()
