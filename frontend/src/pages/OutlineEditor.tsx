import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, ArrowRight, Plus, FileText, Sparkle, Download, Upload, PanelLeftClose, PanelLeftOpen, ChevronDown, Settings2 } from 'lucide-react';
import logoUrl from '@/assets/sola-sun.svg';
import { useT } from '@/hooks/useT';
import PresetCapsules from '@/components/shared/PresetCapsules';

// Translation within Component
const outlineI18n = {
  zh: {
    home: { title: 'Sol.A' },
    outline: {
      title: "Edit Outline", pageCount: "{{count}} pages", addPage: "Add Page",
      generateDescriptions: "Generate Descriptions", generating: "Generating...", chapter: "Chapter",
      page: "Page {{num}}", titleLabel: "Title", keyPoints: "Key Points",
      keyPointsPlaceholder: "Key points (one per line)", addKeyPoint: "Add Key Point",
      deletePage: "Delete Page", confirmDeletePage: "Are you sure you want to delete this page?",
      preview: "Preview", clickToPreview: "Click a card on the left to view details",
      noPages: "No pages yet", noPagesHint: "Click \"Add Page\" to create manually, or \"Auto Generate\" to let AI help you",
      parseOutline: "Parse Outline", autoGenerate: "Auto Generate Outline",
      reParseOutline: "Re-parse Outline", reGenerate: "Regenerate Outline", export: "Export Outline", import: "Import", importExport: "Import/Export",
      aiPlaceholder: "e.g., Add a page about XXX, delete page 3, merge first two pages... · Ctrl+Enter to submit",
      aiPlaceholderShort: "e.g., Add/delete pages... · Ctrl+Enter",
      contextLabels: { idea: "PPT Idea", outline: "Outline", description: "Description" },
      inputLabel: { idea: "PPT Idea", outline: "Original Outline", description: "Page Descriptions", ppt_renovation: "Original PPT Content" },
      inputPlaceholder: { idea: "Enter your PPT idea...", outline: "Enter outline content...", description: "Enter page descriptions...", ppt_renovation: "Content extracted from PDF" },
      outlineRequirements: "Generation Requirements",
      outlineRequirementsPlaceholder: "e.g., Limit to 10 pages, max 3 points per page, use more charts...",
      importModalTitle: "Import Markdown",
      importModalDesc: "Paste Markdown directly, or upload a `.md`, `.markdown`, or `.txt` file. Imported pages will be appended to the current project.",
      importPasteLabel: "Paste Content",
      importPastePlaceholder: "Paste outline or outline+description Markdown here...",
      importUploadLabel: "Upload File",
      importUploadHint: "Click to choose a file, or drag a Markdown file here",
      importUploadFormatsHint: "Supports `.md`, `.markdown`, `.txt`",
      importPreviewReady: "{{count}} page(s) will be appended to this project",
      importPreviewEmpty: "No importable pages detected. Use `## Page N: Title` or `## Page N Page: Title`.",
      importConfirm: "Import into Project",
      importCancel: "Cancel",
      messages: {
        outlineEmpty: "Outline cannot be empty", generateSuccess: "Descriptions generated successfully", generateFailed: "Failed to generate descriptions",
        generateIncomplete: "Outline generation may be incomplete, please review and retry",
        confirmRegenerate: "Regenerating will update all page titles. Existing descriptions and images are preserved by position, but if the new outline has fewer pages, extra pages and their content will be removed. Continue?",
        confirmRegenerateTitle: "Confirm Regenerate",
        lockPageCount: "Lock page count (prevent reduction, fill with blank pages)",
        refineSuccess: "Outline modified successfully",
        refineFailed: "Modification failed, please try again", exportSuccess: "Export successful",
        importSuccess: "Import successful", importFailed: "Import failed, please check file format", importEmpty: "No valid pages found in file",
        importContentEmpty: "Paste some content or upload a file first",
        importReadFailed: "Failed to read file, please try again",
        importInvalidFileType: "Only .md, .markdown, or .txt files can be imported",
        loadingProject: "Loading project...", generatingOutline: "Generating outline...",
        saveFailed: "Save failed",
      }
    }
  },
  en: {
    home: { title: 'Sol.A' },
    outline: {
      title: "Edit Outline", pageCount: "{{count}} pages", addPage: "Add Page",
      generateDescriptions: "Generate Descriptions", generating: "Generating...", chapter: "Chapter",
      page: "Page {{num}}", titleLabel: "Title", keyPoints: "Key Points",
      keyPointsPlaceholder: "Key points (one per line)", addKeyPoint: "Add Key Point",
      deletePage: "Delete Page", confirmDeletePage: "Are you sure you want to delete this page?",
      preview: "Preview", clickToPreview: "Click a card on the left to view details",
      noPages: "No pages yet", noPagesHint: "Click \"Add Page\" to create manually, or \"Auto Generate\" to let AI help you",
      parseOutline: "Parse Outline", autoGenerate: "Auto Generate Outline",
      reParseOutline: "Re-parse Outline", reGenerate: "Regenerate Outline", export: "Export Outline", import: "Import", importExport: "Import/Export",
      aiPlaceholder: "e.g., Add a page about XXX, delete page 3, merge first two pages... · Ctrl+Enter to submit",
      aiPlaceholderShort: "e.g., Add/delete pages... · Ctrl+Enter",
      contextLabels: { idea: "PPT Idea", outline: "Outline", description: "Description" },
      inputLabel: { idea: "PPT Idea", outline: "Original Outline", description: "Page Descriptions", ppt_renovation: "Original PPT Content" },
      inputPlaceholder: { idea: "Enter your PPT idea...", outline: "Enter outline content...", description: "Enter page descriptions...", ppt_renovation: "Content extracted from PDF" },
      outlineRequirements: "Generation Requirements",
      outlineRequirementsPlaceholder: "e.g., Limit to 10 pages, max 3 points per page, use more charts...",
      importModalTitle: "Import Markdown",
      importModalDesc: "Paste Markdown directly, or upload a `.md`, `.markdown`, or `.txt` file. Imported pages will be appended to the current project.",
      importPasteLabel: "Paste Content",
      importPastePlaceholder: "Paste outline or outline+description Markdown here...",
      importUploadLabel: "Upload File",
      importUploadHint: "Click to choose a file, or drag a Markdown file here",
      importUploadFormatsHint: "Supports `.md`, `.markdown`, `.txt`",
      importPreviewReady: "{{count}} page(s) will be appended to this project",
      importPreviewEmpty: "No importable pages detected. Use `## Page N: Title` or `## Page N Page: Title`.",
      importConfirm: "Import into Project",
      importCancel: "Cancel",
      messages: {
        outlineEmpty: "Outline cannot be empty", generateSuccess: "Descriptions generated successfully", generateFailed: "Failed to generate descriptions",
        generateIncomplete: "Outline generation may be incomplete, please review and retry",
        confirmRegenerate: "Regenerating will update all page titles. Existing descriptions and images are preserved by position, but if the new outline has fewer pages, extra pages and their content will be removed. Continue?",
        confirmRegenerateTitle: "Confirm Regenerate",
        lockPageCount: "Lock page count (prevent reduction, fill with blank pages)",
        refineSuccess: "Outline modified successfully",
        refineFailed: "Modification failed, please try again", exportSuccess: "Export successful",
        importSuccess: "Import successful", importFailed: "Import failed, please check file format", importEmpty: "No valid pages found in file",
        importContentEmpty: "Paste some content or upload a file first",
        importReadFailed: "Failed to read file, please try again",
        importInvalidFileType: "Only .md, .markdown, or .txt files can be imported",
        loadingProject: "Loading project...", generatingOutline: "Generating outline...",
        saveFailed: "Save failed",
      }
    }
  }
};
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Loading, useConfirm, useToast, AiRefineInput, FilePreviewModal, ReferenceFileList, MaterialSelector, ImportMarkdownModal } from '@/components/shared';
import { MarkdownTextarea, type MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';
import { OutlineCard } from '@/components/outline/OutlineCard';
import { useProjectStore } from '@/store/useProjectStore';
import { refineOutline, updateProject, addPages } from '@/api/endpoints';
import { useImagePaste, buildMaterialsMarkdown } from '@/hooks/useImagePaste';
import type { Material } from '@/types';
import { exportProjectToMarkdown, parseMarkdownPages } from '@/utils/projectUtils';
import type { Page } from '@/types';

// Sortable card wrapper
const SortableCard: React.FC<{
  page: Page;
  index: number;
  projectId?: string;
  showToast: (props: { message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;
  onUpdate: (data: Partial<Page>) => void;
  onDelete: () => void;
  onClick: () => void;
  isSelected: boolean;
  isAiRefining?: boolean;
}> = (props) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: props.page.id || `page-${props.index}`,
  });

  const style = {
    // Use only offsets, not zooms, and avoid stretching elements while dragging
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <OutlineCard {...props} dragHandleProps={listeners} />
    </div>
  );
};

