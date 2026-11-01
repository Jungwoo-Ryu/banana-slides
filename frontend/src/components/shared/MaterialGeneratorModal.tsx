import { useMaterialRuns } from '@/hooks/useMaterialRuns';
import React, { useEffect, useRef, useState } from 'react';
import {
  Crop,
  Eraser,
  FolderOpen,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Maximize2,
  Minimize2,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { Modal } from './Modal';
import { useT } from '@/hooks/useT';
import { Textarea } from './Textarea';
import { Button } from './Button';
import { useToast } from './Toast';
import { MaterialSelector, materialUrlToFile } from './MaterialSelector';
import { ASPECT_RATIO_OPTIONS } from '@/config/aspectRatio';
import { useProjectStore } from '@/store/useProjectStore';
import { Skeleton } from './Loading';
import {
  processMaterialImage,
  type Material,
  type MaterialProcessOperation,
  type MaterialSelectionRect,
} from '@/api/endpoints';
import { getImageUrl } from '@/api/client';

const materialGeneratorI18n = {
  zh: {
    material: {
      backgroundHint: 'Tasks continue in the background. Start another material or select a task to view its result.',
      resumePolling: 'Resume polling',
      runStatus: { pending: 'Generating', completed: 'Completed', failed: 'Failed', paused: 'Running in background; polling paused' },
      title: 'Material Toolbox',
      saveToLibraryNote: 'Every processed result is saved as a new material. The original image stays untouched.',
      generatedResult: 'Result',
      generatedPreview: 'Processed output will appear here',
      sourceImage: 'Source Image',
      sourceImageHint: 'Full-image edit, region edit, and smart erase all need a source image first.',
      referenceImages: 'Reference Images (Optional)',
      mainReference: 'Primary Reference',
      extraReference: 'Extra References',
      clickToUpload: 'Click to upload',
      selectFromLibrary: 'Select from Library',
      promptLabel: 'Instruction',
      promptPlaceholderGenerate: 'e.g. Blue-purple gradient background with geometric shapes and tech-style lines for a tech-themed title page...',
      promptPlaceholderEdit: 'e.g. Restyle the image with brushed silver metal details while keeping the main composition...',
      promptPlaceholderRegion: 'e.g. Turn the selected button into glassmorphism with subtle highlights...',
      promptPlaceholderErase: 'Optional: describe what should fill the erased region, such as "clean white tabletop texture"',
      aspectRatioLabel: 'Aspect Ratio',
      toolModeLabel: 'Tool Mode',
      toolGenerate: 'Generate',
      toolEditFull: 'Full Edit',
      toolRegionEdit: 'Region Edit',
      toolEraseRegion: 'Smart Erase',
      runTool: 'Run Tool',
      toolGenerateDesc: 'Create a new material from prompt or refs',
      toolEditFullDesc: 'Restyle the whole source image',
      toolRegionEditDesc: 'Focus edits on the selected region',
      toolEraseRegionDesc: 'Remove selected content and heal the background',
      selectionLabel: 'Selection',
      selectionHint: 'Turn on selection mode, then drag on the image to choose the target region.',
      selectionReady: 'Selected {{width}} × {{height}} px area',
      selectionEmpty: 'No selection yet',
      startSelection: 'Start Selection',
      stopSelection: 'End Selection',
      applyModeLabel: 'How to apply the region result',
      applyOverlay: 'Overlay only the selected region',
      applyReplaceFull: 'Replace with the full generated image',
      useResultAsSource: 'Use result as new source',
      clearResult: 'Clear Result',
      enterFullscreen: 'Expand Fullscreen',
      exitFullscreen: 'Exit Fullscreen',
      messages: {
        enterPrompt: 'Please enter an instruction',
        chooseSource: 'Please choose a source image first',
        chooseSelection: 'Please select a region first',
        materialAdded: 'Added {{count}} material(s)',
        sourceLoaded: 'Source image loaded',
        generateSuccess: 'Material processed successfully and saved to the project library',
        generateSuccessGlobal: 'Material processed successfully and saved to the global library',
        generateComplete: 'Processing finished, but no result image URL was returned',
        generateFailed: 'Failed to process material',
        generateTimeout: 'Processing timed out. Please check the material library later',
        pollingFailed: 'Failed to poll task status. Please check the material library later',
        noTaskId: 'Processing failed: no task ID returned',
        loadMaterialFailed: 'Failed to load materials',
        resultPromoted: 'Result is now the new source image',
      },
    },
  },
  en: {
    material: {
      backgroundHint: 'Tasks continue in the background. Start another material or select a task to view its result.',
      resumePolling: 'Resume polling',
      runStatus: { pending: 'Generating', completed: 'Completed', failed: 'Failed', paused: 'Running in background; polling paused' },
      title: 'Material Toolbox',
      saveToLibraryNote: 'Every processed result is saved as a new material. The original image stays untouched.',
      generatedResult: 'Result',
      generatedPreview: 'Processed output will appear here',
      sourceImage: 'Source Image',
      sourceImageHint: 'Full-image edit, region edit, and smart erase all need a source image first.',
      referenceImages: 'Reference Images (Optional)',
      mainReference: 'Primary Reference',
      extraReference: 'Extra References',
      clickToUpload: 'Click to upload',
      selectFromLibrary: 'Select from Library',
      promptLabel: 'Instruction',
      promptPlaceholderGenerate: 'e.g. Blue-purple gradient background with geometric shapes and tech-style lines for a tech-themed title page...',
      promptPlaceholderEdit: 'e.g. Restyle the image with brushed silver metal details while keeping the main composition...',
      promptPlaceholderRegion: 'e.g. Turn the selected button into glassmorphism with subtle highlights...',
      promptPlaceholderErase: 'Optional: describe what should fill the erased region, such as "clean white tabletop texture"',
      aspectRatioLabel: 'Aspect Ratio',
      toolModeLabel: 'Tool Mode',
      toolGenerate: 'Generate',
      toolEditFull: 'Full Edit',
      toolRegionEdit: 'Region Edit',
      toolEraseRegion: 'Smart Erase',
      runTool: 'Run Tool',
      toolGenerateDesc: 'Create a new material from prompt or refs',
      toolEditFullDesc: 'Restyle the whole source image',
      toolRegionEditDesc: 'Focus edits on the selected region',
      toolEraseRegionDesc: 'Remove selected content and heal the background',
      selectionLabel: 'Selection',
      selectionHint: 'Turn on selection mode, then drag on the image to choose the target region.',
      selectionReady: 'Selected {{width}} × {{height}} px area',
      selectionEmpty: 'No selection yet',
      startSelection: 'Start Selection',
      stopSelection: 'End Selection',
      applyModeLabel: 'How to apply the region result',
      applyOverlay: 'Overlay only the selected region',
      applyReplaceFull: 'Replace with the full generated image',
      useResultAsSource: 'Use result as new source',
      clearResult: 'Clear Result',
      enterFullscreen: 'Expand Fullscreen',
      exitFullscreen: 'Exit Fullscreen',
      messages: {
        enterPrompt: 'Please enter an instruction',
        chooseSource: 'Please choose a source image first',
        chooseSelection: 'Please select a region first',
        materialAdded: 'Added {{count}} material(s)',
        sourceLoaded: 'Source image loaded',
        generateSuccess: 'Material processed successfully and saved to the project library',
        generateSuccessGlobal: 'Material processed successfully and saved to the global library',
        generateComplete: 'Processing finished, but no result image URL was returned',
        generateFailed: 'Failed to process material',
        generateTimeout: 'Processing timed out. Please check the material library later',
        pollingFailed: 'Failed to poll task status. Please check the material library later',
        noTaskId: 'Processing failed: no task ID returned',
        loadMaterialFailed: 'Failed to load materials',
        resultPromoted: 'Result is now the new source image',
      },
    },
  },
};

interface MaterialGeneratorModalProps {
  projectId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

type SelectorTarget = 'source' | 'references';
type DisplayRect = { left: number; top: number; width: number; height: number };
type ToolCard = {
  value: MaterialProcessOperation;
  icon: React.ReactNode;
  labelKey: string;
  descKey: string;
};

function getRenderedImageRect(img: HTMLImageElement) {
  const naturalWidth = img.naturalWidth || 1;
  const naturalHeight = img.naturalHeight || 1;
  const scale = Math.min(img.clientWidth / naturalWidth, img.clientHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  const left = (img.clientWidth - width) / 2;
  const top = (img.clientHeight - height) / 2;
  return { left, top, width, height, naturalWidth, naturalHeight };
}

const TOOL_CARDS: ToolCard[] = [
  { value: 'generate', icon: <Sparkles size={16} />, labelKey: 'material.toolGenerate', descKey: 'material.toolGenerateDesc' },
  { value: 'edit_full', icon: <Wand2 size={16} />, labelKey: 'material.toolEditFull', descKey: 'material.toolEditFullDesc' },
  { value: 'region_edit', icon: <Crop size={16} />, labelKey: 'material.toolRegionEdit', descKey: 'material.toolRegionEditDesc' },
  { value: 'erase_region', icon: <Eraser size={16} />, labelKey: 'material.toolEraseRegion', descKey: 'material.toolEraseRegionDesc' },
];

export const MaterialGeneratorModal: React.FC<MaterialGeneratorModalProps> = ({
  projectId,
  isOpen,
  onClose,
}) => {
  const t = useT(materialGeneratorI18n);
  const { show } = useToast();
  const currentProject = useProjectStore((s) => s.currentProject);

  const [toolMode, setToolMode] = useState<MaterialProcessOperation>('generate');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [applyMode, setApplyMode] = useState<'overlay_selection' | 'replace_full'>('overlay_selection');
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [refImage, setRefImage] = useState<File | null>(null);
  const [extraImages, setExtraImages] = useState<File[]>([]);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [refImageUrl, setRefImageUrl] = useState<string | null>(null);
  const [extraImageUrls, setExtraImageUrls] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const { runs, addRun, resume } = useMaterialRuns(projectId || 'global');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const activeRun = runs.find(run => run.taskId === activeTaskId) || runs[runs.length - 1];
  const isGenerating = activeRun?.status === 'pending' && !activeRun.paused;
  const [isCompleted, setIsCompleted] = useState(false);
  useEffect(() => {
    setActiveTaskId(null);
    setPreviewUrl(null);
    setIsCompleted(false);
  }, [projectId]);
  useEffect(() => {
    if (activeRun?.status === 'completed' && activeRun.previewUrl) {
      setPreviewUrl(getImageUrl(activeRun.previewUrl));
      setIsCompleted(true);
    }
  }, [activeRun]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState<SelectorTarget>('references');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<DisplayRect | null>(null);
  const [selectionPixels, setSelectionPixels] = useState<MaterialSelectionRect | null>(null);

  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const refInputRef = useRef<HTMLInputElement | null>(null);
  const extraInputRef = useRef<HTMLInputElement | null>(null);
  const isSelectingRegionRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      const projectAspectRatio =
        (projectId && currentProject?.id === projectId && currentProject.image_aspect_ratio) || '16:9';
      setAspectRatio(projectAspectRatio);
      setApplyMode('overlay_selection');
    }
  }, [isOpen, projectId, currentProject]);

  useEffect(() => {
    const nextUrl = sourceImage ? URL.createObjectURL(sourceImage) : null;
    setSourceImageUrl(nextUrl);
    return () => {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [sourceImage]);

  useEffect(() => {
    const nextUrl = refImage ? URL.createObjectURL(refImage) : null;
    setRefImageUrl(nextUrl);
    return () => {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [refImage]);

  useEffect(() => {
    const nextUrls = extraImages.map((file) => URL.createObjectURL(file));
    setExtraImageUrls(nextUrls);
    return () => {
      nextUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [extraImages]);

  useEffect(() => {
    if (toolMode === 'generate') {
      setIsSelectionMode(false);
      setSelectionStart(null);
      setSelectionRect(null);
      setSelectionPixels(null);
    }
  }, [toolMode]);

  useEffect(() => {
    if (!isOpen) {
      setIsFullscreen(false);
    }
  }, [isOpen]);

  const handleSourceImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files && e.target.files[0]) || null;
    if (!file) return;
    setSourceImage(file);
    setSelectionRect(null);
    setSelectionPixels(null);
    setSelectionStart(null);
    setIsSelectionMode(false);
    if (isCompleted) setIsCompleted(false);
  };

  const handleRefImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files && e.target.files[0]) || null;
    if (!file) return;
    setRefImage(file);
    if (isCompleted) setIsCompleted(false);
  };

  const handleExtraImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setExtraImages((prev) => [...prev, ...files]);
    if (isCompleted) setIsCompleted(false);
  };

  const removeExtraImage = (index: number) => {
    setExtraImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOpenMaterialSelector = (target: SelectorTarget) => {
    setSelectorTarget(target);
    setIsMaterialSelectorOpen(true);
  };

  const handleSelectMaterials = async (materials: Material[]) => {
    try {
      const files = await Promise.all(materials.map((material) => materialUrlToFile(material)));
      if (files.length === 0) return;

      if (selectorTarget === 'source') {
        setSourceImage(files[0]);
        setSelectionRect(null);
        setSelectionPixels(null);
        setSelectionStart(null);
        setIsSelectionMode(false);
        show({ message: t('material.messages.sourceLoaded'), type: 'success' });
        return;
      }

      if (!refImage) {
        const [first, ...rest] = files;
        setRefImage(first);
        if (rest.length > 0) {
          setExtraImages((prev) => [...prev, ...rest]);
        }
      } else {
        setExtraImages((prev) => [...prev, ...files]);
      }
      show({ message: t('material.messages.materialAdded', { count: files.length }), type: 'success' });
    } catch (error: any) {
      console.error('Failed to load materials:', error);
      show({
        message: `${t('material.messages.loadMaterialFailed')}: ${error.message || t('common.unknownError')}`,
        type: 'error',
      });
    }
  };

  const handleUseResultAsSource = async () => {
    if (!previewUrl) return;
    try {
      const response = await fetch(previewUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const ext = blob.type.includes('png') ? 'png' : 'jpg';
      const nextSource = new File([blob], `material-result.${ext}`, { type: blob.type || 'image/png' });
      setSourceImage(nextSource);
      setToolMode('edit_full');
      setSelectionRect(null);
      setSelectionPixels(null);
      setIsSelectionMode(false);
      show({ message: t('material.messages.resultPromoted'), type: 'success' });
    } catch (error: any) {
      console.error('Failed to load result as source:', error);
      show({ message: t('material.messages.loadMaterialFailed'), type: 'error' });
    }
  };

  const buildSelectionPayload = () => {
    if (!selectionPixels) return null;
    return selectionPixels;
  };

  const validateBeforeSubmit = () => {
    if (toolMode !== 'erase_region' && !prompt.trim()) {
      show({ message: t('material.messages.enterPrompt'), type: 'error' });
      return false;
    }

    if (toolMode !== 'generate' && !sourceImage) {
      show({ message: t('material.messages.chooseSource'), type: 'error' });
      return false;
    }

    if ((toolMode === 'region_edit' || toolMode === 'erase_region') && !selectionPixels) {
      show({ message: t('material.messages.chooseSelection'), type: 'error' });
      return false;
    }

    return true;
  };

  const handleGenerate = async () => {
    if (submittingRef.current || !validateBeforeSubmit()) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    setIsCompleted(false);
    try {
      const targetProjectId = projectId || 'none';
      const resp = await processMaterialImage(targetProjectId, {
        operation: toolMode,
        prompt: prompt.trim(),
        sourceImage,
        refImage,
        extraImages,
        aspectRatio,
        selection: buildSelectionPayload(),
        applyMode,
      });
      const taskId = resp.data?.task_id;
      if (taskId) {
        addRun({ taskId, prompt: prompt.trim(), status: 'pending' });
        setActiveTaskId(taskId);
        setPreviewUrl(null);
      } else {
        show({ message: t('material.messages.noTaskId'), type: 'error' });
      }
    } catch (error: any) {
      show({
        message: error?.response?.data?.error?.message || error.message || t('material.messages.generateFailed'),
        type: 'error',
      });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const updateSelectionFromPointer = (clientX: number, clientY: number) => {
    const img = sourceImageRef.current;
    if (!img || !selectionStart) return;

    const containerRect = img.getBoundingClientRect();
    const rendered = getRenderedImageRect(img);

    const currentX = Math.min(
      Math.max(clientX - containerRect.left, rendered.left),
      rendered.left + rendered.width
    );
    const currentY = Math.min(
      Math.max(clientY - containerRect.top, rendered.top),
      rendered.top + rendered.height
    );

    const left = Math.min(selectionStart.x, currentX);
    const top = Math.min(selectionStart.y, currentY);
    const width = Math.abs(currentX - selectionStart.x);
    const height = Math.abs(currentY - selectionStart.y);

    setSelectionRect({ left, top, width, height });
  };

  const finalizeSelection = () => {
    const img = sourceImageRef.current;
    if (!img || !selectionRect) {
      isSelectingRegionRef.current = false;
      setSelectionStart(null);
      return;
    }

    const rendered = getRenderedImageRect(img);
    const x = Math.round(((selectionRect.left - rendered.left) / rendered.width) * rendered.naturalWidth);
    const y = Math.round(((selectionRect.top - rendered.top) / rendered.height) * rendered.naturalHeight);
    const width = Math.round((selectionRect.width / rendered.width) * rendered.naturalWidth);
    const height = Math.round((selectionRect.height / rendered.height) * rendered.naturalHeight);

    if (width > 2 && height > 2) {
      setSelectionPixels({
        x,
        y,
        width,
        height,
        image_width: rendered.naturalWidth,
        image_height: rendered.naturalHeight,
      });
    } else {
      setSelectionRect(null);
      setSelectionPixels(null);
    }

    isSelectingRegionRef.current = false;
    setSelectionStart(null);
  };

  const handleSelectionMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelectionMode || !sourceImageRef.current) return;

    const img = sourceImageRef.current;
    const containerRect = img.getBoundingClientRect();
    const rendered = getRenderedImageRect(img);

    const x = Math.min(
      Math.max(e.clientX - containerRect.left, rendered.left),
      rendered.left + rendered.width
    );
    const y = Math.min(
      Math.max(e.clientY - containerRect.top, rendered.top),
      rendered.top + rendered.height
    );

    isSelectingRegionRef.current = true;
    setSelectionStart({ x, y });
    setSelectionRect({ left: x, top: y, width: 0, height: 0 });
  };

  const handleSelectionMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelectionMode || !isSelectingRegionRef.current || !selectionStart) return;
    updateSelectionFromPointer(e.clientX, e.clientY);
  };

  const handleSelectionMouseUp = () => {
    if (!isSelectionMode || !isSelectingRegionRef.current) return;
    finalizeSelection();
  };

  const currentPromptPlaceholder =
    toolMode === 'generate'
      ? t('material.promptPlaceholderGenerate')
      : toolMode === 'edit_full'
      ? t('material.promptPlaceholderEdit')
      : toolMode === 'region_edit'
      ? t('material.promptPlaceholderRegion')
      : t('material.promptPlaceholderErase');

  const selectionEnabled = toolMode === 'region_edit' || toolMode === 'erase_region';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('material.title')}
      size={isFullscreen ? 'full' : 'wide'}
      headerActions={(
        <button
          type="button"
          data-testid="material-fullscreen-toggle"
          onClick={() => setIsFullscreen((prev) => !prev)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-white/10 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-banana-400/50"
          aria-label={isFullscreen ? t('material.exitFullscreen') : t('material.enterFullscreen')}
          title={isFullscreen ? t('material.exitFullscreen') : t('material.enterFullscreen')}
        >
          {isFullscreen ? <Minimize2 size={17} strokeWidth={2} /> : <Maximize2 size={17} strokeWidth={2} />}
        </button>
      )}
    >
      <div className={`grid gap-6 ${isFullscreen ? 'xl:grid-cols-[360px_minmax(0,1fr)]' : 'lg:grid-cols-[320px_minmax(0,1fr)]'}`}>
        <aside className="space-y-5 lg:pr-6 lg:border-r lg:border-gray-200 dark:lg:border-border-primary">
          <section className="space-y-2">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('material.toolModeLabel')}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TOOL_CARDS.map((tool) => (
                <button
                  key={tool.value}
                  type="button"
                  onClick={() => {
                    setToolMode(tool.value);
                    if (isCompleted) setIsCompleted(false);
                  }}
                  title={t(tool.descKey)}
                  className={`rounded-lg border px-2.5 py-2 text-left transition-all ${
                    toolMode === tool.value
                      ? 'border-banana-500 bg-banana-50 dark:bg-background-secondary shadow-sm'
                      : 'border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800 dark:text-foreground-primary">
                    <span className={toolMode === tool.value ? 'text-banana-600 dark:text-banana' : 'text-gray-400 dark:text-foreground-tertiary'}>
                      {tool.icon}
                    </span>
                    {t(tool.labelKey)}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <Textarea
            label={t('material.promptLabel')}
            placeholder={currentPromptPlaceholder}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (isCompleted) setIsCompleted(false);
            }}
            rows={5}
          />

          {toolMode === 'generate' && (
            <section className="space-y-2">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('material.aspectRatioLabel')}</div>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_RATIO_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setAspectRatio(opt.value);
                      if (isCompleted) setIsCompleted(false);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      aspectRatio === opt.value
                        ? 'border-banana-500 bg-banana-50 dark:bg-background-secondary text-banana-700 dark:text-banana'
                        : 'border-gray-200 dark:border-border-primary text-gray-600 dark:text-foreground-secondary hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-background-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {toolMode === 'region_edit' && (
            <section className="space-y-2">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('material.applyModeLabel')}</div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setApplyMode('overlay_selection')}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                    applyMode === 'overlay_selection'
                      ? 'border-banana-500 bg-banana-50 dark:bg-background-secondary'
                      : 'border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t('material.applyOverlay')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setApplyMode('replace_full')}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                    applyMode === 'replace_full'
                      ? 'border-banana-500 bg-banana-50 dark:bg-background-secondary'
                      : 'border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t('material.applyReplaceFull')}</div>
                </button>
              </div>
            </section>
          )}

          <section className="pt-4 border-t border-gray-200 dark:border-border-primary space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 font-medium">
                <ImagePlus size={17} className="text-banana-600 dark:text-banana-400" />
                <span>{t('material.referenceImages')}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<FolderOpen size={16} />}
                onClick={() => handleOpenMaterialSelector('references')}
              />
            </div>

            <div className="flex flex-wrap gap-2 items-start">
              <div className="space-y-1.5">
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('material.mainReference')}</div>
                <div className="w-20 h-20 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-banana-400 dark:hover:border-banana-500 hover:bg-banana-50/60 dark:hover:bg-background-hover transition-all bg-white dark:bg-background-secondary relative group">
                  {refImage ? (
                    <>
                      <img
                        src={refImageUrl || ''}
                        alt={t('material.mainReference')}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setRefImage(null);
                        }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm z-10"
                      >
                        <X size={10} strokeWidth={2.5} />
                      </button>
                    </>
                  ) : (
                    <button
                      data-testid="material-ref-trigger"
                      type="button"
                      onClick={() => refInputRef.current?.click()}
                      className="flex flex-col items-center gap-1"
                    >
                      <ImageIcon size={20} className="text-gray-400 dark:text-gray-500" />
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">{t('material.clickToUpload')}</span>
                    </button>
                  )}
                  <input
                    ref={refInputRef}
                    data-testid="material-ref-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleRefImageChange}
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-1.5">
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('material.extraReference')}</div>
                <div className="flex flex-wrap gap-2">
                  {extraImages.map((file, idx) => (
                    <div key={`${file.name}-${idx}`} className="relative group">
                      <img
                        src={extraImageUrls[idx] || ''}
                        alt={`extra-${idx + 1}`}
                        className="w-14 h-14 object-cover rounded-lg border border-gray-200 dark:border-border-primary shadow-sm"
                      />
                      <button
                        onClick={() => removeExtraImage(idx)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                      >
                        <X size={10} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                  <button
                    data-testid="material-extra-trigger"
                    type="button"
                    onClick={() => extraInputRef.current?.click()}
                    className="w-14 h-14 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-banana-400 dark:hover:border-banana-500 hover:bg-banana-50/60 dark:hover:bg-background-hover transition-all bg-white dark:bg-background-secondary"
                  >
                    <Upload size={14} className="text-gray-400 dark:text-gray-500" />
                  </button>
                  <input
                    ref={extraInputRef}
                    data-testid="material-extra-input"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleExtraImagesChange}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleClose}>
              {t('common.close')}
            </Button>
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={isSubmitting || (toolMode !== 'erase_region' && !prompt.trim())}
              className="shadow-lg shadow-banana-500/20"
            >
              {isSubmitting ? t('common.loading') : t('material.runTool')}
            </Button>
          </div>
        </aside>

        <section className="min-w-0 flex flex-col">
          {runs.length > 0 && <div className="mb-3 max-h-40 overflow-auto space-y-2" data-testid="material-runs">
            <p className="text-sm text-gray-500">{t('material.backgroundHint')}</p>
            {runs.map((run, index) => <div key={run.taskId} className="flex gap-2 items-center text-sm">
              <button type="button" aria-pressed={activeRun?.taskId === run.taskId} onClick={() => {
                setActiveTaskId(run.taskId); setPreviewUrl(run.previewUrl ? getImageUrl(run.previewUrl) : null);
              }} className="text-left truncate flex-1 p-2 rounded border dark:border-border-primary">
                #{index + 1} {run.prompt || t('material.runTool')} · {t(`material.runStatus.${run.paused ? 'paused' : run.status}`)}
              </button>
              {run.error && <span role="alert" className="text-red-600">{run.error}</span>}
              {run.paused && <button type="button" onClick={() => resume(run.taskId)}>{t('material.resumePolling')}</button>}
            </div>)}
          </div>}

          <div className="grid grid-cols-2 gap-4 flex-1">
            <div className="rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary p-4 flex flex-col">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <Layers size={16} className="text-banana-600 dark:text-banana-400" />
                  {t('material.sourceImage')}
                </h4>
                <div className="flex flex-shrink-0 gap-1.5">
                  <Button variant="ghost" size="sm" icon={<FolderOpen size={16} />} onClick={() => handleOpenMaterialSelector('source')} />
                  <Button
                    data-testid="material-source-trigger"
                    variant="ghost"
                    size="sm"
                    icon={<Upload size={16} />}
                    onClick={() => sourceInputRef.current?.click()}
                  />
                  <input
                    ref={sourceInputRef}
                    data-testid="material-source-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleSourceImageChange}
                  />
                </div>
              </div>

              <div
                data-testid="material-source-canvas"
                className="relative rounded-lg overflow-hidden border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/40 flex-1 min-h-[200px]"
                onMouseDown={handleSelectionMouseDown}
                onMouseMove={handleSelectionMouseMove}
                onMouseUp={handleSelectionMouseUp}
                onMouseLeave={handleSelectionMouseUp}
              >
                {sourceImageUrl ? (
                  <>
                    {selectionEnabled && (
                      <button
                        data-testid="material-selection-toggle"
                        type="button"
                        onClick={() => {
                          setIsSelectionMode((prev) => !prev);
                          isSelectingRegionRef.current = false;
                          setSelectionStart(null);
                        }}
                        className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-full bg-white/90 dark:bg-black/60 text-xs font-medium text-gray-700 dark:text-gray-100 shadow-sm flex items-center gap-1.5"
                      >
                        <Crop size={13} />
                        {isSelectionMode ? t('material.stopSelection') : t('material.startSelection')}
                      </button>
                    )}
                    <img
                      ref={sourceImageRef}
                      src={sourceImageUrl}
                      alt={t('material.sourceImage')}
                      className="w-full h-full object-contain select-none"
                      draggable={false}
                    />
                    {selectionRect && (
                      <div
                        className="absolute border-2 border-banana-500 bg-banana-400/15 pointer-events-none"
                        style={{
                          left: selectionRect.left,
                          top: selectionRect.top,
                          width: selectionRect.width,
                          height: selectionRect.height,
                        }}
                      />
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center text-gray-400 dark:text-gray-500 p-6">
                    <ImagePlus size={42} className="mb-3" />
                    <div className="text-sm font-medium">{t('material.sourceImage')}</div>
                    <div className="text-xs mt-1 max-w-xs">{t('material.sourceImageHint')}</div>
                  </div>
                )}
              </div>

              {selectionEnabled && (
                <div className="mt-3 pl-4 border-l-4 border-banana-300 dark:border-banana-600">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                    {t('material.selectionLabel')}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {selectionPixels
                      ? t('material.selectionReady', { width: selectionPixels.width, height: selectionPixels.height })
                      : t('material.selectionHint')}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary p-4 flex flex-col">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <Sparkles size={16} className="text-banana-600 dark:text-banana-400" />
                  {t('material.generatedResult')}
                </h4>
                {previewUrl && (
                  <div className="flex flex-shrink-0 gap-1.5">
                    <Button variant="ghost" size="sm" onClick={handleUseResultAsSource} icon={<Layers size={16} />} title={t('material.useResultAsSource')} />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<X size={16} />}
                      title={t('material.clearResult')}
                      onClick={() => {
                        setPreviewUrl(null);
                        setIsCompleted(false);
                      }}
                    />
                  </div>
                )}
              </div>
              {isGenerating ? (
                <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-border-primary shadow-inner flex-1 min-h-[200px]">
                  <Skeleton className="w-full h-full" />
                </div>
              ) : previewUrl ? (
                <div className="bg-white dark:bg-gray-900/50 rounded-lg overflow-hidden border border-gray-200 dark:border-border-primary flex items-center justify-center shadow-inner flex-1 min-h-[200px]">
                  <img
                    src={previewUrl}
                    alt={t('material.generatedResult')}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-800/30 rounded-lg flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 text-sm border border-dashed border-gray-300 dark:border-gray-600 flex-1 min-h-[200px]">
                  <ImageIcon size={48} className="mb-3 opacity-50" />
                  <div className="font-medium">{t('material.generatedPreview')}</div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 text-center">
        {t('material.saveToLibraryNote')}
      </p>

      <MaterialSelector
        projectId={projectId || undefined}
        isOpen={isMaterialSelectorOpen}
        onClose={() => setIsMaterialSelectorOpen(false)}
        onSelect={handleSelectMaterials}
        multiple={selectorTarget === 'references'}
      />
    </Modal>
  );
};
