"""Correlated image-generation events without prompts, keys or response bodies."""
from contextlib import contextmanager
from contextvars import ContextVar
import json
import logging
import os
import re
import time
import traceback

logger = logging.getLogger(__name__)
_context = ContextVar('image_generation', default={})


def failure_details(error, stage):
    chain = []
    current = error
    while current is not None and id(current) not in {id(e) for e in chain}:
        chain.append(current)
        current = current.__cause__ or current.__context__
    source = next((e for e in chain if isinstance(getattr(e, 'status_code', None), int)), chain[-1])
    status = getattr(source, 'status_code', None)
    code = getattr(source, 'code', None)
    message = '이미지 생성에 실패했습니다. 작업 ID로 백엔드 로그를 확인하세요.'
    category = 'IMAGE_GENERATION_FAILED'
    if status in (401, 403):
        category, message = 'AZURE_IMAGE_AUTH', 'Azure 이미지 배포의 API 키와 접근 권한을 확인하세요.'
    elif status == 404:
        category, message = 'AZURE_IMAGE_DEPLOYMENT', 'AZURE_OPENAI_IMAGE_DEPLOYMENT의 배포 이름과 엔드포인트·API 버전을 확인하세요.'
    elif status == 429:
        category, message = 'AZURE_IMAGE_RATE_LIMIT', 'Azure 이미지 요청 한도에 도달했습니다. 잠시 후 실패한 페이지만 다시 시도하세요.'
    elif status == 400:
        category, message = 'AZURE_IMAGE_REQUEST', 'Azure 이미지 요청이 거부되었습니다. 배포의 지원 API·해상도·품질 설정과 콘텐츠 정책을 확인하세요.'
    elif isinstance(status, int) and status >= 500:
        category, message = 'AZURE_IMAGE_UNAVAILABLE', 'Azure 이미지 서비스가 일시적으로 응답하지 못했습니다. 잠시 후 다시 시도하세요.'
    elif any('timeout' in type(e).__name__.lower() for e in chain):
        category, message = 'AZURE_IMAGE_TIMEOUT', 'Azure 이미지 응답 시간이 초과되었습니다. 연결과 OPENAI_TIMEOUT 설정을 확인하세요.'
    elif any('connect' in type(e).__name__.lower() for e in chain):
        category, message = 'AZURE_IMAGE_CONNECTION', 'Azure 이미지 서비스에 연결할 수 없습니다. 엔드포인트·프록시·사내 인증서를 확인하세요.'
    elif any('AZURE_OPENAI_IMAGE_DEPLOYMENT' in str(e) for e in chain):
        category, message = 'AZURE_IMAGE_CONFIG', 'AZURE_OPENAI_IMAGE_DEPLOYMENT에 사내 이미지 배포 이름을 설정하고 백엔드를 재시작하세요.'
    stage = next((getattr(e, 'generation_stage') for e in chain if getattr(e, 'generation_stage', None)), stage)
    if stage == 'decode_image':
        category, message = 'AZURE_IMAGE_RESPONSE', 'Azure 이미지 응답이 비어 있거나 손상되었습니다. API 호환성을 확인하고 다시 시도하세요.'
    elif stage == 'save_image':
        category, message = 'IMAGE_SAVE_FAILED', '생성된 이미지를 저장하지 못했습니다. 업로드 폴더 권한·디스크 공간·DB 상태를 확인하세요.'
    elif stage == 'description':
        category, message = 'IMAGE_DESCRIPTION_REQUIRED', '페이지 설명을 먼저 작성하고 저장한 뒤 이미지를 생성하세요.'
    elif stage == 'template':
        category, message = 'IMAGE_TEMPLATE_REQUIRED', '페이지 템플릿 또는 디자인 스타일을 설정하고 참조 파일을 확인하세요.'
    details = {'code': category, 'stage': stage, 'message': message, 'exception_type': type(source).__name__}
    if isinstance(status, int):
        details['http_status'] = status
    for name, value in (('provider_code', code), ('provider_request_id', getattr(source, 'request_id', None)), ('parameter', getattr(source, 'param', None))):
        if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', value) and not value.startswith(('sk-', 'https:', 'http:')):
            details[name] = value
    return details


def event(stage, outcome, **fields):
    payload = {**_context.get(), 'stage': stage, 'outcome': outcome, **fields}
    level = logging.ERROR if outcome == 'failed' else logging.INFO
    logger.log(level, 'image_generation %s', json.dumps(payload, ensure_ascii=False))


def log_failure(error, stage, **fields):
    details = failure_details(error, stage)
    frames = [{'file': os.path.basename(f.filename), 'line': f.lineno, 'function': f.name}
              for f in traceback.extract_tb(error.__traceback__)]
    event(details['stage'], 'failed', **{k: v for k, v in details.items() if k != 'stage'}, stack=frames, **fields)
    return details


@contextmanager
def generation_context(**fields):
    token = _context.set({**_context.get(), **fields})
    try:
        yield
    finally:
        _context.reset(token)


@contextmanager
def generation_stage(stage, **fields):
    started = time.monotonic()
    event(stage, 'started', **fields)
    try:
        yield
    except Exception as error:
        if not getattr(error, 'generation_stage', None):
            error.generation_stage = stage
        log_failure(error, stage, elapsed_ms=round((time.monotonic() - started) * 1000), **fields)
        raise
    else:
        event(stage, 'completed', elapsed_ms=round((time.monotonic() - started) * 1000), **fields)