export const OutlineEditor: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT(outlineI18n);
  const { projectId } = useParams<{ projectId: string }>();
  const fromHistory = (location.state as any)?.from === 'history';
  const {
    currentProject,
    syncProject,
    updatePageLocal,
    saveAllPages,
    reorderPages,
    deletePageById,
    addNewPage,
    generateOutlineStream,
    isGlobalLoading,
    outlineStreamingProjectIds,
  } = useProjectStore();

  const isOutlineStreaming = Boolean(
    currentProject?.id && outlineStreamingProjectIds.includes(currentProject.id)
  );

  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [isAiRefining, setIsAiRefining] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  // Skeleton fade-out: keep it mounted briefly after streaming ends
  const [skeletonVisible, setSkeletonVisible] = useState(false);
  const [skeletonFading, setSkeletonFading] = useState(false);
  useEffect(() => {
    if (isOutlineStreaming) {
      setSkeletonVisible(true);
      setSkeletonFading(false);
    } else if (skeletonVisible) {
      setSkeletonFading(true);
      const timer = setTimeout(() => {
        setSkeletonVisible(false);
        setSkeletonFading(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOutlineStreaming]);
  const { confirm, ConfirmDialog } = useConfirm();
  const { show, ToastContainer } = useToast();
  const autoGenerateStartedRef = useRef<string | null>(null);

  // Left Editable Text Area — desktop and mobile use separate refs to avoid
  // the shared-ref bug where insertAtCursor targets the wrong (hidden) instance.
  const desktopTextareaRef = useRef<MarkdownTextareaRef>(null);
  const mobileTextareaRef = useRef<MarkdownTextareaRef>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const getInputText = useCallback((project: typeof currentProject) => {
    if (!project) return '';
    if (project.creation_type === 'outline' || project.creation_type === 'ppt_renovation') return project.outline_text || project.idea_prompt || '';
    if (project.creation_type === 'descriptions') return project.description_text || project.idea_prompt || '';
    return project.idea_prompt || '';
  }, []);

  const [inputText, setInputText] = useState('');
  const [isInputDirty, setIsInputDirty] = useState(false);
  const [outlineRequirements, setOutlineRequirements] = useState('');
  const [isRequirementsDirty, setIsRequirementsDirty] = useState(false);
  const reqTextareaRef = useRef<MarkdownTextareaRef>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  const [activeMaterialTarget, setActiveMaterialTarget] = useState<'input' | 'requirements'>('input');

  const handleInputMaterialSelect = useCallback((materials: Material[]) => {
    const markdown = buildMaterialsMarkdown(materials, setInputText);
    const targetRef = desktopTextareaRef.current || mobileTextareaRef.current;
    targetRef?.insertAtCursor(markdown + '\n');
  }, []);

  const handleReqMaterialSelect = useCallback((materials: Material[]) => {
    const markdown = buildMaterialsMarkdown(materials, setOutlineRequirements);
    reqTextareaRef.current?.insertAtCursor(markdown + '\n');
  }, []);

  // Click External Close Down
  useEffect(() => {
    if (!fileMenuOpen && !settingsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      const element = target instanceof Element ? target : target.parentElement;
      if (element?.closest('[role="dialog"]')) return;
      if (fileMenuRef.current && !fileMenuRef.current.contains(target)) {
        setFileMenuOpen(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(target)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [fileMenuOpen, settingsOpen]);

  // Item switching： Force loading of text
  useEffect(() => {
    if (currentProject) {
      setInputText(getInputText(currentProject));
      setIsInputDirty(false);
      setOutlineRequirements(currentProject.outline_requirements || '');
      setIsRequirementsDirty(false);
    }
  }, [currentProject?.id]);

  const saveInputText = useCallback(async (text: string, creationType: string | undefined) => {
    if (!projectId || !creationType) return;
    try {
      const field = creationType === 'outline'
        ? 'outline_text'
        : creationType === 'descriptions'
          ? 'description_text'
          : 'idea_prompt';
      await updateProject(projectId, { [field]: text } as any);
      await syncProject(projectId);
      setIsInputDirty(false);
    } catch (e) {
      console.error('Failed to save input text:', e);
      show({ message: t('outline.messages.saveFailed'), type: 'error' });
    }
  }, [projectId, show, syncProject]);

  // Debounced auto-save: save 1s after user stops typing
  useEffect(() => {
    if (!isInputDirty) return;
    const timer = setTimeout(() => {
      saveInputText(inputText, currentProject?.creation_type);
    }, 1000);
    return () => clearTimeout(timer);
  }, [inputText, isInputDirty, saveInputText, currentProject?.creation_type]);

  // Debounced auto-save for outline requirements
  useEffect(() => {
    if (!isRequirementsDirty || !projectId) return;
    const timer = setTimeout(async () => {
      try {
        await updateProject(projectId, { outline_requirements: outlineRequirements });
        setIsRequirementsDirty(false);
      } catch (e) {
        console.error('Failed to save outline request:', e);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [outlineRequirements, isRequirementsDirty, projectId]);

  const handleSaveInputText = useCallback(() => {
    if (!isInputDirty) return;
    saveInputText(inputText, currentProject?.creation_type);
  }, [inputText, isInputDirty, saveInputText, currentProject?.creation_type]);

  const handleInputChange = useCallback((text: string) => {
    setInputText(text);
    setIsInputDirty(true);
  }, []);

  const insertAtCursor = useCallback((markdown: string) => {
    // Prefer the desktop ref (visible at md+), fall back to mobile
    const ref = desktopTextareaRef.current || mobileTextareaRef.current;
    ref?.insertAtCursor(markdown);
  }, []);

  const { handlePaste: handleImagePaste, handleFiles: handleImageFiles, isUploading: _isUploadingImage } = useImagePaste({
    projectId: projectId || null,
    setContent: setInputText,
    showToast: show,
    insertAtCursor,
  });

  const insertAtReqCursor = useCallback((markdown: string) => {
    reqTextareaRef.current?.insertAtCursor(markdown);
  }, []);

  const { handlePaste: handleReqImagePaste, handleFiles: handleReqImageFiles } = useImagePaste({
    projectId: projectId || null,
    setContent: (updater) => {
      setOutlineRequirements(updater);
      setIsRequirementsDirty(true);
    },
    showToast: show,
    insertAtCursor: insertAtReqCursor,
  });

  // No blank items AI Source text generated, source input area and"Auto Generate Outline"Not applicable.
  const isBlankProject = currentProject?.creation_type === 'blank';

  const inputLabel = useMemo(() => {
    const type = currentProject?.creation_type || 'idea';
    const key = type === 'descriptions' ? 'description' : type;
    return t(`outline.inputLabel.${key}` as any) || t('outline.contextLabels.idea');
  }, [currentProject?.creation_type, t]);

  const inputPlaceholder = useMemo(() => {
    const type = currentProject?.creation_type || 'idea';
    const key = type === 'descriptions' ? 'description' : type;
    return t(`outline.inputPlaceholder.${key}` as any) || '';
  }, [currentProject?.creation_type, t]);

  // Loading project data
  useEffect(() => {
    if (projectId && (!currentProject || currentProject.id !== projectId)) {
      syncProject(projectId);
    }
  }, [projectId, currentProject, syncProject]);

  // Drag and Drag Sensor Configuration
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && currentProject) {
      const oldIndex = currentProject.pages.findIndex((p) => p.id === active.id);
      const newIndex = currentProject.pages.findIndex((p) => p.id === over.id);

      const reorderedPages = arrayMove(currentProject.pages, oldIndex, newIndex);
      reorderPages(reorderedPages.map((p) => p.id).filter((id): id is string => id !== undefined));
    }
  };

  const handleGenerateOutline = async () => {
    if (!currentProject) return;

    const doGenerate = async (lockPageCount?: boolean) => {
      try {
        const result = await generateOutlineStream(lockPageCount);
        const { currentProject: updatedProject } = useProjectStore.getState();
        const pageCount = updatedProject?.pages.length ?? 0;
        if (result?.active && (!result.complete || pageCount === 0)) {
          show({ message: t('outline.messages.generateIncomplete'), type: 'warning' });
        }
      } catch (error: any) {
        console.error('Failed to generate outline:', error);
        const message = error.friendlyMessage || error.message || t('outline.messages.generateFailed');
        show({ message, type: 'error' });
      }
    };

    if (currentProject.pages.length > 0) {
      confirm(
        t('outline.messages.confirmRegenerate'),
        doGenerate,
        {
          title: t('outline.messages.confirmRegenerateTitle'),
          variant: 'warning',
          checkboxLabel: t('outline.messages.lockPageCount'),
          checkboxDefaultChecked: false
        }
      );
      return;
    }

    await doGenerate();
  };

  useEffect(() => {
    if (!currentProject?.id || currentProject.pages.length > 0 || isOutlineStreaming) return;
    if (!['idea', 'outline', 'descriptions'].includes(currentProject.creation_type || 'idea')) return;
    if (autoGenerateStartedRef.current === currentProject.id) return;

    autoGenerateStartedRef.current = currentProject.id;
    void (async () => {
      try {
        const result = await generateOutlineStream();
        const { currentProject: updatedProject } = useProjectStore.getState();
        const pageCount = updatedProject?.pages.length ?? 0;
        if (result?.active && (!result.complete || pageCount === 0)) {
          show({ message: t('outline.messages.generateIncomplete'), type: 'warning' });
        }
      } catch (error: any) {
        console.error('Failed to automatically generate outline:', error);
        const message = error.message || t('outline.messages.generateFailed');
        show({ message, type: 'error' });
      }
    })();
  }, [currentProject?.id, currentProject?.pages.length, currentProject?.creation_type, generateOutlineStream, isOutlineStreaming, show, t]);

  const handleAiRefineOutline = useCallback(async (requirement: string, previousRequirements: string[]) => {
    if (!currentProject || !projectId) return;

    try {
      const response = await refineOutline(projectId, requirement, previousRequirements);
      await syncProject(projectId);
      show({
        message: response.data?.message || t('outline.messages.refineSuccess'),
        type: 'success'
      });
    } catch (error: any) {
      console.error('Failed to modify outline:', error);
      const errorMessage = error?.response?.data?.error?.message
        || error?.message
        || t('outline.messages.refineFailed');
      show({ message: errorMessage, type: 'error' });
      throw error;
    }
  }, [currentProject, projectId, syncProject, show]);

  // Export Outline As Markdown Documentation
  const handleExportOutline = useCallback(() => {
    if (!currentProject) return;
    exportProjectToMarkdown(currentProject, { outline: true, description: false });
    show({ message: t('outline.messages.exportSuccess'), type: 'success' });
  }, [currentProject, show]);

  // Import Outline Markdown（Add New Page）
  const handleImportOutline = useCallback(async (text: string) => {
    if (!currentProject || !projectId) return;
    try {
      const parsed = parseMarkdownPages(text);
      if (parsed.length === 0) {
        show({ message: t('outline.messages.importEmpty'), type: 'error' });
        throw new Error('empty-import');
      }
      const startIndex = currentProject.pages.reduce((max, p) => Math.max(max, (p.order_index ?? 0) + 1), 0);
      await addPages(projectId, parsed.map(({ title, points, text: desc, part, extra_fields }, i) => (
        {
          outline_content: { title, points },
          description_content: desc ? { text: desc, ...(extra_fields ? { extra_fields } : {}) } : undefined,
          part,
          order_index: startIndex + i,
        }
      )));
      await syncProject(projectId);
      show({ message: t('outline.messages.importSuccess'), type: 'success' });
    } catch (error) {
      if (error instanceof Error && error.message === 'empty-import') {
        throw error;
      }
      show({ message: t('outline.messages.importFailed'), type: 'error' });
      throw error;
    }
  }, [currentProject, projectId, syncProject, show, t]);

  const getImportPreviewCount = useCallback((markdown: string) => (
    parseMarkdownPages(markdown).length
  ), []);


  if (!currentProject) {
    return <Loading fullscreen message={t('outline.messages.loadingProject')} />;
  }

  if (isGlobalLoading && !isOutlineStreaming) {
    return <Loading fullscreen message={t('outline.messages.generatingOutline')} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background-primary flex flex-col">
      {/* Topbar */}
      <header className="bg-white dark:bg-background-secondary shadow-sm dark:shadow-background-primary/30 border-b border-gray-200 dark:border-border-primary px-3 md:px-6 py-2 md:py-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-2 md:gap-4">
          {/* Left：Logo and title */}
          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => {
                if (fromHistory) {
                  navigate('/history');
                } else {
                  navigate('/');
                }
              }}
              className="flex-shrink-0"
            >
              <span className="hidden sm:inline">{t('common.back')}</span>
            </Button>
            <div className="flex items-center gap-1.5 md:gap-2">
              <img src={logoUrl} alt="" className="w-6 h-6 md:w-8 md:h-8 object-contain flex-shrink-0" />
              <span className="text-base md:text-xl font-bold">{t('home.title')}</span>
            </div>
            <span className="text-gray-400 hidden lg:inline">|</span>
            <span className="text-sm md:text-lg font-semibold hidden lg:inline">{t('outline.title')}</span>
          </div>

          {/* Centre：AI Modify Input Box */}
          <div className="flex-1 max-w-xl mx-auto hidden md:block md:-translate-x-2 pr-10">
            <AiRefineInput
              title=""
              placeholder={t('outline.aiPlaceholder')}
              onSubmit={handleAiRefineOutline}
              disabled={false}
              className="!p-0 !bg-transparent !border-0"
              onStatusChange={setIsAiRefining}
            />
          </div>

          {/* Right： Operation button */}
          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            <Button
              variant="primary"
              size="sm"
              icon={<ArrowRight size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={async () => {
                if (isInputDirty && projectId && currentProject && !isBlankProject) {
                  const field = currentProject.creation_type === 'outline'
                    ? 'outline_text'
                    : currentProject.creation_type === 'descriptions'
                      ? 'description_text'
                      : 'idea_prompt';
                  try {
                    await updateProject(projectId, { [field]: inputText } as any);
                  } catch (e) {
                    console.error('Autosave failed:', e);
                  }
                }
                navigate(`/project/${projectId}/detail`);
              }}
              className="text-xs md:text-sm"
            >
              <span className="hidden sm:inline">{t('common.next')}</span>
            </Button>
          </div>
        </div>

        {/* Move Side：AI Input Box */}
        <div className="mt-2 md:hidden">
            <AiRefineInput
            title=""
            placeholder={t('outline.aiPlaceholderShort')}
            onSubmit={handleAiRefineOutline}
            disabled={false}
            className="!p-0 !bg-transparent !border-0"
            onStatusChange={setIsAiRefining}
          />
        </div>
      </header>

      {/* Operations Bar - and DetailEditor The style is the same. */}
      <div className="bg-white dark:bg-background-secondary border-b border-gray-200 dark:border-border-primary px-3 md:px-6 py-3 md:py-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 flex-1">
            <Button
              variant="primary"
              icon={<Plus size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={addNewPage}
              className="flex-1 sm:flex-initial text-sm md:text-base"
            >
              {t('outline.addPage')}
            </Button>
            {isBlankProject ? null : currentProject.pages.length === 0 && !isOutlineStreaming ? (
              <Button
                variant="secondary"
                onClick={handleGenerateOutline}
                disabled={isOutlineStreaming}
                className="flex-1 sm:flex-initial text-sm md:text-base"
              >
                {currentProject.creation_type === 'outline' ? t('outline.parseOutline') : t('outline.autoGenerate')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={handleGenerateOutline}
                disabled={isOutlineStreaming}
                className="flex-1 sm:flex-initial text-sm md:text-base"
              >
                {isOutlineStreaming
                  ? t('outline.generating')
                  : currentProject.creation_type === 'outline' ? t('outline.reParseOutline') : t('outline.reGenerate')}
              </Button>
            )}
            {/* Settings popover */}
            <div className="relative" ref={settingsRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsOpen(!settingsOpen)}
                icon={<span className="relative"><Settings2 size={16} className="md:w-[18px] md:h-[18px]" />{outlineRequirements && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-banana-400" />}</span>}
                title={t('outline.outlineRequirements')}
              />
              {settingsOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 w-80 rounded-xl border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary shadow-lg dark:shadow-none p-4 space-y-3">
                  <label className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-foreground-tertiary">
                    {t('outline.outlineRequirements')}
                  </label>
                  <div data-testid="outline-requirements-textarea">
                    <MarkdownTextarea
                      ref={reqTextareaRef}
                      value={outlineRequirements}
                      onChange={(val) => { setOutlineRequirements(val); setIsRequirementsDirty(true); }}
                      onPaste={handleReqImagePaste}
                      onFiles={handleReqImageFiles}
                      onSelectFromLibrary={() => { setActiveMaterialTarget('requirements'); setIsMaterialSelectorOpen(true); }}
                      placeholder={t('outline.outlineRequirementsPlaceholder')}
                      className="ring-inset"
                      rows={2}
                      showImagePreview={false}
                    />
                  </div>
                  <PresetCapsules
                    type="outline"
                    onAppend={(text) => {
                      setOutlineRequirements((prev) => prev ? `${prev}\n${text}` : text);
                      setIsRequirementsDirty(true);
                    }}
                  />
                </div>
              )}
            </div>
            {/* Import and Export Dropdown Menu */}
            <div className="relative" ref={fileMenuRef}>
              <Button
                variant="secondary"
                onClick={() => setFileMenuOpen(!fileMenuOpen)}
                icon={<FileText size={16} className="md:w-[18px] md:h-[18px]" />}
                className="flex-1 sm:flex-initial text-sm md:text-base"
              >
                {t('outline.importExport')}
                <ChevronDown size={14} className={`ml-1 transition-transform duration-200 ${fileMenuOpen ? 'rotate-180' : ''}`} />
              </Button>
              {fileMenuOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 w-full rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary shadow-lg dark:shadow-none overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { handleExportOutline(); setFileMenuOpen(false); }}
                    disabled={currentProject.pages.length === 0}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 dark:text-foreground-tertiary hover:bg-gray-50 dark:hover:bg-background-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                  >
                    <Download size={14} />
                    {t('outline.export')}
                  </button>
                  <div className="border-t border-gray-100 dark:border-border-primary" />
                  <button
                    type="button"
                    onClick={() => { setIsImportModalOpen(true); setFileMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 dark:text-foreground-tertiary hover:bg-gray-50 dark:hover:bg-background-hover transition-colors duration-150"
                  >
                    <Upload size={14} />
                    {t('outline.import')}
                  </button>
                </div>
              )}
            </div>
            {/* Mobile： Save buttons */}
            <Button
              variant="secondary"
              icon={<Save size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={async () => await saveAllPages()}
              className="md:hidden flex-1 sm:flex-initial text-sm md:text-base"
            >
              {t('common.save')}
            </Button>
            <span className="text-xs md:text-sm text-gray-500 dark:text-foreground-tertiary whitespace-nowrap">
              {t('outline.pageCount', { count: String(currentProject.pages.length) })}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col md:flex-row gap-3 md:gap-6 p-3 md:p-6 overflow-y-auto min-h-0 relative">
        {/* Left： Editable Text Area (Closed)）—— Blank items without source text, do not appear */}
        <div
          className={`flex-shrink-0 transition-[width] duration-300 ease-in-out ${isBlankProject ? 'hidden' : 'hidden md:block'}`}
          style={{ width: isPanelOpen ? undefined : 0 }}
        >
          <div
            className="w-[320px] lg:w-[360px] xl:w-[400px] transition-[opacity,transform] duration-300 ease-in-out md:sticky md:top-0"
            style={{
              opacity: isPanelOpen ? 1 : 0,
              transform: isPanelOpen ? 'translateX(0)' : 'translateX(-16px)',
              pointerEvents: isPanelOpen ? 'auto' : 'none',
            }}
          >
            <div className="bg-white dark:bg-background-secondary rounded-card shadow-md border border-gray-100 dark:border-border-primary overflow-hidden">
              <div className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-100 dark:border-border-secondary">
                {currentProject.creation_type === 'idea'
                  ? <Sparkle size={14} className="text-banana-500 flex-shrink-0" />
                  : <FileText size={14} className="text-banana-500 flex-shrink-0" />}
                <span className="text-xs font-medium text-gray-500 dark:text-foreground-tertiary">{inputLabel}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsPanelOpen(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-foreground-secondary rounded hover:bg-gray-100 dark:hover:bg-background-hover transition-colors"
                  >
                    <PanelLeftClose size={14} />
                  </button>
                </div>
              </div>
              <MarkdownTextarea
                ref={desktopTextareaRef}
                value={inputText}
                onChange={handleInputChange}
                onBlur={handleSaveInputText}
                onPaste={handleImagePaste}
                onFiles={handleImageFiles}
                onSelectFromLibrary={() => { setActiveMaterialTarget('input'); setIsMaterialSelectorOpen(true); }}
                placeholder={inputPlaceholder}
                rows={12}
                className="border-0 rounded-none shadow-none"
              />
            </div>
            <ReferenceFileList
              projectId={projectId}
              onFileClick={setPreviewFileId}
              className="mt-3"
              showToast={show}
            />
          </div>
        </div>

        {/* The handle when you put it away. - Absolute position to left edge */}
        {!isPanelOpen && !isBlankProject && (
          <button
            type="button"
            onClick={() => setIsPanelOpen(true)}
            className="hidden md:flex absolute left-0 top-6 z-10 items-center justify-center w-6 h-14 bg-white dark:bg-background-secondary border border-l-0 border-gray-200 dark:border-border-primary rounded-r-lg shadow-md text-gray-400 hover:text-banana-500 hover:border-banana-300 dark:hover:border-banana-500/40 hover:shadow-lg transition-all"
          >
            <PanelLeftOpen size={14} />
          </button>
        )}

        {/* Moving end： always display cards (no source text for blank items, no display)） */}
        <div className={`${isBlankProject ? 'hidden' : 'md:hidden'} w-full flex-shrink-0`}>
          <div className="bg-white dark:bg-background-secondary rounded-card shadow-md border border-gray-100 dark:border-border-primary overflow-hidden">
            <div className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-100 dark:border-border-secondary">
              {currentProject.creation_type === 'idea'
                ? <Sparkle size={14} className="text-banana-500 flex-shrink-0" />
                : <FileText size={14} className="text-banana-500 flex-shrink-0" />}
              <span className="text-xs font-medium text-gray-500 dark:text-foreground-tertiary">{inputLabel}</span>
            </div>
            <MarkdownTextarea
              ref={mobileTextareaRef}
              value={inputText}
              onChange={handleInputChange}
              onBlur={handleSaveInputText}
              onPaste={handleImagePaste}
              onFiles={handleImageFiles}
              onSelectFromLibrary={() => { setActiveMaterialTarget('input'); setIsMaterialSelectorOpen(true); }}
              placeholder={inputPlaceholder}
              rows={6}
              className="border-0 rounded-none shadow-none"
            />
          </div>
          <ReferenceFileList
            projectId={projectId}
            onFileClick={setPreviewFileId}
            className="mt-3"
            showToast={show}
          />
        </div>

        {/* Right： outline list */}
        <div className="flex-1 min-w-0">
          {currentProject.pages.length === 0 && !isOutlineStreaming ? (
            <div className="text-center py-12 md:py-20">
              <div className="flex justify-center mb-4">
                <FileText size={48} className="text-gray-300" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-foreground-primary mb-2">
                {t('outline.noPages')}
              </h3>
              <p className="text-gray-500 dark:text-foreground-tertiary mb-6">
                {t('outline.noPagesHint')}
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={currentProject.pages.map((p, idx) => p.id || `page-${idx}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3 md:space-y-4">
                  {currentProject.pages.map((page, index) => (
                    <div
                      key={page.id || `page-${index}`}
                      className={isOutlineStreaming ? 'animate-slide-in-up' : ''}
                      style={isOutlineStreaming ? { animationDelay: `${index * 60}ms` } : undefined}
                    >
                      <SortableCard
                        page={page}
                        index={index}
                        projectId={projectId}
                        showToast={show}
                        onUpdate={(data) => page.id && updatePageLocal(page.id, data)}
                        onDelete={() => page.id && deletePageById(page.id)}
                        onClick={() => setSelectedPageId(page.id || null)}
                        isSelected={selectedPageId === page.id}
                        isAiRefining={isAiRefining}
                      />
                    </div>
                  ))}
                  {skeletonVisible && (
                    <div
                      className="transition-opacity duration-1000"
                      style={{ opacity: skeletonFading ? 0 : 1 }}
                    >
                      <div className="animate-pulse">
                        <div className="bg-white dark:bg-background-secondary rounded-xl shadow-sm border border-gray-100 dark:border-border-primary p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded mt-1" />
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2">
                              <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
                              <div className="h-4 w-16 bg-banana-100 dark:bg-banana-900/30 rounded" />
                            </div>
                            <div className="h-5 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" />
                            <div className="space-y-2">
                              <div className="h-3.5 w-full bg-gray-100 dark:bg-gray-800 rounded" />
                              <div className="h-3.5 w-4/5 bg-gray-100 dark:bg-gray-800 rounded" />
                              <div className="h-3.5 w-3/5 bg-gray-100 dark:bg-gray-800 rounded" />
                            </div>
                          </div>
                        </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </main>
      {ConfirmDialog}
      <ToastContainer />
      <FilePreviewModal fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
      <ImportMarkdownModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportOutline}
        title={t('outline.importModalTitle')}
        description={t('outline.importModalDesc')}
        pasteLabel={t('outline.importPasteLabel')}
        pastePlaceholder={t('outline.importPastePlaceholder')}
        uploadLabel={t('outline.importUploadLabel')}
        uploadHint={t('outline.importUploadHint')}
        uploadFormatsHint={t('outline.importUploadFormatsHint')}
        getPreviewCount={getImportPreviewCount}
        previewReadyLabel={(count) => t('outline.importPreviewReady', { count })}
        previewEmptyLabel={t('outline.importPreviewEmpty')}
        importButtonLabel={t('outline.importConfirm')}
        cancelButtonLabel={t('outline.importCancel')}
        emptyError={t('outline.messages.importContentEmpty')}
        readFileError={t('outline.messages.importReadFailed')}
        invalidFileTypeError={t('outline.messages.importInvalidFileType')}
      />
      <MaterialSelector
        projectId={projectId}
        isOpen={isMaterialSelectorOpen}
        onClose={() => setIsMaterialSelectorOpen(false)}
        onSelect={activeMaterialTarget === 'input' ? handleInputMaterialSelect : handleReqMaterialSelect}
        multiple
      />
    </div>
  );
};
