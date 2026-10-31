"""Korean operational messages. Never expose upstream response bodies or secrets."""
import re


def localize_error(message):
    text = str(message or '')
    # Provider responses can include echoed credentials, URLs and uploaded data.
    if any(term in text.lower() for term in ('certificate', 'ssl', 'tls')):
        return 'HTTPS 인증서 검증에 실패했습니다. 사내 Root CA(CORPORATE_CA_FILE)와 프록시 설정을 확인하세요.'
    if any(term in text.lower() for term in ('401', '403', 'unauthorized', 'api key', 'api_key')) and not re.search('[가-힣]', text):
        return 'API 인증 또는 권한을 확인할 수 없습니다. 환경변수의 키와 배포 접근 권한을 확인하세요.'
    if any(term in text.lower() for term in ('429', 'rate limit', 'quota')):
        return '모델 사용량 또는 요청 한도에 도달했습니다. 잠시 후 다시 시도하거나 할당량을 확인하세요.'
    if any(term in text.lower() for term in ('timeout', 'timed out')):
        return '처리 시간이 초과되었습니다. 서비스 연결 상태를 확인한 후 다시 시도하세요.'
    if any(term in text.lower() for term in ('connect', 'network', 'proxy')) and not re.search('[가-힣]', text):
        return '서비스에 연결할 수 없습니다. 주소와 프록시 설정을 확인하세요.'
    # Korean application validation messages are safe when no embedded payload exists.
    if re.search('[가-힣]', text) and not re.search(r'https?://|Bearer |sk-|Traceback|\{|[\u3400-\u9fff]', text):
        return text[:400]
    field = re.match(r'^(idea_prompt|outline_text|description_text|template_style|pages)(?:\[\d+\])?\b', text)
    if field:
        names = {'idea_prompt':'발표 아이디어','outline_text':'개요','description_text':'페이지 설명','template_style':'스타일 설명','pages':'페이지'}
        return f'{names[field.group(1)]} 입력 형식을 확인하세요. 비어 있지 않은 올바른 값을 입력해야 합니다.'
    if 'not found' in text.lower():
        return '요청한 항목을 찾을 수 없습니다.'
    if 'required' in text.lower() or 'missing' in text.lower():
        return '필수 입력 또는 설정이 누락되었습니다. 입력 내용을 확인하세요.'
    return '작업을 완료하지 못했습니다. 입력과 서비스 설정을 확인한 후 다시 시도하세요.'


def localize_progress(value):
    """Translate operational fields only; preserve all user/AI content fields."""
    if isinstance(value, dict):
        result = dict(value)
        for key in ('message','current_step','help_text','watchdog_message_text','warning'):
            if isinstance(result.get(key), str): result[key] = status_message(result[key])
        for key in ('messages','warnings'):
            if isinstance(result.get(key), list): result[key] = [status_message(x) for x in result[key]]
        if 'error_details' in result and isinstance(result['error_details'], dict):
            result['error_details'] = {k:v for k,v in result['error_details'].items() if k != 'technical_message'}
        return result
    return value


def status_message(value):
    text = str(value or '')
    if re.search('[가-힣]', text) and not re.search('[\u3400-\u9fff]', text): return text
    categories = (
        (('Failed','Error','failed','error'), '처리 중 오류가 발생했습니다. 설정과 입력 내용을 확인하세요.'),
        (('Completed','Success','complete','success','created','saved','updated','deleted'), '완료했습니다.'),
        (('Background','background'), '배경을 복원하는 중입니다.'),
        (('Save','saving'), '파일을 저장하는 중입니다.'),
        (('Styles','style'), '스타일을 분석하는 중입니다.'),
        (('Analysis','Parsing','extract','analy','parsing'), '내용을 분석하는 중입니다.'),
        (('Generate','generat'), '생성하는 중입니다.'),
        (('Ready.','Here we go.','Configuration','prepar','start'), '작업을 준비하는 중입니다.'),
    )
    for terms, message in categories:
        if any(term in text.lower() for term in terms): return message
    return '작업을 처리하는 중입니다.'
