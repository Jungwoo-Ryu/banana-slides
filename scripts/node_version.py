"""Minimum security patches for CVE-2026-111497; unknown majors fail closed."""
import re
MINIMUM = {22: (22, 23, 4), 24: (24, 22, 1), 26: (26, 12, 1)}


def require_secure_node(version):
    match = re.fullmatch(r'v?(\d+)\.(\d+)\.(\d+)', version)
    parsed = tuple(map(int, match.groups())) if match else ()
    if not parsed or parsed[0] not in MINIMUM or parsed < MINIMUM[parsed[0]]:
        raise RuntimeError('보안 패치된 Node.js가 필요합니다: 22.23.4+, 24.22.1+, 26.12.1+ (지원되는 각 메이저 버전). 현재: ' + version)
