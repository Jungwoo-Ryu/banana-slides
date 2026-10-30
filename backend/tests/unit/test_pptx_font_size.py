"""Validation of character count performance and correctness。

Original from 200pt PV pt Try down. Every text element will be measured. 180+ Byword width
（CJK Fonts every time 0.4ms），Individual elements approximate 80ms；Intensive pages slow down to minutes.。
The change to two points must be consistent with the old results."The maximum number you can put down."）。
"""
import os

import pytest

from utils.pptx_builder import PPTXBuilder


def _reference_font_size(builder, bbox, text, dpi=96):
    """The old version of linear scans (activities prior to change) are achieved and used for price equivalence。"""
    width_px = bbox[2] - bbox[0]
    height_px = bbox[3] - bbox[1]
    usable_width_pt = (width_px / dpi) * 72
    usable_height_pt = (height_px / dpi) * 72
    if usable_width_pt <= 0 or usable_height_pt <= 0:
        return builder.MIN_FONT_SIZE

    line_height_ratio = 1.0
    use_precise = os.path.exists(builder.FONT_PATH)
    best_size = builder.MIN_FONT_SIZE

    for font_size in range(int(builder.MAX_FONT_SIZE), int(builder.MIN_FONT_SIZE) - 1, -1):
        font_size = float(font_size)
        total_required_lines = 0
        for line in text.split('\n'):
            if not line:
                total_required_lines += 1
                continue
            line_width_pt = None
            if use_precise:
                line_width_pt = builder._measure_text_width(line, font_size)
                if line_width_pt is None:
                    use_precise = False
            if line_width_pt is None:
                cjk_count = sum(
                    1 for c in line
                    if '\u4e00' <= c <= '\u9fff' or '\u3040' <= c <= '\u30ff' or '\uac00' <= c <= '\ud7af'
                )
                non_cjk_count = len(line) - cjk_count
                line_width_pt = (cjk_count * 1.0 + non_cjk_count * 0.5) * font_size
            total_required_lines += max(1, -(-int(line_width_pt) // int(usable_width_pt)))
        if total_required_lines * font_size * line_height_ratio <= usable_height_pt:
            best_size = font_size
            break
    return best_size


CASES = [
    ('Example Title', [40, 40, 1200, 120]),
    ('Page 17 Page 1 Example of article ABC 123', [60, 60, 900, 100]),
    ('a', [10, 10, 300, 60]),
    ('Short Title\n Second line text', [50, 50, 700, 200]),
    ('A long line of Chinese characters' * 12, [30, 30, 800, 300]),
    ('Mixed English, Chinese mixed content 2026', [20, 20, 640, 80]),
    ('Table Cell Contents', [100, 100, 260, 160]),
    ('A' * 120, [10, 10, 200, 40]),
    ('Very small box text', [10, 10, 12, 40]),
    ('Super-Back Text', [0, 0, 1900, 1000]),
]


@pytest.fixture
def builder():
    return PPTXBuilder()


def test_binary_search_matches_linear_scan(builder):
    for text, bbox in CASES:
        expected = _reference_font_size(builder, bbox, text)
        actual = builder.calculate_font_size(bbox, text, None, 96)
        assert actual == expected, f"text={text!r} bbox={bbox} expected={expected} actual={actual}"


def test_binary_search_measures_far_less_than_linear_scan(builder, monkeypatch):
    """The number of unit font width measurements should be reduced to ~8 Number of sessions (original) 180+ Numbers）。"""
    calls = {'count': 0}
    original = PPTXBuilder._measure_text_width.__func__

    def counting(cls, text, font_size):
        calls['count'] += 1
        return original(cls, text, font_size)

    monkeypatch.setattr(PPTXBuilder, '_measure_text_width', classmethod(counting))

    builder.calculate_font_size([40, 40, 1200, 120], 'Example Title ABC', None, 96)
    assert calls['count'] <= 12, f"measured {calls['count']} times"


def test_degenerate_bbox_does_not_crash(builder):
    """Low width 1.33px It’s... bbox I used to. ZeroDivisionError，Let the entire export fail。"""
    for width in (1, 1.3, 1.33):
        bbox = [100, 100, 100 + width, 140]
        assert builder.calculate_font_size(bbox, 'Example text ABC', None, 96) == builder.MIN_FONT_SIZE


def test_zero_size_bbox_returns_min_font_size(builder):
    assert builder.calculate_font_size([10, 10, 10, 10], 'Text', None, 96) == builder.MIN_FONT_SIZE
