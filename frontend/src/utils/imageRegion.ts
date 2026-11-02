export interface ImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}

export type RegionHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

/** All stored coordinates use original image pixels, independent of browser zoom. */
export function imageBounds(imageWidth: number, imageHeight: number, width: number, height: number) {
  const scale = Math.min(width / imageWidth, height / imageHeight);
  return { scale, left: (width - imageWidth * scale) / 2, top: (height - imageHeight * scale) / 2 };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.round(value), max));

export function clampRegion(region: ImageRegion): ImageRegion {
  const x = clamp(region.x, 0, region.imageWidth - 1);
  const y = clamp(region.y, 0, region.imageHeight - 1);
  return { ...region, x, y, width: clamp(region.width, 1, region.imageWidth - x), height: clamp(region.height, 1, region.imageHeight - y) };
}

export function transformRegion(region: ImageRegion, handle: RegionHandle, dx: number, dy: number): ImageRegion {
  if (handle === 'move') {
    return { ...region, x: clamp(region.x + dx, 0, region.imageWidth - region.width), y: clamp(region.y + dy, 0, region.imageHeight - region.height) };
  }
  let { x, y } = region;
  let right = x + region.width;
  let bottom = y + region.height;
  if (handle.includes('w')) x = clamp(x + dx, 0, right - 1);
  if (handle.includes('n')) y = clamp(y + dy, 0, bottom - 1);
  if (handle.includes('e')) right = clamp(right + dx, x + 1, region.imageWidth);
  if (handle.includes('s')) bottom = clamp(bottom + dy, y + 1, region.imageHeight);
  return { ...region, x, y, width: right - x, height: bottom - y };
}

/** Create the model reference only on submission; selection never adds attachments. */
export async function createRegionReference(src: string, region: ImageRegion): Promise<File> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not load the selected image.'));
    img.src = src;
  });
  if (img.naturalWidth !== region.imageWidth || img.naturalHeight !== region.imageHeight) {
    throw new Error('The image changed. Select the region again.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = region.width;
  canvas.height = region.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image canvas is unavailable.');
  ctx.drawImage(img, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (result) => result ? resolve(result) : reject(new Error('Could not prepare the selected region.')), 'image/png',
  ));
  return new File([blob], `selected-region-${region.x}-${region.y}-${region.width}x${region.height}.png`, { type: 'image/png' });
}

export function regionEditPrompt(prompt: string, region: ImageRegion): string {
  return `Edit the selected region of the original ${region.imageWidth} x ${region.imageHeight} pixel slide. ` +
    `Region in original image pixels (origin: top-left): x=${region.x}, y=${region.y}, width=${region.width}, height=${region.height}. ` +
    'An additional reference image shows a crop of this region. Apply the requested change inside this region and preserve the rest of the slide. ' +
    'Return the complete slide, not a crop.\n\n' + prompt;
}
