import React, { useEffect, useRef, useState } from 'react';
import { Move, Scan, X } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { clampRegion, imageBounds, transformRegion, type ImageRegion, type RegionHandle } from '@/utils/imageRegion';

const english = { regionEditor: {
  title: 'Region editing', original: 'Original image', select: 'Select region', clear: 'Clear selection',
  hint: 'Drag to select · Drag the selection to move · Resize with the handles',
  keyboard: 'Arrow keys: 1 px · Shift + arrow: 10 px', selected: 'Selected region',
  empty: 'Select an area to edit, or enter a prompt to edit the entire slide.',
  x: 'X position', y: 'Y position', width: 'Width', height: 'Height',
  move: 'Move selected region', resize: 'Resize selected region: {{direction}}',
  nw: 'top left', n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left',
} };

interface Props {
  src: string;
  alt: string;
  aspectRatio: string;
  value: ImageRegion | null;
  onChange: (region: ImageRegion | null) => void;
  disabled?: boolean;
}

function PixelField({ label, short, value, max, min = 0, disabled, empty, onChange }: {
  label: string; short: string; value: number; max: number; min?: number; disabled?: boolean; empty?: boolean; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const number = Number(draft);
    if (draft.trim() && Number.isFinite(number)) {
      const next = Math.max(min, Math.min(Math.round(number), max));
      onChange(next);
      setDraft(String(next));
    } else setDraft(String(value));
  };
  return <label className="flex min-w-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 dark:border-border-primary dark:bg-background-primary">
    <span aria-hidden="true" className="text-[11px] font-semibold text-gray-400">{short}</span>
    <input type="number" aria-label={label} value={empty ? '' : draft} placeholder="—" min={min} max={max} step={1} disabled={disabled}
      onChange={(event) => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
      className="w-full min-w-0 bg-transparent text-right text-xs font-medium tabular-nums text-gray-800 outline-none focus:text-amber-700 dark:text-foreground-primary dark:focus:text-banana-400" />
    <span className="text-[10px] text-gray-400">px</span>
  </label>;
}

const handles: { name: Exclude<RegionHandle, 'move'>; left: string; top: string; cursor: string }[] = [
  { name: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
  { name: 'n', left: '50%', top: '0%', cursor: 'ns-resize' },
  { name: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
  { name: 'e', left: '100%', top: '50%', cursor: 'ew-resize' },
  { name: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
  { name: 's', left: '50%', top: '100%', cursor: 'ns-resize' },
  { name: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' },
  { name: 'w', left: '0%', top: '50%', cursor: 'ew-resize' },
];

export function RegionImageEditor({ src, alt, aspectRatio, value, onChange, disabled = false }: Props) {
  const t = useT({ zh: english, en: english });
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0, imageWidth: 0, imageHeight: 0 });
  const [enabled, setEnabled] = useState(true);
  const drag = useRef<{
    pointerId: number; x: number; y: number; handle: RegionHandle | 'draw'; initial: ImageRegion | null;
  } | null>(null);

  useEffect(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const measure = () => {
      // CSS layout dimensions exclude the modal's opening scale animation.
      const style = getComputedStyle(canvas);
      setSize({ width: parseFloat(style.width), height: parseFloat(style.height), imageWidth: img.naturalWidth, imageHeight: img.naturalHeight });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    img.addEventListener('load', measure);
    measure();
    return () => { observer.disconnect(); img.removeEventListener('load', measure); };
  }, [src]);

  const ready = size.width > 0 && size.height > 0 && size.imageWidth > 0 && size.imageHeight > 0;
  const bounds = ready ? imageBounds(size.imageWidth, size.imageHeight, size.width, size.height) : { scale: 1, left: 0, top: 0 };
  const point = (event: React.PointerEvent) => {
    const box = canvasRef.current!.getBoundingClientRect();
    const actual = imageBounds(size.imageWidth, size.imageHeight, box.width, box.height);
    return { x: (event.clientX - box.left - actual.left) / actual.scale, y: (event.clientY - box.top - actual.top) / actual.scale };
  };
  const updateDrag = (event: React.PointerEvent<HTMLDivElement>, finish = false) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const pos = point(event);
    if (current.handle !== 'draw' && current.initial) {
      onChange(transformRegion(current.initial, current.handle, pos.x - current.x, pos.y - current.y));
      return;
    }
    const x = Math.max(0, Math.min(pos.x, size.imageWidth));
    const y = Math.max(0, Math.min(pos.y, size.imageHeight));
    if (finish && (Math.abs(x - current.x) * bounds.scale < 4 || Math.abs(y - current.y) * bounds.scale < 4)) {
      onChange(current.initial);
      return;
    }
    onChange(clampRegion({
      x: Math.min(x, current.x), y: Math.min(y, current.y), width: Math.abs(x - current.x), height: Math.abs(y - current.y),
      imageWidth: size.imageWidth, imageHeight: size.imageHeight,
    }));
  };
  const keyboard = (event: React.KeyboardEvent, handle: RegionHandle) => {
    if (!value || disabled) return;
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!delta[event.key]) return;
    event.preventDefault(); event.stopPropagation();
    onChange(transformRegion(value, handle, ...delta[event.key]));
  };

  return <section data-testid="region-editor" className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-border-primary dark:bg-background-secondary">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5 dark:border-border-primary">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-800 dark:text-foreground-primary"><Scan size={15} className="text-amber-600 dark:text-banana-400" />{t('regionEditor.title')}</div>
      <div className="flex items-center gap-3">
        {ready && <span className="text-[11px] tabular-nums text-gray-500 dark:text-foreground-tertiary">{t('regionEditor.original')} {size.imageWidth} × {size.imageHeight} px</span>}
        <button type="button" aria-pressed={enabled} disabled={disabled} onClick={() => { setEnabled(!enabled); onChange(null); }}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${enabled ? 'bg-banana-100 text-amber-900 dark:bg-banana-500/20 dark:text-banana-300' : 'bg-gray-100 text-gray-600 dark:bg-background-elevated dark:text-foreground-secondary'}`}>
          {t('regionEditor.select')}
        </button>
      </div>
    </div>
    <div ref={canvasRef} data-testid="region-editor-canvas" className={`relative overflow-hidden bg-gray-100 dark:bg-background-primary ${enabled && !disabled ? 'cursor-crosshair touch-none' : ''}`} style={{ aspectRatio }}
      onPointerDown={(event) => {
        if (!ready || !enabled || disabled || event.button !== 0 || drag.current) return;
        const pos = point(event);
        const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-region-handle]')?.dataset.regionHandle as RegionHandle | undefined;
        if (!handle && (pos.x < 0 || pos.y < 0 || pos.x > size.imageWidth || pos.y > size.imageHeight)) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: pos.x, y: pos.y, handle: handle || 'draw', initial: value };
        if (handle) (event.target as HTMLElement).closest<HTMLElement>('[data-region-handle]')?.focus();
      }}
      onPointerMove={updateDrag}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        updateDrag(event, true);
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { if (drag.current) onChange(drag.current.initial); drag.current = null; }}
      onLostPointerCapture={() => { if (drag.current) onChange(drag.current.initial); drag.current = null; }}>
      <img ref={imageRef} src={src} alt={alt} crossOrigin="anonymous" draggable={false} className="h-full w-full select-none object-contain" />
      {ready && value && <div data-testid="region-selection" data-region-handle="move" role="group" tabIndex={disabled ? -1 : 0} aria-label={t('regionEditor.move')}
        onKeyDown={(event) => keyboard(event, 'move')} className="absolute cursor-move outline outline-2 outline-banana-400 focus-visible:outline-white"
        style={{ left: bounds.left + value.x * bounds.scale, top: bounds.top + value.y * bounds.scale, width: value.width * bounds.scale, height: value.height * bounds.scale, boxShadow: '0 0 0 9999px rgb(15 23 42 / 0.38)' }}>
        <div className="pointer-events-none absolute z-10 flex items-center gap-1.5 whitespace-nowrap rounded-md bg-gray-950/90 px-2 py-1 font-mono text-[10px] text-white shadow" style={{
          top: value.y * bounds.scale > 30 ? -30 : 8,
          left: Math.max(8 - bounds.left - value.x * bounds.scale, Math.min(8, size.width - bounds.left - value.x * bounds.scale - 250)),
          maxWidth: size.width - 16,
        }}>
          <Move size={11} className="text-banana-400" />{value.width} × {value.height} px <span className="text-gray-400">· X {value.x} Y {value.y}</span>
        </div>
        {handles.map(({ name, left, top, cursor }) => <button key={name} type="button" data-region-handle={name} disabled={disabled}
          aria-label={t('regionEditor.resize', { direction: t(`regionEditor.${name}`) })} onKeyDown={(event) => keyboard(event, name)}
          className="absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          style={{ left, top, cursor }}><span className="h-2.5 w-2.5 rounded-sm border border-amber-600 bg-white shadow-sm" /></button>)}
      </div>}
    </div>
    {/* Keep the controls at a fixed height so drawing never moves the canvas. */}
    <div className="space-y-2.5 border-t border-gray-100 px-3 py-3 dark:border-border-primary">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-gray-700 dark:text-foreground-primary"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{t('regionEditor.selected')}</span>
          <button type="button" disabled={disabled || !value} onClick={() => onChange(null)} className={`flex items-center gap-1 text-gray-500 hover:text-gray-900 dark:text-foreground-tertiary dark:hover:text-foreground-primary ${!value ? 'invisible' : ''}`}><X size={13} />{t('regionEditor.clear')}</button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['x', 'y', 'width', 'height'] as const).map((field, index) => <PixelField key={field} label={t(`regionEditor.${field}`)} short={['X', 'Y', 'W', 'H'][index]}
            value={value?.[field] ?? 0} min={index < 2 ? 0 : 1} disabled={disabled || !value} empty={!value}
            max={!value ? 0 : field === 'x' ? value.imageWidth - value.width : field === 'y' ? value.imageHeight - value.height : field === 'width' ? value.imageWidth - value.x : value.imageHeight - value.y}
            onChange={(next) => { if (value) onChange(clampRegion({ ...value, [field]: next })); }} />)}
        </div>
        <p className="h-14 text-[11px] text-gray-500 sm:h-9 dark:text-foreground-tertiary">{t(value ? 'regionEditor.hint' : 'regionEditor.empty')}<span className="mt-1 block text-gray-400">{t('regionEditor.keyboard')}</span></p>
    </div>
  </section>;
}
