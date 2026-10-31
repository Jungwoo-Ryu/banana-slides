"""Loopback-only Azure speech protocol fixture; never contacts a model service."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import subprocess

folder=Path(os.environ.get('SOLA_E2E_FOLDER','.runtime/sola-e2e')).resolve()
folder.mkdir(parents=True,exist_ok=True)
audio=folder/'fixture-speech.mp3'
subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=0.8','-c:a','libmp3lame',str(audio)],check=True)
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_POST(self):
        if self.path!='/openai/v1/audio/speech':
            self.send_error(404);return
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with (folder/'speech-inputs.jsonl').open('a') as out:
            out.write(json.dumps({'input':body['input'],'model':body['model']},ensure_ascii=False)+'\n')
        payload=audio.read_bytes()
        self.send_response(200);self.send_header('Content-Type','audio/mpeg')
        self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
ThreadingHTTPServer(('127.0.0.1',5044),Handler).serve_forever()
