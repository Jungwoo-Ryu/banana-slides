import { describe, expect, it } from 'vitest';
import { clampRegion, imageBounds, transformRegion, regionEditPrompt } from '@/utils/imageRegion';

const region = { x: 200, y: 100, width: 400, height: 300, imageWidth: 1280, imageHeight: 720 };

describe('original-pixel region editing', () => {
  it('maps a letterboxed image without counting empty space as image pixels', () => {
    const fit = imageBounds(1280, 720, 400, 400);
    expect(fit).toEqual({ scale: 0.3125, left: 0, top: 87.5 });
    expect((150 - fit.top) / fit.scale).toBe(200);
    expect(imageBounds(720, 1280, 400, 400).left).toBe(87.5);
  });

  it('moves to boundaries without shrinking the selected region', () => {
    expect(transformRegion(region, 'move', 2000, -2000)).toEqual({ ...region, x: 880, y: 0 });
    expect(transformRegion(region, 'move', 1, 10)).toEqual({ ...region, x: 201, y: 110 });
  });

  it('keeps the opposite corner fixed when resizing, including at image edges', () => {
    expect(transformRegion(region, 'nw', -500, -500)).toEqual({ ...region, x: 0, y: 0, width: 600, height: 400 });
    expect(transformRegion(region, 'se', 5000, 5000)).toEqual({ ...region, width: 1080, height: 620 });
    expect(transformRegion(region, 'nw', 5000, 5000)).toEqual({ ...region, x: 599, y: 399, width: 1, height: 1 });
  });

  it('clamps fractional and overflowing input to valid original pixels', () => {
    expect(clampRegion({ ...region, x: -1, y: 719.9, width: 2000, height: 0 })).toEqual({ ...region, x: 0, y: 719, width: 1280, height: 1 });
  });

  it('tells the model the source coordinates and preserves the user instruction', () => {
    const prompt = regionEditPrompt('제목을 파란색으로 변경', region);
    expect(prompt).toContain('1280 x 720');
    expect(prompt).toContain('x=200, y=100, width=400, height=300');
    expect(prompt).toContain('Return the complete slide');
    expect(prompt.endsWith('제목을 파란색으로 변경')).toBe(true);
  });
});
