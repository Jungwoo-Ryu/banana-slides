"""Azure Foundry speech plus bounded, sequential FFmpeg slide rendering."""
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import BoundedSemaphore
import math
import os
import subprocess
from services.runtime_config import setting

# One admitted video per API process; production uses one dedicated worker.
VIDEO_SLOT = BoundedSemaphore(1)
VOICES = ('alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer')


def check_ffmpeg_available(ffmpeg_path='ffmpeg'):
    try:
        return subprocess.run([ffmpeg_path, '-version'], capture_output=True, timeout=10).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def get_audio_duration(path, ffmpeg_path='ffmpeg'):
    executable = Path(ffmpeg_path)
    probe = str(executable.with_name('ffprobe' + executable.suffix))
    result = subprocess.run([probe, '-v', 'error', '-show_entries', 'format=duration',
                             '-of', 'default=noprint_wrappers=1:nokey=1', str(path)],
                            capture_output=True, text=True, timeout=30, check=True)
    duration = float(result.stdout.strip())
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('생성한 음성 파일의 길이를 확인할 수 없습니다.')
    return duration


def generate_tts_audio_sync(text, output_path, voice='alloy', speed=1.0, ffmpeg_path='ffmpeg'):
    from services.ai_providers import _get_model_type_provider_config, azure_client
    if not isinstance(text, str) or not text.strip() or len(text) > 4000:
        raise ValueError('발표 스크립트는 1~4000자로 입력하세요.')
    if voice not in VOICES or not math.isfinite(speed) or not 0.5 <= speed <= 2:
        raise ValueError('음성 또는 읽기 속도 설정이 올바르지 않습니다.')
    config = _get_model_type_provider_config('tts')
    params = dict(model=config['deployment'], input=text.strip(), voice=voice,
                  response_format='mp3', speed=speed)
    instructions = setting('TTS_INSTRUCTIONS', '')
    if instructions:
        params['instructions'] = instructions
    with azure_client(config) as client:
        with client.audio.speech.with_streaming_response.create(**params) as response:
            response.stream_to_file(output_path)
    return get_audio_duration(output_path, ffmpeg_path)


def _run_ffmpeg(command):
    # Bound CPU threads and subprocess lifetime; do not retain unbounded logs.
    try:
        subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                       check=True, timeout=1800)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError('동영상 인코딩 시간이 초과되었습니다.') from error
    except subprocess.CalledProcessError as error:
        raise RuntimeError('동영상 인코딩에 실패했습니다. FFmpeg와 입력 파일을 확인하세요.') from error


def generate_narration_video(pages_data, output_path, voice='alloy', speed=1.0,
                             width=1280, height=720, fps=25, ffmpeg_path='ffmpeg',
                             progress_callback=None):
    """Stream each voice file to disk, encode one slide, then concatenate MP4s."""
    if not pages_data:
        raise ValueError('내보낼 슬라이드가 없습니다.')
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='sola-video-', dir=output.parent) as temporary:
        folder = Path(temporary)
        clips = []
        for i, page in enumerate(pages_data):
            image = Path(page['image_path'])
            if not image.is_file():
                raise ValueError(f'{i+1}번 슬라이드 이미지 파일이 없습니다.')
            if progress_callback:
                progress_callback('speech', f'{i+1}/{len(pages_data)} 페이지 음성을 생성하고 있습니다.', int(i/len(pages_data)*90))
            audio = folder / f'audio-{i}.mp3'
            duration = generate_tts_audio_sync(page['narration_text'], str(audio), voice, speed, ffmpeg_path)
            clip = folder / f'clip-{i}.mp4'
            filters = f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1'
            _run_ffmpeg([ffmpeg_path, '-hide_banner', '-loglevel', 'error', '-y',
                         '-threads', '1', '-filter_threads', '1', '-loop', '1', '-framerate', '1',
                         '-i', str(image), '-i', str(audio), '-vf', filters, '-r', str(fps),
                         '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage',
                         '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000',
                         '-ac', '2', '-b:a', '128k', '-t', str(duration), '-shortest', str(clip)])
            clips.append(clip)
            audio.unlink(missing_ok=True)
        manifest = folder / 'clips.txt'
        # Relative generated filenames avoid untrusted input in the concat format.
        manifest.write_text(''.join(f"file '{clip.name}'\n" for clip in clips), encoding='utf-8')
        final = folder / 'presentation.mp4'
        if progress_callback:
            progress_callback('encode', '발표 동영상을 저장하고 있습니다.', 95)
        _run_ffmpeg([ffmpeg_path, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat',
                     '-safe', '1', '-i', str(manifest), '-c', 'copy', '-movflags', '+faststart', str(final)])
        os.replace(final, output)
    return str(output)
