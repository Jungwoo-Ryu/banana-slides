"""Company Azure speech contract and real, sequential MP4 composition."""
from pathlib import Path
from unittest.mock import MagicMock
import json
import shutil
import subprocess
import pytest
from PIL import Image
from services import tts_video_service as video


def test_tts_streams_only_to_company_azure(tmp_path,monkeypatch):
    from services import ai_providers
    config={'deployment':'company-speech','api_key':'test','api_base':'https://company.openai.azure.com','api_version':'v1'}
    monkeypatch.setattr(ai_providers,'_get_model_type_provider_config',lambda role:config if role=='tts' else None)
    client=MagicMock();client.__enter__.return_value=client
    factory=MagicMock(return_value=client);monkeypatch.setattr(ai_providers,'azure_client',factory)
    monkeypatch.setattr(video,'get_audio_duration',lambda *_:1.0)
    assert video.generate_tts_audio_sync('사용자 대본',str(tmp_path/'speech.mp3'),voice='alloy',speed=1.2)==1.0
    args=client.audio.speech.with_streaming_response.create.call_args.kwargs
    assert args['model']=='company-speech' and args['input']=='사용자 대본'
    assert args['speed']==1.2 and args['response_format']=='mp3'
    client.audio.speech.with_streaming_response.create.return_value.__enter__.return_value.stream_to_file.assert_called_once()


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'),reason='FFmpeg is required')
def test_two_slide_mp4_contains_audio_and_video(tmp_path,monkeypatch):
    spoken=[]
    def synth(text,path,voice,speed,ffmpeg_path):
        spoken.append(text)
        subprocess.run([ffmpeg_path,'-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=0.6','-c:a','libmp3lame',path],check=True)
        return video.get_audio_duration(path,ffmpeg_path)
    monkeypatch.setattr(video,'generate_tts_audio_sync',synth)
    images=[]
    for i,color in enumerate(('navy','orange')):
        p=tmp_path/f'{i}.png';Image.new('RGB',(640,360),color).save(p)
        images.append({'image_path':str(p),'narration_text':f'User-edited script {i}'})
    out=tmp_path/'slides.mp4'
    video.generate_narration_video(images,str(out),width=640,height=360,fps=10)
    result=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out)]))
    assert {stream['codec_type'] for stream in result['streams']}=={'audio','video'}
    assert float(result['format']['duration'])>=1.2
    assert spoken==['User-edited script 0','User-edited script 1']
    assert not list(tmp_path.glob('sola-video-*'))


def test_failure_cleans_intermediates_without_publishing_output(tmp_path,monkeypatch):
    image=tmp_path/'slide.png';Image.new('RGB',(16,16)).save(image)
    def fail(*_): raise RuntimeError('speech unavailable')
    monkeypatch.setattr(video,'generate_tts_audio_sync',fail)
    with pytest.raises(RuntimeError):
        video.generate_narration_video([{'image_path':str(image),'narration_text':'Saved'}],str(tmp_path/'failed.mp4'))
    assert not (tmp_path/'failed.mp4').exists()
    assert not list(tmp_path.glob('sola-video-*'))
