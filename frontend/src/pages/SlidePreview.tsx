import { generateUuid } from '@/utils/uuid';
// TODO: split components
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useT } from '@/hooks/useT';
import { devLog } from '@/utils/logger';

// Translation within Component
const previewI18n = {
  zh: {
    home: { title: 'Sol.A' },
    nav: { home: 'Home', materialGenerate: 'Generate Material' },
    slidePreview: {
      pageGenerating: "This page is generating, please wait...", generationStarted: "Image generation started, please wait...",
      versionSwitched: "Switched to this version", outlineSaved: "Outline and description saved",
      materialsAdded: "Added {{count}} material(s)", exportStarted: "Export task started, check progress in export tasks panel",
      exportStartResponseLost: "The create-task response was interrupted. Checking the backend with the reserved task ID; this does not mean the export failed",
      cannotRefresh: "Cannot refresh: Missing project ID", refreshSuccess: "Refresh successful",
      switchedToMulti: "Switched to per-page templates", switchFailed: "Failed to switch template mode: {{error}}",
      extraRequirementsSaved: "Extra requirements saved", styleDescSaved: "Style description saved",
      exportSettingsSaved: "Export settings saved", aspectRatioSaved: "Aspect ratio saved", loadTemplateFailed: "Failed to load template", templateChanged: "Template changed successfully",
      saveFailed: "Save failed: {{error}}", refreshFailed: "Refresh failed, please try again later",
      loadMaterialFailed: "Failed to load material: {{error}}", templateChangeFailed: "Failed to change template: {{error}}",
      versionSwitchFailed: "Switch failed: {{error}}", unknownError: "Unknown error",
      regionCropSuccess: "Selected region added as a reference image; remove it from its thumbnail if needed.",
      regionCropFailed: "Cannot crop from current image (browser security restriction). Try uploading a reference image manually."
    },
    preview: {
      title: "Preview", pageCount: "{{count}} pages", export: "Export", exportTasks: "Export Tasks",
      exportPptx: "Export as PPTX", exportPdf: "Export as PDF",
      exportEditablePptx: "Export Editable PPTX (Beta)", exportImages: "Export as Images",
      exportVideo: "Export as Narration Video",
      videoSettingsLoading: "Loading video settings...",
      videoSettingsLoadFailed: "Could not load video export settings. Please retry before exporting.",
      pptxExportTitle: "PPTX Export Settings",
      pptxExportSubtitle: "Confirm playback settings before exporting this PPTX.",
      pptxTransitionToggle: "Enable slide transitions",
      pptxTransitionDesc: "The exported PPTX will add a transition to each slide. If multiple effects are selected, each slide uses one at random.",
      pptxTransitionFade: "Fade",
      pptxTransitionPageTurn: "Page turn",
      pptxTransitionPush: "Push",
      pptxTransitionWipe: "Wipe",
      pptxTransitionSplit: "Split",
      pptxTransitionBlinds: "Blinds",
      pptxTransitionChecker: "Checkerboard",
      pptxTransitionWheel: "Clock",
      pptxTransitionRequired: "Select at least one transition effect",
      pptxStartExport: "Start Export",
      pptxCancel: "Cancel",
      videoExportTitle: "Narration Video Export Settings",
      videoExportSubtitle: "Tune the narration strategy in the final export step for demos, annual recaps, launches, or academic talks.",
      videoVoiceLabel: "Voice",
      videoSpeedLabel: "Speech speed",
      videoSpeedHint: "0.7 slower — 1.0 default — 1.2 faster",
      videoNarrationPresetTitle: "Narration Strategy",
      videoNarrationPersona: "Speaker persona",
      videoNarrationAudience: "Target audience",
      videoNarrationTone: "Speech tone",
      videoNarrationTopic: "Core topic",
      videoNarrationTopicPlaceholder: "For example: the history and technological evolution of Nvidia",
      videoNarrationLength: "Words per slide",
      videoNarrationAdvanced: "Advanced settings",
      videoNarrationCollapse: "Hide advanced settings",
      videoNarrationAdvancedHint: "These options only affect narration generation during export.",
      videoNarrationMinWords: "Min words",
      videoNarrationMaxWords: "Max words",
      videoNarrationSummaryLabel: "Current strategy",
      videoNarrationGenerateMissing: "Auto-generate narration for slides that are missing it",
      videoEnableKenBurns: "Enable camera motion",
      videoKenBurnsTip: "Adds slow zoom or pan animation to each slide for a more dynamic video",
      videoIncludeNoImage: "Include pages without images (placeholder frames)",
      videoMissingImagesWarning: "{{count}} page(s) in this export range still have no images. Enable \"Include pages without images\" to export placeholder frames, or generate images first.",
      videoStartExport: "Start Export",
      videoCancel: "Cancel",
      editablePptxDialogTitle: "Export Editable PPTX",
      editablePptxDialogSubtitle: "Choose processing options for this export.",
      editablePptxIconTransparent: "Icon Transparent Background",
      editablePptxIconTransparentDesc: "Run images classified as icons through the local RMBG-2.0 model to produce transparent-background PNGs, avoiding background color clashes.",
      editablePptxModelHint: "First use downloads a ~512MB model to ~/.cache/banana-slides/models/. CPU inference is memory-intensive; recommended: ≥16GB free memory.",
      editablePptxRangeLabel: "Export range",
      editablePptxRangeAll: "All {{count}} pages",
      editablePptxRangePages: "Pages {{pages}} ({{count}} total)",
      editablePptxRangeTip: "To export specific pages only, click \"Multi-select\" at the top of the left sidebar and check the pages first.",
      editablePptxStartExport: "Start Export",
      editablePptxCancel: "Cancel",
      exportSelectedPages: "Will export {{count}} selected page(s)",
      regenerate: "Regenerate", regenerating: "Generating...",
      editMode: "Edit Mode", viewMode: "View Mode", page: "Page {{num}}",
      switchToMulti: "Switch to per-page", switchToSingle: "Switch to unified", templateSetup: "Template setup", templateMenu: "Template",
      projectSettings: "Project Settings", changeTemplate: "Change Template", refresh: "Refresh",
      batchGenerate: "Batch Generate Images ({{count}})", generateSelected: "Generate Selected ({{count}})",
      multiSelect: "Multi-select", cancelMultiSelect: "Cancel Multi-select", pagesUnit: " pages",
      noPages: "No pages yet", noPagesHint: "Please go back to editor to add content first", backToEdit: "Back to Editor",
      generating: "Generating...", queued: "Queued for generation...", notGenerated: "Image not generated yet", generateThisPage: "Generate This Page",
      prevPage: "Previous", nextPage: "Next", historyVersions: "History Versions",
      play: "Play",
      versions: "Versions", version: "Version", current: "Current", editPage: "Edit Page",
      regionSelect: "Region Select", endRegionSelect: "End Region Select",
      inlineEditPromptPlaceholder: "Describe the change, or box a region on the image first…",
      addReference: "Add reference image",
      pageOutline: "Page Outline (Editable)", pageDescription: "Page Description (Editable)",
      enterTitle: "Enter page title", pointsPerLine: "Key Points (one per line)",
      enterPointsPerLine: "Enter one key point per line", enterDescription: "Enter detailed page description",
      selectContextImages: "Select Context Images (Optional)", useTemplateImage: "Use Template Image",
      imagesInDescription: "Images in Description", uploadImages: "Upload Images",
      selectFromMaterials: "Select from Materials", upload: "Upload",
      editPromptLabel: "Enter edit instructions (page description will be auto-added)",
      editPromptPlaceholder: "e.g., Remove elements in selected area, change background to blue, increase title font size, change text box style to dashed...",
      saveOutlineOnly: "Save Outline/Description Only", generateImage: "Generate Image",
      templateModalDesc: "Selecting a new template will apply to future PPT page generation (won't affect already generated pages). You can choose preset templates, existing templates, or upload a new one.",
      useTextStyle: "Use text description for style",
      applyStyle: "Apply Style",
      styleSaved: "Style description saved",
      uploadingTemplate: "Uploading template...",
      resolution1KWarning: "1K Resolution Warning",
      resolution1KWarningText: "Currently using 1K resolution for image generation, which may cause garbled or blurry text.",
      resolution1KWarningHint: "It's recommended to switch to 2K or 4K resolution in \"Project Settings → Global Settings\" for clearer results.",
      dontShowAgain: "Don't show again", generateAnyway: "Generate Anyway",
      confirmRegenerateSelected: "Will regenerate {{count}} selected page(s) (history will be saved). Continue?",
      confirmRegenerateAll: "Will regenerate all pages (history will be saved). Continue?",
      confirmRegenerateTitle: "Confirm Regenerate",
      generationFailed: "Generation failed",
      qualityControl: "Quality Control",
      qualityControlDesc: "Review after generation; save only passing versions",
      qualityControlTooltip: "When this is on, Sol.A generates the image first but does not save it right away. It checks for unreadable text, strange text, rough-looking visuals, or a result that is far from your request. If something looks wrong, it tries again up to 3 times. Only a checked image is saved as a new version. If it still fails, you will be asked to adjust your description.",
      qualityControlOn: "On",
      qualityControlOff: "Off",
      qualityControlSaved: "Quality control setting saved",
      qualityControlSaveFailed: "Failed to save quality control setting",
      disabledExportTip: "{{count}} page(s) in this export range have no images yet. Generate images first or adjust the selection",
      messages: {
        exportSuccess: "Export successful", exportFailed: "Export failed",
        regenerateSuccess: "Regeneration complete", regenerateFailed: "Failed to regenerate",
        loadingProject: "Loading project...", processing: "Processing...",
        generatingBackgrounds: "Generating clean backgrounds...", creatingPdf: "Creating PDF...",
        parsingContent: "Parsing content...", creatingPptx: "Creating editable PPTX...", complete: "Complete!"
      }
    },
    outline: {
      titleLabel: "Title",
      keyPoints: "Key Points"
    }
  },
  en: {
    home: { title: 'Sol.A' },
    nav: { home: 'Home', materialGenerate: 'Generate Material' },
    slidePreview: {
      pageGenerating: "This page is generating, please wait...", generationStarted: "Image generation started, please wait...",
      versionSwitched: "Switched to this version", outlineSaved: "Outline and description saved",
      materialsAdded: "Added {{count}} material(s)", exportStarted: "Export task started, check progress in export tasks panel",
      exportStartResponseLost: "The create-task response was interrupted. Checking the backend with the reserved task ID; this does not mean the export failed",
      cannotRefresh: "Cannot refresh: Missing project ID", refreshSuccess: "Refresh successful",
      switchedToMulti: "Switched to per-page templates", switchFailed: "Failed to switch template mode: {{error}}",
      extraRequirementsSaved: "Extra requirements saved", styleDescSaved: "Style description saved",
      exportSettingsSaved: "Export settings saved", aspectRatioSaved: "Aspect ratio saved", loadTemplateFailed: "Failed to load template", templateChanged: "Template changed successfully",
      saveFailed: "Save failed: {{error}}", refreshFailed: "Refresh failed, please try again later",
      loadMaterialFailed: "Failed to load material: {{error}}", templateChangeFailed: "Failed to change template: {{error}}",
      versionSwitchFailed: "Switch failed: {{error}}", unknownError: "Unknown error",
      regionCropSuccess: "Selected region added as a reference image; remove it from its thumbnail if needed.",
      regionCropFailed: "Cannot crop from current image (browser security restriction). Try uploading a reference image manually."
    },
    preview: {
      title: "Preview", pageCount: "{{count}} pages", export: "Export", exportTasks: "Export Tasks",
      exportPptx: "Export as PPTX", exportPdf: "Export as PDF",
      exportEditablePptx: "Export Editable PPTX (Beta)", exportImages: "Export as Images",
      exportVideo: "Export as Narration Video",
      videoSettingsLoading: "Loading video settings...",
      videoSettingsLoadFailed: "Could not load video export settings. Please retry before exporting.",
      pptxExportTitle: "PPTX Export Settings",
      pptxExportSubtitle: "Confirm playback settings before exporting this PPTX.",
      pptxTransitionToggle: "Enable slide transitions",
      pptxTransitionDesc: "The exported PPTX will add a transition to each slide. If multiple effects are selected, each slide uses one at random.",
      pptxTransitionFade: "Fade",
      pptxTransitionPageTurn: "Page turn",
      pptxTransitionPush: "Push",
      pptxTransitionWipe: "Wipe",
      pptxTransitionSplit: "Split",
      pptxTransitionBlinds: "Blinds",
      pptxTransitionChecker: "Checkerboard",
      pptxTransitionWheel: "Clock",
      pptxTransitionRequired: "Select at least one transition effect",
      pptxStartExport: "Start Export",
      pptxCancel: "Cancel",
      videoExportTitle: "Narration Video Export Settings",
      videoExportSubtitle: "Tune the narration strategy in the final export step for demos, annual recaps, launches, or academic talks.",
      videoVoiceLabel: "Voice",
      videoSpeedLabel: "Speech speed",
      videoSpeedHint: "0.7 slower — 1.0 default — 1.2 faster",
      videoNarrationPresetTitle: "Narration Strategy",
      videoNarrationPersona: "Speaker persona",
      videoNarrationAudience: "Target audience",
      videoNarrationTone: "Speech tone",
      videoNarrationTopic: "Core topic",
      videoNarrationTopicPlaceholder: "For example: the history and technological evolution of Nvidia",
      videoNarrationLength: "Words per slide",
      videoNarrationAdvanced: "Advanced settings",
      videoNarrationCollapse: "Hide advanced settings",
      videoNarrationAdvancedHint: "These options only affect narration generation during export.",
      videoNarrationMinWords: "Min words",
      videoNarrationMaxWords: "Max words",
      videoNarrationSummaryLabel: "Current strategy",
      videoNarrationGenerateMissing: "Auto-generate narration for slides that are missing it",
      videoEnableKenBurns: "Enable camera motion",
      videoKenBurnsTip: "Adds slow zoom or pan animation to each slide for a more dynamic video",
      videoIncludeNoImage: "Include pages without images (placeholder frames)",
      videoMissingImagesWarning: "{{count}} page(s) in this export range still have no images. Enable \"Include pages without images\" to export placeholder frames, or generate images first.",
      videoStartExport: "Start Export",
      videoCancel: "Cancel",
      editablePptxDialogTitle: "Export Editable PPTX",
      editablePptxDialogSubtitle: "Choose processing options for this export.",
      editablePptxIconTransparent: "Icon Transparent Background",
      editablePptxIconTransparentDesc: "Run images classified as icons through the local RMBG-2.0 model to produce transparent-background PNGs, avoiding background color clashes.",
      editablePptxModelHint: "First use downloads a ~512MB model to ~/.cache/banana-slides/models/. CPU inference is memory-intensive; recommended: ≥16GB free memory.",
      editablePptxRangeLabel: "Export range",
      editablePptxRangeAll: "All {{count}} pages",
      editablePptxRangePages: "Pages {{pages}} ({{count}} total)",
      editablePptxRangeTip: "To export specific pages only, click \"Multi-select\" at the top of the left sidebar and check the pages first.",
      editablePptxStartExport: "Start Export",
      editablePptxCancel: "Cancel",
      exportSelectedPages: "Will export {{count}} selected page(s)",
      regenerate: "Regenerate", regenerating: "Generating...",
      editMode: "Edit Mode", viewMode: "View Mode", page: "Page {{num}}",
      switchToMulti: "Switch to per-page", switchToSingle: "Switch to unified", templateSetup: "Template setup", templateMenu: "Template",
      projectSettings: "Project Settings", changeTemplate: "Change Template", refresh: "Refresh",
      batchGenerate: "Batch Generate Images ({{count}})", generateSelected: "Generate Selected ({{count}})",
      multiSelect: "Multi-select", cancelMultiSelect: "Cancel Multi-select", pagesUnit: " pages",
      noPages: "No pages yet", noPagesHint: "Please go back to editor to add content first", backToEdit: "Back to Editor",
      generating: "Generating...", queued: "Queued for generation...", notGenerated: "Image not generated yet", generateThisPage: "Generate This Page",
      prevPage: "Previous", nextPage: "Next", historyVersions: "History Versions",
      play: "Play",
      versions: "Versions", version: "Version", current: "Current", editPage: "Edit Page",
      regionSelect: "Region Select", endRegionSelect: "End Region Select",
      inlineEditPromptPlaceholder: "Describe the change, or box a region on the image first…",
      addReference: "Add reference image",
      pageOutline: "Page Outline (Editable)", pageDescription: "Page Description (Editable)",
      enterTitle: "Enter page title", pointsPerLine: "Key Points (one per line)",
      enterPointsPerLine: "Enter one key point per line", enterDescription: "Enter detailed page description",
      selectContextImages: "Select Context Images (Optional)", useTemplateImage: "Use Template Image",
      imagesInDescription: "Images in Description", uploadImages: "Upload Images",
      selectFromMaterials: "Select from Materials", upload: "Upload",
      editPromptLabel: "Enter edit instructions (page description will be auto-added)",
      editPromptPlaceholder: "e.g., Remove elements in selected area, change background to blue, increase title font size, change text box style to dashed...",
      saveOutlineOnly: "Save Outline/Description Only", generateImage: "Generate Image",
      templateModalDesc: "Selecting a new template will apply to future PPT page generation (won't affect already generated pages). You can choose preset templates, existing templates, or upload a new one.",
      useTextStyle: "Use text description for style",
      applyStyle: "Apply Style",
      styleSaved: "Style description saved",
      uploadingTemplate: "Uploading template...",
      resolution1KWarning: "1K Resolution Warning",
      resolution1KWarningText: "Currently using 1K resolution for image generation, which may cause garbled or blurry text.",
      resolution1KWarningHint: "It's recommended to switch to 2K or 4K resolution in \"Project Settings → Global Settings\" for clearer results.",
      dontShowAgain: "Don't show again", generateAnyway: "Generate Anyway",
      confirmRegenerateSelected: "Will regenerate {{count}} selected page(s) (history will be saved). Continue?",
      confirmRegenerateAll: "Will regenerate all pages (history will be saved). Continue?",
      confirmRegenerateTitle: "Confirm Regenerate",
      generationFailed: "Generation failed",
      qualityControl: "Quality Control",
      qualityControlDesc: "Review after generation; save only passing versions",
      qualityControlTooltip: "When this is on, Sol.A generates the image first but does not save it right away. It checks for unreadable text, strange text, rough-looking visuals, or a result that is far from your request. If something looks wrong, it tries again up to 3 times. Only a checked image is saved as a new version. If it still fails, you will be asked to adjust your description.",
      qualityControlOn: "On",
      qualityControlOff: "Off",
      qualityControlSaved: "Quality control setting saved",
      qualityControlSaveFailed: "Failed to save quality control setting",
      disabledExportTip: "{{count}} page(s) in this export range have no images yet. Generate images first or adjust the selection",
      messages: {
        exportSuccess: "Export successful", exportFailed: "Export failed",
        regenerateSuccess: "Regeneration complete", regenerateFailed: "Failed to regenerate",
        loadingProject: "Loading project...", processing: "Processing...",
        generatingBackgrounds: "Generating clean backgrounds...", creatingPdf: "Creating PDF...",
        parsingContent: "Parsing content...", creatingPptx: "Creating editable PPTX...", complete: "Complete!"
      }
    },
    outline: {
      titleLabel: "Title",
      keyPoints: "Key Points"
    }
  }
};
import {
  Home,
  ArrowLeft,
  StepBack,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Play,
  X,
  Upload,
  Image as ImageIcon,
  ImagePlus,
  Settings,
  CheckSquare,
  Square,
  Check,
  FileText,
  Loader2,
  Info,
  LayoutTemplate,
  Presentation,
  AlertTriangle,
} from 'lucide-react';
import logoUrl from '@/assets/sola-sun.svg';
import { Button, Loading, Modal, Textarea, useToast, useConfirm, MaterialSelector, ProjectSettingsModal, ExportTasksPanel, TextStyleSelector } from '@/components/shared';
import { SwitchToSingleModeDialog } from '@/components/template/SwitchToSingleModeDialog';
import { MaterialGeneratorModal } from '@/components/shared/MaterialGeneratorModal';
import { TemplateSelector, getTemplateFile } from '@/components/shared/TemplateSelector';
import { listUserTemplates, type UserTemplate } from '@/api/endpoints';
import { materialUrlToFile } from '@/components/shared/MaterialSelector';
import { triggerDownload } from '@/api/client';
import type { Material } from '@/api/endpoints';
import { SlideCard } from '@/components/preview/SlideCard';
import { SlidePlayer } from '@/components/preview/SlidePlayer';
import { PagePropertiesDrawer, clampWidth, readStoredDrawerWidth } from '@/components/preview/PagePropertiesDrawer';
import { useProjectStore } from '@/store/useProjectStore';
import { useExportTasksStore, type ExportTaskType } from '@/store/useExportTasksStore';
import { getImageUrl } from '@/api/client';
import { getPageImageVersions, setCurrentImageVersion, updateProject, uploadTemplate, exportPPTX as apiExportPPTX, exportPDF as apiExportPDF, exportImages as apiExportImages, exportEditablePPTX as apiExportEditablePPTX, exportVideo as apiExportVideo, getSettings, updateSettings } from '@/api/endpoints';
import type { ImageVersion, DescriptionContent, ExportExtractorMethod, ExportInpaintMethod, Page } from '@/types';
import { normalizeErrorMessage } from '@/utils';

const VIDEO_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];

type PptxTransitionEffect =
  | 'fade'
  | 'page_turn'
  | 'push'
  | 'wipe'
  | 'split'
  | 'blinds'
  | 'checker'
  | 'wheel';

const PPTX_TRANSITION_OPTIONS: { value: PptxTransitionEffect; labelKey: string }[] = [
  { value: 'fade', labelKey: 'pptxTransitionFade' },
  { value: 'page_turn', labelKey: 'pptxTransitionPageTurn' },
  { value: 'push', labelKey: 'pptxTransitionPush' },
  { value: 'wipe', labelKey: 'pptxTransitionWipe' },
  { value: 'split', labelKey: 'pptxTransitionSplit' },
  { value: 'blinds', labelKey: 'pptxTransitionBlinds' },
  { value: 'checker', labelKey: 'pptxTransitionChecker' },
  { value: 'wheel', labelKey: 'pptxTransitionWheel' },
];

type PreviewT = (key: string, params?: Record<string, string | number>) => string;

// Quality control switch： Place the desktop end in the left column「Batch Generation」Side (project level generation settings), narrow screens in the bottom control bar
const QualityControlToggle: React.FC<{
  enabled: boolean;
  saving: boolean;
  onToggle: () => void;
  t: PreviewT;
  className?: string;
  labelClassName?: string;
  tooltipPlacement?: 'top' | 'bottom';
  tooltipTestId?: string;
}> = ({
  enabled,
  saving,
  onToggle,
  t,
  className = '',
  labelClassName = '',
  tooltipPlacement = 'top',
  tooltipTestId = 'quality-control-tooltip',
}) => (
  <div className={`group/qc relative flex items-center gap-2 ${className}`}>
    <span className={`text-xs font-medium text-gray-700 dark:text-foreground-secondary whitespace-nowrap ${labelClassName}`}>
      {t('preview.qualityControl')}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={t('preview.qualityControl')}
      onClick={onToggle}
      disabled={saving}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-banana-500 focus:ring-offset-2 disabled:opacity-60 ${
        enabled ? 'bg-banana-500' : 'bg-gray-300 dark:bg-background-hover'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
    <span
      data-testid={tooltipTestId}
      className={`absolute left-1/2 z-50 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-xs leading-relaxed text-gray-700 opacity-0 shadow-lg transition-opacity pointer-events-none group-hover/qc:opacity-100 group-focus-within/qc:opacity-100 dark:border-border-primary dark:bg-background-elevated dark:text-foreground-secondary ${
        tooltipPlacement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
      }`}
    >
      <span className="mb-1 block font-medium text-gray-900 dark:text-foreground-primary">
        {enabled ? t('preview.qualityControlOn') : t('preview.qualityControlOff')}
      </span>
      {t('preview.qualityControlTooltip')}
    </span>
  </div>
);

// History Version Button + Play Menu Up： Desktop-end floating toolbar shared with the narrow screen bottom control bar
const VersionHistoryMenu: React.FC<{
  versions: ImageVersion[];
  open: boolean;
  onToggleOpen: () => void;
  onSwitchVersion: (versionId: string) => void;
  t: PreviewT;
  buttonClassName?: string;
  // Menu anchoring method： right alignment action area (default, narrow screen) docked bar) or center anchor button (suspendant capsule in center)，
  // Otherwise... right-0 + w-64 They’ll throw the menu to the left of the button, spill out the capsule.）
  menuAlign?: 'right' | 'center';
}> = ({ versions, open, onToggleOpen, onSwitchVersion, t, buttonClassName = 'text-xs md:text-sm', menuAlign = 'right' }) => (
  <div className="relative">
    <Button variant="ghost" size="sm" onClick={onToggleOpen} className={buttonClassName}>
      <span className="hidden md:inline">{t('preview.historyVersions')} ({versions.length})</span>
      <span className="md:hidden">{t('preview.versions')}</span>
    </Button>
    {open && (
      <div
        data-testid="version-history-menu"
        className={`absolute bottom-full mb-2 w-56 md:w-64 bg-white dark:bg-background-secondary rounded-lg shadow-lg border border-gray-200 dark:border-border-primary py-2 z-20 max-h-96 overflow-y-auto ${
          menuAlign === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0'
        }`}
      >
        {versions.map((version) => (
          <button
            key={version.version_id}
            onClick={() => onSwitchVersion(version.version_id)}
            className={`w-full px-3 md:px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors flex items-center justify-between text-xs md:text-sm ${
              version.is_current ? 'bg-banana-50 dark:bg-background-secondary' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span>
                {t('preview.version')} {version.version_number}
              </span>
              {version.is_current && (
                <span className="text-xs text-banana-600 font-medium">
                  ({t('preview.current')})
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400 hidden md:inline">
              {version.created_at
                ? new Date(version.created_at).toLocaleString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''}
            </span>
          </button>
        ))}
      </div>
    )}
  </div>
);

export const SlidePreview: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT(previewI18n);
  const { projectId } = useParams<{ projectId: string }>();
  const fromHistory = (location.state as any)?.from === 'history';
  const {
    currentProject,
    syncProject,
    generatePageImage,
    generateImages,
    editPageImage,
    deletePageById,
    updatePageLocal,
    isGlobalLoading,
    isSavingPages,
    taskProgress,
    pageGeneratingTasks,
    warningMessage,
    templateAssets,
    loadTemplateAssets,
    switchTemplateMode,
    switchTemplateModeWithUpload,
    updatePageTemplate,
    uploadTemplateAsset,
  } = useProjectStore();

  const { addTask, pollTask: pollExportTask, tasks: exportTasks, restoreActiveTasks } = useExportTasksStore();

  // Resume an ongoing export task while the page is mounted (after page is refreshed)）
  useEffect(() => {
    restoreActiveTasks();
  }, [restoreActiveTasks]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  // Play online (approximate full screen) overlay，Toggle browser whole screen）
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const playTriggerRef = useRef<HTMLElement | null>(null);
  const handleOpenPlayer = () => {
    playTriggerRef.current = document.activeElement as HTMLElement | null;
    setIsPlayerOpen(true);
  };
  const handleClosePlayer = () => {
    setIsPlayerOpen(false);
    const trigger = playTriggerRef.current;
    playTriggerRef.current = null;
    const restoreFocus = (el: HTMLElement | null) => {
      // Window Crosses during Playtime lg At breakpoint, trigger button may already display:none，focus Yes. no-op；
      // fallback Play button to the Current Visible Toolbar
      const target =
        el && el.offsetParent !== null
          ? el
          : Array.from(document.querySelectorAll<HTMLElement>('[data-play-trigger]')).find(
              (btn) => btn.offsetParent !== null
            );
      target?.focus();
    };
    if (document.fullscreenElement) {
      // The player unmounts removes the full screen elements, and the browser then exits the full screen automatically; etc. fullscreenchange
      // Confirm that the focus will be restored after exit has been completed and avoid synchronizing before fullscreen exit focus Overwrite by Browser
      const restore = () => {
        if (!document.fullscreenElement) {
          document.removeEventListener('fullscreenchange', restore);
          restoreFocus(trigger);
        }
      };
      document.addEventListener('fullscreenchange', restore);
    } else {
      restoreFocus(trigger);
    }
  };
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [useTextStyleMode, setUseTextStyleMode] = useState(false);
  const [draftTemplateStyle, setDraftTemplateStyle] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  // Outline and Description Edit Status
  const [editOutlineTitle, setEditOutlineTitle] = useState('');
  const [editOutlinePoints, setEditOutlinePoints] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const showExportMenuRef = useRef(false);
  const setExportMenuOpen = (open: boolean) => {
    showExportMenuRef.current = open;
    setShowExportMenu(open);
  };
  const [showExportTasksPanel, setShowExportTasksPanel] = useState(false);
  const [showPptxExportDialog, setShowPptxExportDialog] = useState(false);
  const [showVideoExportDialog, setShowVideoExportDialog] = useState(false);
  const [showEditablePptxDialog, setShowEditablePptxDialog] = useState(false);
  const [editablePptxDialogIconTransparent, setEditablePptxDialogIconTransparent] = useState(true);
  const [pptxTransitionsEnabled, setPptxTransitionsEnabled] = useState(false);
  const [pptxTransitionEffects, setPptxTransitionEffects] = useState<PptxTransitionEffect[]>(['fade']);
  const [videoVoice, setVideoVoice] = useState('alloy');
  const [videoSpeed, setVideoSpeed] = useState(1.0);
  const [imageQualityControlEnabled, setImageQualityControlEnabled] = useState(false);
  const [isSavingImageQualityControl, setIsSavingImageQualityControl] = useState(false);
  // Multiplely select the relevant state
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [isOutlineExpanded, setIsOutlineExpanded] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [imageVersions, setImageVersions] = useState<ImageVersion[]>([]);
  // Page Properties drawer： Desktopend（lg+）First time into default expansion; narrow screen float will cover the preview and keep the default closeup。
  // User Visibility Collection/After expansion, state memory is local and is no longer overwrited by default。
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(() => {
    const stored = localStorage.getItem('previewDrawer.open');
    if (stored !== null) return stored === 'true';
    // 768-1023px Bottom Left Thumbnail Bar（320px）Plus the drawers will make the preview area almost unusable and keep it closed by default.
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  // The initial width is also based on visual locks： large screen memories under small windows. 640px It’ll crowd out the preview area.
  const [propertiesWidth, setPropertiesWidth] = useState(() =>
    clampWidth(readStoredDrawerWidth(), window.innerWidth)
  );
  // Edit state locally（lg+）：Move slide up to the command area, click directly on the big map。
  // The narrow screen can’t leave the top-down columns and still go through the editor’s bullet window.。
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  // Which page is being edited. The page cut in the rendering selectedIndex already points to the new page，
  // But the drafts are still old pages, so it separates them.
  const editingPageIdRef = useRef<string | undefined>(undefined);
  const [descriptionExtraFields, setDescriptionExtraFields] = useState<string[]>([]);
  const [imagePromptExtraFields, setImagePromptExtraFields] = useState<string[] | undefined>(undefined);
  // Drops the disk only when the user is really switching, and avoids fixing the default value with the width of the front-screen window
  const setPropertiesOpen = useCallback((open: boolean) => {
    setIsPropertiesOpen(open);
    localStorage.setItem('previewDrawer.open', String(open));
  }, []);
  const handlePropertiesWidthChange = useCallback((width: number) => {
    setPropertiesWidth(width);
    localStorage.setItem('previewDrawer.width', String(width));
  }, []);
  // Re-trapped drawer width with new vision following changes in window size to avoid squeezing the preview area while the drawer is down from the big screen。
  // Here. localStorage The user preference is the benchmark, which restores the width in the same session after returning to the screen.；
  // It’s not written here. localStorage，Responsive contraction does not override user preferences。
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setPropertiesWidth(() => clampWidth(readStoredDrawerWidth(), window.innerWidth));
      }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  // Cross lg Sync on Breakpoint Zoom「First Default Expand/Put it away.」Semantics： User follows breakpoints without a visible switch
  // Automatically close/Expand; visible selection respects user selection and does not cover localStorage。
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (localStorage.getItem('previewDrawer.open') !== null) return;
      setIsPropertiesOpen(mq.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  // Page change template in the drawer： both the selection and the template hint go. PATCH，Visible queue without page fields
  const handleUpdatePageTemplate = useCallback(
    (pageId: string, patch: { template_asset_id?: string | null; template_style_text?: string | null }) =>
      projectId
        ? updatePageTemplate(projectId, pageId, { ...patch, selection_source: 'manual' })
        : Promise.resolve(),
    [projectId, updatePageTemplate]
  );
  const handleUploadTemplateAsset = useCallback(
    (file: File) => uploadTemplateAsset(projectId!, file),
    [projectId, uploadTemplateAsset]
  );
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedPresetTemplateId, setSelectedPresetTemplateId] = useState<string | null>(null);
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false);
  const [selectedContextImages, setSelectedContextImages] = useState<{
    useTemplate: boolean;
    descImageUrls: string[];
    uploadedFiles: File[];
  }>({
    useTemplate: false,
    descImageUrls: [],
    uploadedFiles: [],
  });
  const [extraRequirements, setExtraRequirements] = useState<string>('');
  const [isSavingRequirements, setIsSavingRequirements] = useState(false);
  const isEditingRequirements = useRef(false); // Track if the user is editing additional requests
  const [templateStyle, setTemplateStyle] = useState<string>('');
  const [isSavingTemplateStyle, setIsSavingTemplateStyle] = useState(false);
  const [isSwitchSingleOpen, setIsSwitchSingleOpen] = useState(false);
  const isEditingTemplateStyle = useRef(false); // Track if users are editing style descriptions
  const lastProjectId = useRef<string | null>(null); // Follow previous project ID
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  // The material generates a mold switch (module itself can be reused, this is only an example entry)）
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  // Material Selector Model Switches
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  // Export Settings
  const [exportExtractorMethod, setExportExtractorMethod] = useState<ExportExtractorMethod>(
    (currentProject?.export_extractor_method as ExportExtractorMethod) || 'hybrid'
  );
  const [exportInpaintMethod, setExportInpaintMethod] = useState<ExportInpaintMethod>(
    (currentProject?.export_inpaint_method as ExportInpaintMethod) || 'hybrid'
  );
  const [exportAllowPartial, setExportAllowPartial] = useState<boolean>(
    currentProject?.export_allow_partial || false
  );
  const [enableIconSubjectExtraction, setEnableIconSubjectExtraction] = useState<boolean>(
    currentProject?.enable_icon_subject_extraction ?? true
  );
  const [isSavingExportSettings, setIsSavingExportSettings] = useState(false);
  // Image Scale
  const [aspectRatio, setAspectRatio] = useState<string>(
    currentProject?.image_aspect_ratio || '16:9'
  );
  const [isSavingAspectRatio, setIsSavingAspectRatio] = useState(false);
  // Based on image scale. CSS aspect-ratio
  const aspectRatioStyle = useMemo(() => {
    const parts = aspectRatio.split(':');
    if (parts.length === 2) {
      const w = parseInt(parts[0], 10);
      const h = parseInt(parts[1], 10);
      if (w > 0 && h > 0) return `${w}/${h}`;
    }
    return '16/9';
  }, [aspectRatio]);
  // 1K Resolution Warning Dialogue Status
  const [show1KWarningDialog, setShow1KWarningDialog] = useState(false);
  const [skip1KWarningChecked, setSkip1KWarningChecked] = useState(false);
  const [pending1KAction, setPending1KAction] = useState<(() => Promise<void>) | null>(null);
  // Edit Parameter Cache per Page (front-end session internal cache, easy to repeat)）
  const [editContextByPage, setEditContextByPage] = useState<Record<string, {
    prompt: string;
    contextImages: {
      useTemplate: boolean;
      descImageUrls: string[];
      uploadedFiles: File[];
    };
  }>>({});

  // Preview Diagram Rectangular Selection Status (edited in bullet window)）
  const imageRef = useRef<HTMLImageElement | null>(null);
  const hasTouchedImageQualityControlRef = useRef(false);
  const [isRegionSelectionMode, setIsRegionSelectionMode] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const resetRegionSelection = useCallback((enabled = false) => {
    setIsRegionSelectionMode(enabled);
    setSelectionStart(null);
    setSelectionRect(null);
    setIsSelectingRegion(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadImageQualityControl = async () => {
      try {
        const response = await getSettings();
        if (!response.data || !isMounted) return;
        if (!hasTouchedImageQualityControlRef.current) {
          setImageQualityControlEnabled(Boolean(response.data.enable_image_quality_control));
        }
        // The description extra field in the attribute drawer shares the same configuration as the detailed editor
        const extra = response.data.description_extra_fields;
        if (Array.isArray(extra)) setDescriptionExtraFields(extra);
        const imageFields = response.data.image_prompt_extra_fields;
        if (Array.isArray(imageFields)) setImagePromptExtraFields(imageFields);
      } catch (error) {
        console.error('Failed to load image quality control setting:', error);
      }
    };
    loadImageQualityControl();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleImageQualityControl = useCallback(async () => {
    hasTouchedImageQualityControlRef.current = true;
    const nextValue = !imageQualityControlEnabled;
    setImageQualityControlEnabled(nextValue);
    setIsSavingImageQualityControl(true);
    try {
      const response = await updateSettings({ enable_image_quality_control: nextValue });
      if (response.data) {
        setImageQualityControlEnabled(Boolean(response.data.enable_image_quality_control));
        sessionStorage.setItem('banana-settings', JSON.stringify(response.data));
      }
      show({ message: t('preview.qualityControlSaved'), type: 'success' });
    } catch (error: any) {
      setImageQualityControlEnabled(!nextValue);
      show({
        message: `${t('preview.qualityControlSaveFailed')}: ${error?.response?.data?.error?.message || error?.message || t('slidePreview.unknownError')}`,
        type: 'error',
      });
    } finally {
      setIsSavingImageQualityControl(false);
    }
  }, [imageQualityControlEnabled, show, t]);


  // Memoize pages with generated images to avoid re-computing in multiple places
  const pagesWithImages = useMemo(() => {
    return currentProject?.pages.filter(p => p.id && p.generated_image_path) || [];
  }, [currentProject?.pages]);

  const hasImages = useMemo(
    () => currentProject?.pages?.some(p => p.generated_image_path) ?? false,
    [currentProject?.pages]
  );


  // Loading project data & User Templates
  useEffect(() => {
    if (projectId && (!currentProject || currentProject.id !== projectId)) {
      // Direct Use projectId Sync Project Data
      syncProject(projectId);
    }

    // Loading the list of user templates (to be accessed on demand) File）
    const loadTemplates = async () => {
      try {
        const response = await listUserTemplates();
        if (response.data?.templates) {
          setUserTemplates(response.data.templates);
        }
      } catch (error) {
        console.error('Failed to load user templates:', error);
      }
    };
    loadTemplates();
  }, [projectId, currentProject, syncProject]);

  // A separate template per page： Load the project template library (to be used for the transfer of the unified template bomb layer)）
  useEffect(() => {
    if (projectId && currentProject?.template_mode === 'multi') {
      loadTemplateAssets(projectId);
    }
  }, [projectId, currentProject?.template_mode, loadTemplateAssets]);

  // Listen to alerts.
  const lastWarningRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (warningMessage) {
      if (warningMessage !== lastWarningRef.current) {
        lastWarningRef.current = warningMessage;
        show({ message: warningMessage, type: 'warning', duration: 6000 });
      }
    } else {
      // warningMessage Reset when emptied ref，So you can show it again next time.
      lastWarningRef.current = null;
    }
  }, [warningMessage, show]);

  // Initialize additional requirements and style descriptions when the item is loaded
  // Only first loading of a project or item ID Initialize changes to avoid overwhelming what the user is entering
  useEffect(() => {
    if (currentProject) {
      // Check for new items
      const isNewProject = lastProjectId.current !== currentProject.id;

      if (isNewProject) {
        // New items, initialization of additional requirements and style description
        setExtraRequirements(currentProject.extra_requirements || '');
        setTemplateStyle(currentProject.template_style || '');
        // Initialise Export Settings
        setExportExtractorMethod((currentProject.export_extractor_method as ExportExtractorMethod) || 'hybrid');
        setExportInpaintMethod((currentProject.export_inpaint_method as ExportInpaintMethod) || 'hybrid');
        setExportAllowPartial(currentProject.export_allow_partial || false);
        setEnableIconSubjectExtraction(currentProject.enable_icon_subject_extraction ?? true);
        setAspectRatio(currentProject.image_aspect_ratio || '16:9');
        lastProjectId.current = currentProject.id || null;
        isEditingRequirements.current = false;
        isEditingTemplateStyle.current = false;
      } else {
        // The same item, which the user is not editing, can be updated (e.g. synchronized back after saving from the server)）
        if (!isEditingRequirements.current) {
          setExtraRequirements(currentProject.extra_requirements || '');
        }
        if (!isEditingTemplateStyle.current) {
          setTemplateStyle(currentProject.template_style || '');
        }
        // Non-text entered settings, always synchronized from server
        setAspectRatio(currentProject.image_aspect_ratio || '16:9');
        setExportExtractorMethod((currentProject.export_extractor_method as ExportExtractorMethod) || 'hybrid');
        setExportInpaintMethod((currentProject.export_inpaint_method as ExportInpaintMethod) || 'hybrid');
        setExportAllowPartial(currentProject.export_allow_partial || false);
        setEnableIconSubjectExtraction(currentProject.enable_icon_subject_extraction ?? true);
      }
      // Do not update local status if the user is editing
    }
  }, [currentProject?.id, currentProject?.extra_requirements, currentProject?.template_style, currentProject?.image_aspect_ratio, currentProject?.export_extractor_method, currentProject?.export_inpaint_method, currentProject?.export_allow_partial, currentProject?.enable_icon_subject_extraction]);

  // Load the historical version of the current page
  useEffect(() => {
    const loadVersions = async () => {
      if (!currentProject || !projectId || selectedIndex < 0 || selectedIndex >= currentProject.pages.length) {
        setImageVersions([]);
        setShowVersionMenu(false);
        return;
      }

      const page = currentProject.pages[selectedIndex];
      if (!page?.id) {
        setImageVersions([]);
        setShowVersionMenu(false);
        return;
      }

      try {
        const response = await getPageImageVersions(projectId, page.id);
        if (response.data?.versions) {
          setImageVersions(response.data.versions);
        }
      } catch (error) {
        console.error('Failed to load image versions:', error);
        setImageVersions([]);
      }
    };

    loadVersions();
  }, [currentProject, selectedIndex, projectId]);

  // Check if display is required 1K Resolution Warning
  const checkResolutionAndExecute = useCallback(async (action: () => Promise<void>) => {
    // Inspection localStorage Whether or not to skip the warning
    const skipWarning = localStorage.getItem('skip1KResolutionWarning') === 'true';
    if (skipWarning) {
      await action();
      return;
    }

    try {
      const response = await getSettings();
      const resolution = response.data?.image_resolution;

      // If 1K Resolution, display warning dialog
      if (resolution === '1K') {
        setPending1KAction(() => action);
        setSkip1KWarningChecked(false);
        setShow1KWarningDialog(true);
      } else {
        // No, it’s not. 1K Resolution, direct execution
        await action();
      }
    } catch (error) {
      console.error('Failed to get settings:', error);
      // Direct execution when accessing settings failed (without blocking user)）
      await action();
    }
  }, []);

  // Confirm. 1K Execute after Resolution Warning
  const handleConfirm1KWarning = useCallback(async () => {
    // If you’re ticking."No more hints"，Save To localStorage
    if (skip1KWarningChecked) {
      localStorage.setItem('skip1KResolutionWarning', 'true');
    }

    setShow1KWarningDialog(false);

    // Execute pending operations
    if (pending1KAction) {
      await pending1KAction();
      setPending1KAction(null);
    }
  }, [skip1KWarningChecked, pending1KAction]);

  // Cancel 1K Resolution Warning
  const handleCancel1KWarning = useCallback(() => {
    setShow1KWarningDialog(false);
    setPending1KAction(null);
  }, []);

  const handleGenerateAll = async () => {
    // Check the resolution first, if it is. 1K Show warning
    await checkResolutionAndExecute(async () => {
      const pageIds = getSelectedPageIdsForExport();
      const isPartialGenerate = isMultiSelectMode && selectedPageIds.size > 0;

      // Checks if there are existing pictures on the page to be generated
      const pagesToGenerate = isPartialGenerate
        ? currentProject?.pages.filter(p => p.id && selectedPageIds.has(p.id))
        : currentProject?.pages;
      const hasImages = pagesToGenerate?.some((p) => p.generated_image_path);

      const executeGenerate = async () => {
        try {
          await generateImages(pageIds);
        } catch (error: any) {
          console.error('Batch Generation Error:', error);
          console.error('Error Response:', error?.response?.data);

          // Extract more specific error information from the backend
          let errorMessage = t('preview.generationFailed');
          const respData = error?.response?.data;

          if (respData) {
            if (respData.error?.message) {
              errorMessage = respData.error.message;
            } else if (respData.message) {
              errorMessage = respData.message;
            } else if (respData.error) {
              errorMessage =
                typeof respData.error === 'string'
                  ? respData.error
                  : respData.error.message || errorMessage;
            }
          } else if (error.message) {
            errorMessage = error.message;
          }

          devLog('Can not open message:', errorMessage);

          // Normalize functions using uniform error messages
          errorMessage = normalizeErrorMessage(errorMessage);

          devLog('Error message after regularization:', errorMessage);

          show({
            message: errorMessage,
            type: 'error',
          });
        }
      };

      if (hasImages) {
        const message = isPartialGenerate
          ? t('preview.confirmRegenerateSelected', { count: selectedPageIds.size })
          : t('preview.confirmRegenerateAll');
        confirm(
          message,
          executeGenerate,
          { title: t('preview.confirmRegenerateTitle'), variant: 'warning' }
        );
      } else {
        await executeGenerate();
      }
    });
  };

  const handleRegeneratePage = useCallback(async () => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    if (!page.id) return;

    // If this page is being generated, do not duplicate
    if (pageGeneratingTasks[page.id]) {
      show({ message: t('slidePreview.pageGenerating'), type: 'info' });
      return;
    }

    // Check the resolution first, if it is. 1K Show warning
    await checkResolutionAndExecute(async () => {
      try {
        await generatePageImage(page.id!, true);
        show({ message: t('slidePreview.generationStarted'), type: 'success' });
      } catch (error: any) {
        // Extract more specific error information from the backend
        let errorMessage = 'Failed to generate';
        const respData = error?.response?.data;

        if (respData) {
          if (respData.error?.message) {
            errorMessage = respData.error.message;
          } else if (respData.message) {
            errorMessage = respData.message;
          } else if (respData.error) {
            errorMessage =
              typeof respData.error === 'string'
                ? respData.error
                : respData.error.message || errorMessage;
          }
        } else if (error.message) {
          errorMessage = error.message;
        }

        // Normalize functions using uniform error messages
        errorMessage = normalizeErrorMessage(errorMessage);

        show({
          message: errorMessage,
          type: 'error',
        });
      }
    });
  }, [currentProject, selectedIndex, pageGeneratingTasks, generatePageImage, show, checkResolutionAndExecute]);

  const handleSwitchVersion = async (versionId: string) => {
    if (!currentProject || !selectedPage?.id || !projectId) return;

    try {
      await setCurrentImageVersion(projectId, selectedPage.id, versionId);
      await syncProject(projectId);
      setShowVersionMenu(false);
      show({ message: t('slidePreview.versionSwitched'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.versionSwitchFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    }
  };

  // Extract pictures from description URL
  const extractImageUrlsFromDescription = (descriptionContent: DescriptionContent | undefined): string[] => {
    if (!descriptionContent) return [];

    // Process two formats
    let text: string = '';
    if ('text' in descriptionContent) {
      text = descriptionContent.text as string;
    } else if ('text_content' in descriptionContent && Array.isArray(descriptionContent.text_content)) {
      text = descriptionContent.text_content.join('\n');
    }

    if (!text) return [];

    // Match markdown Photo Syntax：: ![](url) or ![alt](url)
    const pattern = /!\[.*?\]\((.*?)\)/g;
    const matches: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const url = match[1]?.trim();
      // Only keep valid HTTP/HTTPS URL
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        matches.push(url);
      }
    }

    return matches;
  };

  const handleEditPage = () => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;

    setIsOutlineExpanded(false);
    setIsDescriptionExpanded(false);

    // Initialize outline and describe editing status
    setEditOutlineTitle(page?.outline_content?.title || '');
    setEditOutlinePoints(page?.outline_content?.points?.join('\n') || '');
    // Extract description text
    const descContent = page?.description_content;
    let descText = '';
    if (descContent) {
      if ('text' in descContent) {
        descText = descContent.text as string;
      } else if ('text_content' in descContent && Array.isArray(descContent.text_content)) {
        descText = descContent.text_content.join('\n');
      }
    }
    setEditDescription(descText);

    if (pageId && editContextByPage[pageId]) {
      // Restore last edited content and photo selection of the page
      const cached = editContextByPage[pageId];
      setEditPrompt(cached.prompt);
      setSelectedContextImages({
        useTemplate: cached.contextImages.useTemplate,
        descImageUrls: [...cached.contextImages.descImageUrls],
        uploadedFiles: [...cached.contextImages.uploadedFiles],
      });
    } else {
      // First edit of the page, with default
      setEditPrompt('');
      setSelectedContextImages({
        useTemplate: false,
        descImageUrls: [],
        uploadedFiles: [],
      });
    }

    // The area selection is opened by default every time you enter the editor, and the user can drag and drag a box directly on the picture。
    resetRegionSelection(true);

    // lg+ Go ahead and edit it. The narrow screen doesn’t have room for the top and bottom columns, and it still uses a bullet window.
    if (window.matchMedia('(min-width: 1024px)').matches) {
      editingPageIdRef.current = pageId;
      setIsInlineEditing(true);
    } else {
      setIsEditModalOpen(true);
    }
  };

  const exitInlineEditing = useCallback(() => {
    setIsInlineEditing(false);
    setShowAttachMenu(false);
    resetRegionSelection();
  }, [resetRegionSelection]);

  const closeEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    resetRegionSelection();
  }, [resetRegionSelection]);

  // Zoom to lg The top and bottom columns of the local editing were already unfeasible and returned to the preview rather than to collapse the layout.
  useEffect(() => {
    if (!isInlineEditing) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (!mq.matches) exitInlineEditing();
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [isInlineEditing, exitInlineEditing]);

  // Esc Quit editing on the spot. Esc Processing）
  useEffect(() => {
    if (!isInlineEditing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitInlineEditing();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isInlineEditing, exitInlineEditing]);

  // Add a reference chart menu： Put it away anywhere outside the dot menu. pointerdown Not a full-screen mask.——The mask will eat it.
  // That click (e.g. point to input box) just turned off the menu.），pointerdown Just take the menu, click and drop.。
  useEffect(() => {
    if (!showAttachMenu) return;
    const onDown = (e: PointerEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [showAttachMenu]);

  // Save outline and description changes
  const handleSaveOutlineAndDescription = useCallback(() => {
    if (!currentProject) return;
    const page = currentProject.pages[selectedIndex];
    if (!page?.id) return;

    const updates: Partial<Page> = {};

    // Check if the outline has changed.
    const originalTitle = page.outline_content?.title || '';
    const originalPoints = page.outline_content?.points?.join('\n') || '';
    if (editOutlineTitle !== originalTitle || editOutlinePoints !== originalPoints) {
      updates.outline_content = {
        title: editOutlineTitle,
        points: editOutlinePoints.split('\n').filter((p) => p.trim()),
      };
    }

    // Check if the description has changed.
    const descContent = page.description_content;
    let originalDesc = '';
    if (descContent) {
      if ('text' in descContent) {
        originalDesc = descContent.text as string;
      } else if ('text_content' in descContent && Array.isArray(descContent.text_content)) {
        originalDesc = descContent.text_content.join('\n');
      }
    }
    if (editDescription !== originalDesc) {
      updates.description_content = {
        text: editDescription,
      } as DescriptionContent;
    }

    // If modified, save update
    if (Object.keys(updates).length > 0) {
      updatePageLocal(page.id, updates);
      show({ message: t('slidePreview.outlineSaved'), type: 'success' });
    }
  }, [currentProject, selectedIndex, editOutlineTitle, editOutlinePoints, editDescription, updatePageLocal, show]);

  const handleSubmitEdit = useCallback(async () => {
    if (!currentProject || !editPrompt.trim()) return;

    const page = currentProject.pages[selectedIndex];
    if (!page.id) return;

    // There’s an outline in the window./Description input box to save when submitting; neither field exists in the local editing position，
    // Save will only write back the snapshots when entering the edit state, while covering the period from elsewhere (responsible panel)、
    // New value dropped from backstage sync)
    if (!isInlineEditing) {
      handleSaveOutlineAndDescription();
    }

    // The store shows the error; keep the prompt and references for retry.
    try {
      await editPageImage(
        page.id,
        editPrompt,
        {
          useTemplate: selectedContextImages.useTemplate,
          descImageUrls: selectedContextImages.descImageUrls,
          uploadedFiles: selectedContextImages.uploadedFiles.length > 0
            ? selectedContextImages.uploadedFiles
            : undefined,
        }
      );
    } catch {
      return;
    }

    // Cache the edit context of the current page to allow quick duplicate follow-up
    setEditContextByPage((prev) => ({
      ...prev,
      [page.id!]: {
        prompt: editPrompt,
        contextImages: {
          useTemplate: selectedContextImages.useTemplate,
          descImageUrls: [...selectedContextImages.descImageUrls],
          uploadedFiles: [...selectedContextImages.uploadedFiles],
        },
      },
    }));

    if (isInlineEditing) exitInlineEditing();
    else closeEditModal();
  }, [currentProject, selectedIndex, editPrompt, selectedContextImages, editPageImage, handleSaveOutlineAndDescription, isInlineEditing, exitInlineEditing, closeEditModal]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedContextImages((prev) => ({
      ...prev,
      uploadedFiles: [...prev.uploadedFiles, ...files],
    }));
  };

  const removeUploadedFile = (index: number) => {
    setSelectedContextImages((prev) => ({
      ...prev,
      uploadedFiles: prev.uploadedFiles.filter((_, i) => i !== index),
    }));
  };

  // Object URLs for the picked reference images. Held in state, not a ref, so
  // that creating them schedules the render that shows them. As a ref this
  // happened to work only because the draft-cache effect below also depends on
  // uploadedFiles and its setState re-rendered the subtree a beat later —
  // fine until someone changes that effect. Cleanup revokes the previous batch.
  const [uploadedPreviews, setUploadedPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = selectedContextImages.uploadedFiles.map((file) => URL.createObjectURL(file));
    setUploadedPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [selectedContextImages.uploadedFiles]);

  const handleSelectMaterials = async (materials: Material[]) => {
    try {
      // Convert selected material to File Object and Add to Upload List
      const files = await Promise.all(
        materials.map((material) => materialUrlToFile(material))
      );
      setSelectedContextImages((prev) => ({
        ...prev,
        uploadedFiles: [...prev.uploadedFiles, ...files],
      }));
      show({ message: t('slidePreview.materialsAdded', { count: materials.length }), type: 'success' });
    } catch (error: any) {
      console.error('Failed to load material:', error);
      show({
        message: t('slidePreview.loadMaterialFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error',
      });
    }
  };

  // Edit the input and image selection into the cache (frontend session) in real time (bullet window or local editing)），
  // So you can cut off the page and come back and change it.
  useEffect(() => {
    if ((!isEditModalOpen && !isInlineEditing) || !currentProject) return;
    const page = currentProject.pages[selectedIndex];
    const pageId = page?.id;
    if (!pageId) return;
    // When you edit the form, you cut the page. effect You’ll run before you quit the logic. selectedIndex
    // It’s a new page and a draft or an old one.——Write it down is the same as hanging the instructions from the previous page on the new page.，
    // New Page More「Edit」You’ll see someone else’s draft.
    if (isInlineEditing && editingPageIdRef.current && editingPageIdRef.current !== pageId) return;

    setEditContextByPage((prev) => ({
      ...prev,
      [pageId]: {
        prompt: editPrompt,
        contextImages: {
          useTemplate: selectedContextImages.useTemplate,
          descImageUrls: [...selectedContextImages.descImageUrls],
          uploadedFiles: [...selectedContextImages.uploadedFiles],
        },
      },
    }));
  }, [isEditModalOpen, isInlineEditing, currentProject, selectedIndex, editPrompt, selectedContextImages]);

  // Edit from thumbnail cut pages： electoral box, cut-out reference charts, commands are all on the previous page and will keep
  // Feeding old pages to new pages. Quit editing.——Up there. effect We’ve got the contents on the page.，
  // User in New Page Point「Edit」It’ll keep changing.。
  useEffect(() => {
    if (!isInlineEditing) {
      editingPageIdRef.current = undefined;
      return;
    }
    const pageId = currentProject?.pages[selectedIndex]?.id;
    if (editingPageIdRef.current && editingPageIdRef.current !== pageId) {
      exitInlineEditing();
    }
  }, [isInlineEditing, selectedIndex, currentProject, exitInlineEditing]);

  // ========== Preview Diagram Rectangular Selection Logic ==========
  // Picture in <img> The actual location in the box.：object-fit It’ll make the two different.——contain It’s been a long time.、
  // cover The excess has been reduced. The selection coordinates are relative to the size of the box and must be converted to the content coordinates and map back to the original map.，
  // Otherwise, when the project changes the scale, and the chart is generated at the old scale, the area will be set up in an overall deviation.。
  const getRenderedImageRect = (img: HTMLImageElement) => {
    const box = img.getBoundingClientRect();
    const { naturalWidth: natW, naturalHeight: natH } = img;
    if (!natW || !natH || !box.width || !box.height) return null;
    const scale =
      getComputedStyle(img).objectFit === 'contain'
        ? Math.min(box.width / natW, box.height / natH)
        : Math.max(box.width / natW, box.height / natH);
    const renderedW = natW * scale;
    const renderedH = natH * scale;
    return {
      scale,
      // cover is negative, which means left content/How much did you lose?
      offsetX: (box.width - renderedW) / 2,
      offsetY: (box.height - renderedH) / 2,
      renderedW,
      renderedH,
    };
  };

  const handleSelectionPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isRegionSelectionMode || !imageRef.current) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointer events used by some browsers/tests may not be capturable.
    }
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    setIsSelectingRegion(true);
    setSelectionStart({ x, y });
    setSelectionRect(null);
  };

  const handleSelectionPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isRegionSelectionMode || !isSelectingRegion || !selectionStart || !imageRef.current) return;
    e.preventDefault();
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clampedX = Math.max(0, Math.min(x, rect.width));
    const clampedY = Math.max(0, Math.min(y, rect.height));

    const left = Math.min(selectionStart.x, clampedX);
    const top = Math.min(selectionStart.y, clampedY);
    const width = Math.abs(clampedX - selectionStart.x);
    const height = Math.abs(clampedY - selectionStart.y);

    setSelectionRect({ left, top, width, height });
  };

  const handleSelectionPointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!isRegionSelectionMode || !isSelectingRegion || !selectionRect || !imageRef.current) {
      setIsSelectingRegion(false);
      setSelectionStart(null);
      return;
    }

    // End drag, but retain the selected rectangle until the user manually exits the area selection mode
    setIsSelectingRegion(false);
    setSelectionStart(null);

    try {
      const img = imageRef.current;
      const { left, top, width, height } = selectionRect;
      if (width < 10 || height < 10) {
        // It’s too small to ignore.
        return;
      }

      // Map electoral constituencies from display size to original image size (but not first) object-fit It’s the cause of the confession./Deciding）
      const rendered = getRenderedImageRect(img);
      if (!rendered) return;

      // contain It’s time for the electoral districts to fall behind.、cover It may fall on the part that was cut, but it must be caught in the original picture.
      const sx = Math.max(0, (left - rendered.offsetX) / rendered.scale);
      const sy = Math.max(0, (top - rendered.offsetY) / rendered.scale);
      const sWidth = Math.min(width / rendered.scale, img.naturalWidth - sx);
      const sHeight = Math.min(height / rendered.scale, img.naturalHeight - sy);
      if (sWidth <= 0 || sHeight <= 0) return;

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sWidth));
      canvas.height = Math.max(1, Math.round(sHeight));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        ctx.drawImage(
          img,
          sx,
          sy,
          sWidth,
          sHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );

        canvas.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], `crop-${Date.now()}.png`, { type: 'image/png' });
          // Add the selected area to the upload list as an additional reference picture
          setSelectedContextImages((prev) => ({
            ...prev,
            uploadedFiles: [...prev.uploadedFiles, file],
          }));
          // A clear feedback to users： the constituency has added the ”upload pictures” below as a picture”
          show({
            message: t('slidePreview.regionCropSuccess'),
            type: 'success',
          });
        }, 'image/png');
      } catch (e: any) {
        console.error('Failed to crop the selected region (possibly due to a cross-origin image canvas Contaminated.）:', e);
        show({
          message: t('slidePreview.regionCropFailed'),
          type: 'error',
        });
      }
    } finally {
      // No cleanup selectionRect，Let the selections continue to be shown on the interface
    }
  };

  const handleSelectionPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsSelectingRegion(false);
    setSelectionStart(null);
    setSelectionRect(null);
  };

  // Multiple selection of related functions
  const togglePageSelection = (pageId: string) => {
    setSelectedPageIds(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const selectAllPages = () => {
    const allPageIds = pagesWithImages.map(p => p.id!);
    setSelectedPageIds(new Set(allPageIds));
  };

  const deselectAllPages = () => {
    setSelectedPageIds(new Set());
  };

  const toggleMultiSelectMode = () => {
    setIsMultiSelectMode(prev => {
      if (prev) {
        // Empty selection when exiting multiple mode
        setSelectedPageIds(new Set());
      }
      return !prev;
    });
  };

  // Fetch selected pages with pictures ID List
  const getSelectedPageIdsForExport = (): string[] | undefined => {
    if (!isMultiSelectMode || selectedPageIds.size === 0) {
      return undefined; // Export All
    }
    return Array.from(selectedPageIds);
  };

  const handleExport = async (
    type: 'pptx' | 'pdf' | 'editable-pptx' | 'images' | 'video',
    options?: {
      pptxTransitionEnabled?: boolean;
      pptxTransitionEffects?: PptxTransitionEffect[];
    },
  ) => {
    setExportMenuOpen(false);
    if (!projectId) return;

    if (!await useProjectStore.getState().flushPendingPageUpdates()) {
      show({ message: '변경 사항을 먼저 저장해야 내보낼 수 있습니다.', type: 'error' });
      return;
    }

    if (type === 'video' || type === 'editable-pptx') setShowExportTasksPanel(true);
    const pageIds = getSelectedPageIdsForExport();
    const exportTaskId = `export-${Date.now()}`;

    let backendTaskId: string | undefined;
    try {
      backendTaskId = type === 'editable-pptx' ? generateUuid() : undefined;
      if (type === 'pptx' || type === 'pdf' || type === 'images') {
        // Synchronous export - direct download, create completed task directly
        const response = type === 'pptx'
          ? await apiExportPPTX(projectId, pageIds, {
              transitionEnabled: options?.pptxTransitionEnabled,
              transitionEffects: options?.pptxTransitionEffects,
            })
          : type === 'pdf'
            ? await apiExportPDF(projectId, pageIds)
            : await apiExportImages(projectId, pageIds);
        const downloadUrl = response.data?.download_url || response.data?.download_url_absolute;
        if (downloadUrl) {
          addTask({
            id: exportTaskId,
            taskId: '',
            projectId,
            type: type as ExportTaskType,
            status: 'COMPLETED',
            downloadUrl,
            pageIds: pageIds,
          });
          triggerDownload(downloadUrl);
        }
      } else if (type === 'editable-pptx') {
        // Async export - create processing task and start polling
        addTask({
          id: exportTaskId,
          taskId: backendTaskId!,
          projectId,
          type: 'editable-pptx',
          status: 'PROCESSING',
          pageIds: pageIds,
        });

        show({ message: t('slidePreview.exportStarted'), type: 'success' });

        const response = await apiExportEditablePPTX(projectId, undefined, pageIds, backendTaskId);
        const taskId = response.data?.task_id;

        if (taskId) {
          // Update task with real taskId
          addTask({
            id: exportTaskId,
            taskId,
            projectId,
            type: 'editable-pptx',
            status: 'PROCESSING',
            pageIds: pageIds,
          });

          // Start polling in background (non-blocking)
          pollExportTask(exportTaskId, projectId, taskId);
        }
      } else if (type === 'video') {
        // Async export - create processing task and start polling
        addTask({
          id: exportTaskId,
          taskId: '',
          projectId,
          type: 'video',
          status: 'PROCESSING',
          pageIds: pageIds,
        });

        show({ message: t('slidePreview.exportStarted'), type: 'success' });

        const response = await apiExportVideo(projectId, {
          pageIds, voice: videoVoice, speed: videoSpeed, generateNarration: true,
        });
        const taskId = response.data?.task_id;

        if (taskId) {
          addTask({
            id: exportTaskId,
            taskId,
            projectId,
            type: 'video',
            status: 'PROCESSING',
            pageIds: pageIds,
          });

          pollExportTask(exportTaskId, projectId, taskId);
        }
      }
    } catch (error: any) {
      let errorMessage = t('preview.messages.exportFailed');
      const respData = error?.response?.data;

      if (respData) {
        if (respData.error?.message) {
          errorMessage = respData.error.message;
        } else if (respData.message) {
          errorMessage = respData.message;
        } else if (respData.error) {
          errorMessage =
            typeof respData.error === 'string'
              ? respData.error
              : respData.error.message || errorMessage;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      const normalizedErrorMessage = normalizeErrorMessage(errorMessage);

      const responseStatus = error?.response?.status;
      const editableStartMayHaveSucceeded = type === 'editable-pptx'
        && backendTaskId
        && (
          !error?.response
          || [408, 429, 500, 502, 503, 504].includes(responseStatus)
        );

      if (editableStartMayHaveSucceeded && backendTaskId) {
        addTask({
          id: exportTaskId,
          taskId: backendTaskId,
          projectId,
          type: 'editable-pptx',
          status: 'PROCESSING',
          pageIds,
          monitoring: {
            state: 'retrying',
            code: 'EXPORT_CREATE_RESPONSE_INTERRUPTED',
            message: t('slidePreview.exportStartResponseLost'),
            consecutiveErrors: 1,
            lastErrorAt: new Date().toISOString(),
          },
        });
        show({ message: t('slidePreview.exportStartResponseLost'), type: 'warning' });
        pollExportTask(exportTaskId, projectId, backendTaskId);
        return;
      }

      // Update task as failed
      addTask({
        id: exportTaskId,
        taskId: '',
        projectId,
        type: type as ExportTaskType,
        status: 'FAILED',
        errorMessage: normalizedErrorMessage,
        pageIds: pageIds,
      });
      show({ message: normalizedErrorMessage, type: 'error' });
    }
  };

  const handleOpenVideoExport = () => {
    setExportMenuOpen(false);
    setShowVideoExportDialog(true);
  };

  const handleRefresh = useCallback(async () => {
    const targetProjectId = projectId || currentProject?.id;
    if (!targetProjectId) {
      show({ message: t('slidePreview.cannotRefresh'), type: 'error' });
      return;
    }

    setIsRefreshing(true);
    try {
      await syncProject(targetProjectId);
      show({ message: t('slidePreview.refreshSuccess'), type: 'success' });
    } catch (error: any) {
      show({
        message: error.message || t('slidePreview.refreshFailed'),
        type: 'error'
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [projectId, currentProject?.id, syncProject, show]);

  const handleSaveExtraRequirements = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingRequirements(true);
    try {
      await updateProject(projectId, { extra_requirements: extraRequirements || '' });
      // When saved successfully, mark as not edit state, allowing synchronized updates
      isEditingRequirements.current = false;
      // Update local project status
      await syncProject(projectId);
      show({ message: t('slidePreview.extraRequirementsSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsSavingRequirements(false);
    }
  }, [currentProject, projectId, extraRequirements, syncProject, show]);

  const handleSaveTemplateStyle = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingTemplateStyle(true);
    try {
      await updateProject(projectId, { template_style: templateStyle || '' });
      // When saved successfully, mark as not edit state, allowing synchronized updates
      isEditingTemplateStyle.current = false;
      // Update local project status
      await syncProject(projectId);
      show({ message: t('slidePreview.styleDescSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsSavingTemplateStyle(false);
    }
  }, [currentProject, projectId, templateStyle, syncProject, show]);

  // Template Mode Switch
  const handleSwitchToMulti = useCallback(async () => {
    if (!projectId) return;
    try {
      await switchTemplateMode(projectId, { mode: 'multi' });
      await syncProject(projectId);
      show({ message: t('slidePreview.switchedToMulti'), type: 'success' });
    } catch (error: any) {
      show({ message: t('slidePreview.switchFailed', { error: error.message || '' }), type: 'error' });
    }
  }, [projectId, switchTemplateMode, syncProject, show, t]);

  const handleSwitchToSingleExisting = useCallback(async (assetId: string, unifiedStyleText?: string) => {
    if (!projectId) return;
    await switchTemplateMode(projectId, {
      mode: 'single',
      unified_asset_id: assetId,
      unified_style_text: unifiedStyleText ?? null,
    });
    await syncProject(projectId);
  }, [projectId, switchTemplateMode, syncProject]);

  const handleSwitchToSingleUpload = useCallback(async (file: File, unifiedStyleText?: string) => {
    if (!projectId) return;
    await switchTemplateModeWithUpload(projectId, file, unifiedStyleText);
    await syncProject(projectId);
  }, [projectId, switchTemplateModeWithUpload, syncProject]);

  const handleSaveExportSettings = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingExportSettings(true);
    try {
      await updateProject(projectId, {
        export_extractor_method: exportExtractorMethod,
        export_inpaint_method: exportInpaintMethod,
        export_allow_partial: exportAllowPartial,
        enable_icon_subject_extraction: enableIconSubjectExtraction
      });
      // Update local project status
      await syncProject(projectId);
      show({ message: t('slidePreview.exportSettingsSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsSavingExportSettings(false);
    }
  }, [currentProject, projectId, exportExtractorMethod, exportInpaintMethod, exportAllowPartial, enableIconSubjectExtraction, syncProject, show, t]);

  const handleSaveAspectRatio = useCallback(async () => {
    if (!currentProject || !projectId) return;

    setIsSavingAspectRatio(true);
    try {
      await updateProject(projectId, { image_aspect_ratio: aspectRatio });
      await syncProject(projectId);
      show({ message: t('slidePreview.aspectRatioSaved'), type: 'success' });
    } catch (error: any) {
      show({
        message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsSavingAspectRatio(false);
    }
  }, [currentProject, projectId, aspectRatio, syncProject, show]);

  const handleTemplateSelect = async (templateFile: File | null, templateId?: string) => {
    if (!projectId) return;

    // If there is one... templateId，Load on demand File
    let file = templateFile;
    if (templateId && !file) {
      file = await getTemplateFile(templateId, userTemplates);
      if (!file) {
        show({ message: t('slidePreview.loadTemplateFailed'), type: 'error' });
        return;
      }
    }

    if (!file) {
      // If there’s no papers, there’s no papers. ID，Maybe it’s a no-selection.
      return;
    }

    setIsUploadingTemplate(true);
    try {
      await uploadTemplate(projectId, file);
      await syncProject(projectId);
      setIsTemplateModalOpen(false);
      show({ message: t('slidePreview.templateChanged'), type: 'success' });

      // Update Selection Status
      if (templateId) {
        // Whether the user template or the preset template is judged (short) ID Usually a preset template.）
        if (templateId.length <= 3 && /^\d+$/.test(templateId)) {
          setSelectedPresetTemplateId(templateId);
          setSelectedTemplateId(null);
        } else {
          setSelectedTemplateId(templateId);
          setSelectedPresetTemplateId(null);
        }
      }
    } catch (error: any) {
      show({
        message: t('slidePreview.templateChangeFailed', { error: error.message || t('slidePreview.unknownError') }),
        type: 'error'
      });
    } finally {
      setIsUploadingTemplate(false);
    }
  };

  if (!currentProject) {
    return <Loading fullscreen message={t('preview.messages.loadingProject')} />;
  }

  if (isGlobalLoading) {
    // Show different messages according to mission progress.
    let loadingMessage = t('preview.messages.processing');
    if (taskProgress && typeof taskProgress === 'object') {
      const progressData = taskProgress as any;
      if (progressData.current_step) {
        // Use current step information provided by the backend
        const stepMap: Record<string, string> = {
          'Generating clean backgrounds': t('preview.messages.generatingBackgrounds'),
          'Creating PDF': t('preview.messages.creatingPdf'),
          'Parsing with MinerU': t('preview.messages.parsingContent'),
          'Creating editable PPTX': t('preview.messages.creatingPptx'),
          'Complete': t('preview.messages.complete')
        };
        loadingMessage = stepMap[progressData.current_step] || progressData.current_step;
      }
      // Do not show any more "Processing (X/Y)..." Format, percentage in progress bar
    }

    return (
      <Loading
        fullscreen
        message={loadingMessage}
        progress={taskProgress || undefined}
      />
    );
  }

  const selectedPage = currentProject.pages[selectedIndex];
  const isCurrentPageGenerating = selectedPage?.id ? !!pageGeneratingTasks[selectedPage.id] : false;
  const imageUrl = selectedPage?.generated_image_path
    ? getImageUrl(selectedPage.generated_image_path, selectedPage.updated_at)
    : '';

  const exportRangePages = isMultiSelectMode && selectedPageIds.size > 0
    ? currentProject.pages.filter((page) => {
        const pageId = page.id || page.page_id;
        return pageId ? selectedPageIds.has(pageId) : false;
      })
    : currentProject.pages;
  const exportMissingImageCount = exportRangePages.filter(p => !p.generated_image_path).length;
  const exportRangeHasAllImages = exportRangePages.length > 0 && exportMissingImageCount === 0;
  const exportRangeMissingTip = exportMissingImageCount > 0
    ? t('preview.disabledExportTip', { count: exportMissingImageCount })
    : undefined;

  return (
    <div className="h-screen bg-gray-50 dark:bg-background-primary flex flex-col overflow-hidden">
      {/* Topbar */}
      <header className="h-14 md:h-16 bg-white dark:bg-background-secondary shadow-sm dark:shadow-background-primary/30 border-b border-gray-200 dark:border-border-primary flex items-center justify-between px-3 md:px-6 flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<Home size={16} className="md:w-[18px] md:h-[18px]" />}
            onClick={() => navigate('/')}
            className="hidden sm:inline-flex flex-shrink-0"
            >
              <span className="hidden md:inline">{t('nav.home')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />}
              aria-label={t('common.back')}
              title={t('common.back')}
              onClick={() => {
                if (fromHistory) {
                  navigate('/history');
                } else {
                  navigate(`/project/${projectId}/detail`);
                }
              }}
              className="flex-shrink-0"
            >
              <span className="hidden sm:inline">{t('common.back')}</span>
            </Button>
            <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
              <img src={logoUrl} alt="" className="w-6 h-6 md:w-8 md:h-8 object-contain flex-shrink-0" />
              <span className="text-base md:text-xl font-bold truncate">{t('home.title')}</span>
            </div>
            <span className="text-gray-400 hidden md:inline">|</span>
            <span className="text-sm md:text-lg font-semibold truncate hidden sm:inline">{t('preview.title')}</span>
        </div>
        <div className="flex items-center gap-1 md:gap-3 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              icon={<Settings size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => setIsProjectSettingsOpen(true)}
              className="hidden lg:inline-flex"
            >
              <span className="hidden xl:inline">{t('preview.projectSettings')}</span>
            </Button>
            {/* Template Menu： Presentation by Mode Configure/Replacement + Mode Switch, avoid and include oral error */}
            <div className="relative hidden lg:block">
              <Button
                variant="ghost"
                size="sm"
                data-testid="template-menu"
                title={t('preview.templateMenu')}
                icon={<LayoutTemplate size={16} className="md:w-[18px] md:h-[18px]" />}
                onClick={() => setShowTemplateMenu(!showTemplateMenu)}
              >
                <span className="hidden xl:inline">{t('preview.templateMenu')}</span>
                <ChevronDown
                  size={14}
                  className={`ml-0.5 transition-transform ${showTemplateMenu ? 'rotate-180' : ''}`}
                />
              </Button>
              {showTemplateMenu && (
                <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-background-secondary rounded-lg shadow-lg border border-gray-200 dark:border-border-primary py-2 z-20">
                  {currentProject?.template_mode === 'multi' ? (
                    <>
                      <button
                        onClick={() => {
                          setShowTemplateMenu(false);
                          navigate(`/project/${projectId}/template-setup`);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm"
                      >
                        {t('preview.templateSetup')}
                      </button>
                      <button
                        onClick={() => {
                          setShowTemplateMenu(false);
                          setIsSwitchSingleOpen(true);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm"
                      >
                        {t('preview.switchToSingle')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setShowTemplateMenu(false);
                          setDraftTemplateStyle(templateStyle);
                          setIsTemplateModalOpen(true);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm"
                      >
                        {t('preview.changeTemplate')}
                      </button>
                      <button
                        onClick={() => {
                          setShowTemplateMenu(false);
                          handleSwitchToMulti();
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm"
                      >
                        {t('preview.switchToMulti')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => setIsMaterialModalOpen(true)}
              className="hidden lg:inline-flex"
            >
              <span className="hidden xl:inline">{t('nav.materialGenerate')}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="preview-previous-step"
              aria-label={t('common.previous')}
              title={t('common.previous')}
              icon={<StepBack size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => navigate(`/project/${projectId}/detail`)}
              className="flex-shrink-0"
            >
              <span className="hidden sm:inline">{t('common.previous')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={16} className={`md:w-[18px] md:h-[18px] ${isRefreshing ? 'animate-spin' : ''}`} />}
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="hidden md:inline-flex"
            >
              <span className="hidden lg:inline">{t('preview.refresh')}</span>
            </Button>

          {/* Export Task Button — Always show whether or not there is content inside the panel */}
          <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                title={t('preview.exportTasks')}
                aria-label={t('preview.exportTasks')}
                onClick={() => {
                  setShowExportTasksPanel(!showExportTasksPanel);
                  setExportMenuOpen(false);
                }}
                className="relative"
              >
                {exportTasks.filter(t => t.projectId === projectId && (t.status === 'PROCESSING' || t.status === 'RUNNING' || t.status === 'PENDING')).length > 0 ? (
                  <Loader2 size={16} className="animate-spin text-banana-500" />
                ) : (
                  <FileText size={16} />
                )}
                {exportTasks.filter(t => t.projectId === projectId).length > 0 && (
                  <span className="ml-1 text-xs">
                    {exportTasks.filter(t => t.projectId === projectId).length}
                  </span>
                )}
              </Button>
              {showExportTasksPanel && (
                <div data-testid="export-tasks-popover" className="absolute right-0 mt-2 z-20">
                  <ExportTasksPanel
                    projectId={projectId}
                    pages={currentProject?.pages || []}
                    className="w-96 max-h-[28rem] shadow-lg"
                  />
                </div>
              )}
            </div>

          <div className="relative">
            <Button
              variant="primary"
              size="sm"
              icon={<Download size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => {
                setExportMenuOpen(!showExportMenu);
                setShowExportTasksPanel(false);
              }}
              disabled={isMultiSelectMode && selectedPageIds.size === 0}
              title={exportRangeMissingTip}
              className="text-xs md:text-sm"
            >
              <span className="hidden sm:inline">
                {isMultiSelectMode && selectedPageIds.size > 0
                  ? `${t('preview.export')} (${selectedPageIds.size})`
                  : t('preview.export')}
              </span>
              <span className="sm:hidden">
                {isMultiSelectMode && selectedPageIds.size > 0
                  ? `(${selectedPageIds.size})`
                  : t('preview.export')}
              </span>
            </Button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-background-secondary rounded-lg shadow-lg border border-gray-200 dark:border-border-primary py-2 z-10">
                {isMultiSelectMode && selectedPageIds.size > 0 && (
                  <div className="px-4 py-2 text-xs text-gray-500 dark:text-foreground-tertiary border-b border-gray-100 dark:border-border-primary">
                    {t('preview.exportSelectedPages', { count: selectedPageIds.size })}
                  </div>
                )}
                <button
                  onClick={() => {
                    setExportMenuOpen(false);
                    setShowPptxExportDialog(true);
                  }}
                  disabled={!exportRangeHasAllImages}
                  title={exportRangeMissingTip}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('preview.exportPptx')}
                </button>
                <button
                  onClick={() => {
                    setExportMenuOpen(false);
                    setEditablePptxDialogIconTransparent(currentProject?.enable_icon_subject_extraction ?? true);
                    setShowEditablePptxDialog(true);
                  }}
                  disabled={!exportRangeHasAllImages}
                  title={exportRangeMissingTip}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('preview.exportEditablePptx')}
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={!exportRangeHasAllImages}
                  title={exportRangeMissingTip}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('preview.exportPdf')}
                </button>
                <button
                  onClick={() => handleExport('images')}
                  disabled={!exportRangeHasAllImages}
                  title={exportRangeMissingTip}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('preview.exportImages')}
                </button>
                <button
                  onClick={handleOpenVideoExport}
                  disabled={!exportRangeHasAllImages}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm disabled:cursor-wait disabled:opacity-70"
                >
                  <span className="flex items-center gap-2">

                    TTS로 발표 미디어 생성하기
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* PPTX Export settings for bullet windows */}
      {showPptxExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPptxExportDialog(false)}>
          <div className="bg-white dark:bg-background-secondary rounded-2xl shadow-xl p-6 w-full max-w-xl mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{t('preview.pptxExportTitle')}</h3>
            <p className="text-sm text-gray-500 dark:text-foreground-tertiary mt-1 mb-5">{t('preview.pptxExportSubtitle')}</p>

            <div className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-background-hover">
                <input
                  type="checkbox"
                  checked={pptxTransitionsEnabled}
                  onChange={e => setPptxTransitionsEnabled(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-banana-500 focus:ring-banana-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t('preview.pptxTransitionToggle')}</div>
                  <div className="text-xs text-gray-500 dark:text-foreground-tertiary mt-1">{t('preview.pptxTransitionDesc')}</div>
                </div>
              </label>

              {pptxTransitionsEnabled && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PPTX_TRANSITION_OPTIONS.map(option => {
                    const checked = pptxTransitionEffects.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                          checked
                            ? 'border-banana-400 bg-banana-50 text-banana-700 dark:border-banana-500 dark:bg-banana-500/10 dark:text-banana-300'
                            : 'border-gray-200 dark:border-border-primary hover:bg-gray-50 dark:hover:bg-background-hover'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            setPptxTransitionEffects(prev => {
                              if (e.target.checked) {
                                return prev.includes(option.value) ? prev : [...prev, option.value];
                              }
                              return prev.filter(effect => effect !== option.value);
                            });
                          }}
                          className="w-4 h-4 rounded border-gray-300 text-banana-500 focus:ring-banana-500"
                        />
                        <span>{t(`preview.${option.labelKey}`)}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {pptxTransitionsEnabled && pptxTransitionEffects.length === 0 && (
                <div className="text-xs text-amber-600 dark:text-amber-400 px-1">
                  {t('preview.pptxTransitionRequired')}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowPptxExportDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-foreground-tertiary hover:bg-gray-100 dark:hover:bg-background-hover rounded-lg transition-colors"
              >
                {t('preview.pptxCancel')}
              </button>
              <button
                onClick={() => {
                  setShowPptxExportDialog(false);
                  handleExport('pptx', {
                    pptxTransitionEnabled: pptxTransitionsEnabled,
                    pptxTransitionEffects,
                  });
                }}
                disabled={pptxTransitionsEnabled && pptxTransitionEffects.length === 0}
                className="px-4 py-2 text-sm bg-banana-500 text-white rounded-lg hover:bg-banana-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('preview.pptxStartExport')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Export Settings Blast Window */}
      {showVideoExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowVideoExportDialog(false)}>
          <div role="dialog" aria-label="TTS 발표 미디어 생성" className="bg-white dark:bg-background-secondary rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">TTS로 발표 미디어 생성하기</h3>
            <p className="mt-2 text-sm text-gray-500">선택한 슬라이드와 저장된 발표 스크립트로 MP4 동영상을 만듭니다. 스크립트가 없는 페이지만 AI가 작성합니다. 음성은 사내 Azure Foundry에서 합성한 AI 음성입니다.</p>
            <label className="block mt-5 text-sm">음성<select aria-label="발표 음성" className="block mt-2 w-full rounded-lg border p-2 dark:bg-background-tertiary" value={videoVoice} onChange={e => setVideoVoice(e.target.value)}>{VIDEO_VOICES.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
            <label className="block mt-4 text-sm">읽기 속도: {videoSpeed.toFixed(1)}배<input aria-label="읽기 속도" className="block mt-2 w-full" type="range" min="0.5" max="2" step="0.1" value={videoSpeed} onChange={e => setVideoSpeed(Number(e.target.value))} /></label>
            <p className="mt-4 text-xs text-gray-500">페이지별 음성 길이에 맞춰 재생됩니다. 완료된 파일은 내보내기 작업에서 다운로드하세요.</p>
            <div className="mt-6 flex justify-end gap-3"><Button variant="ghost" onClick={() => setShowVideoExportDialog(false)}>취소</Button><Button disabled={!exportRangeHasAllImages} onClick={() => { setShowVideoExportDialog(false); handleExport('video'); }}>발표 동영상 생성</Button></div>
          </div>
        </div>
      )}

      {showEditablePptxDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEditablePptxDialog(false)}>
          <div className="bg-white dark:bg-background-secondary rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{t('preview.editablePptxDialogTitle')}</h3>
            <p className="text-sm text-gray-500 dark:text-foreground-tertiary mt-1 mb-5">{t('preview.editablePptxDialogSubtitle')}</p>
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-background-hover">
              <input
                type="checkbox"
                checked={editablePptxDialogIconTransparent}
                onChange={(e) => setEditablePptxDialogIconTransparent(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-banana-500 focus:ring-banana-500"
              />
              <div className="flex-1">
                <div className="text-sm font-medium">{t('preview.editablePptxIconTransparent')}</div>
                <div className="text-xs text-gray-500 dark:text-foreground-tertiary mt-1">{t('preview.editablePptxIconTransparentDesc')}</div>
                {editablePptxDialogIconTransparent && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-2 leading-relaxed">
                    {t('preview.editablePptxModelHint')}
                  </div>
                )}
              </div>
            </label>
            {(() => {
              const totalPages = currentProject?.pages?.length ?? 0;
              const isPartial = isMultiSelectMode && selectedPageIds.size > 0;
              const selectedNumbers = isPartial && currentProject
                ? currentProject.pages
                    .map((p, i) => ({ id: p.id, num: i + 1 }))
                    .filter(({ id }) => id && selectedPageIds.has(id))
                    .map(({ num }) => num)
                : [];
              const rangeText = isPartial
                ? t('preview.editablePptxRangePages', { pages: selectedNumbers.join(', '), count: selectedNumbers.length })
                : t('preview.editablePptxRangeAll', { count: totalPages });
              return (
                <div className="mt-3 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-background-tertiary flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-500 dark:text-foreground-tertiary">{t('preview.editablePptxRangeLabel')}</div>
                    <div className="text-sm mt-0.5 break-words">{rangeText}</div>
                  </div>
                  <span className="flex-shrink-0 text-gray-400 dark:text-foreground-tertiary cursor-help" title={t('preview.editablePptxRangeTip')}>
                    <Info size={16} />
                  </span>
                </div>
              );
            })()}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowEditablePptxDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-foreground-tertiary hover:bg-gray-100 dark:hover:bg-background-hover rounded-lg transition-colors"
              >
                {t('preview.editablePptxCancel')}
              </button>
              <button
                onClick={async () => {
                  setShowEditablePptxDialog(false);
                  if (projectId && (currentProject?.enable_icon_subject_extraction ?? true) !== editablePptxDialogIconTransparent) {
                    try {
                      await updateProject(projectId, { enable_icon_subject_extraction: editablePptxDialogIconTransparent });
                      await syncProject(projectId);
                    } catch (error: any) {
                      show({ message: t('slidePreview.saveFailed', { error: error?.message || t('slidePreview.unknownError') }), type: 'error' });
                      return;
                    }
                  }
                  handleExport('editable-pptx');
                }}
                className="px-4 py-2 text-sm bg-banana-500 text-white rounded-lg hover:bg-banana-600 transition-colors"
              >
                {t('preview.editablePptxStartExport')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-w-0 min-h-0">
        {/* Left： Thumbnail List */}
        <aside className="w-full md:w-80 bg-white dark:bg-background-secondary border-b md:border-b-0 md:border-r border-gray-200 dark:border-border-primary flex flex-col flex-shrink-0 min-h-0">
          {/* z-20：High above below equal to sticky z-10 multiple rows, or lower of quality control tooltip It’ll cover it up. */}
          <div className="p-3 md:p-4 border-b border-gray-200 dark:border-border-primary flex-shrink-0 space-y-2 md:space-y-3 md:sticky md:top-0 md:z-20">
            <Button
              variant="primary"
              icon={<Sparkles size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={handleGenerateAll}
              className="w-full text-sm md:text-base"
              disabled={isMultiSelectMode && selectedPageIds.size === 0}
            >
              {isMultiSelectMode && selectedPageIds.size > 0
                ? t('preview.generateSelected', { count: selectedPageIds.size })
                : t('preview.batchGenerate', { count: currentProject.pages.length })}
            </Button>
            {/* Desktop end： Quality control is the project-level generation settings that are placed with batch generation; the bottom control bar at narrow screens */}
            <div className="hidden lg:block">
              <QualityControlToggle
                enabled={imageQualityControlEnabled}
                saving={isSavingImageQualityControl}
                onToggle={handleToggleImageQualityControl}
                t={t}
                className="w-full justify-between px-0.5"
                tooltipPlacement="bottom"
              />
            </div>
          </div>

          {/* Thumbnail List： Desktop End Vertical, Move End Horizontal Scrolling */}
          <div className="flex-1 overflow-y-auto md:overflow-y-auto overflow-x-auto md:overflow-x-visible p-3 md:p-4 min-h-0">
            {/* Multi-select Mode Switch - Tight Layout */}
            <div className="flex items-center gap-2 text-xs mb-3 md:sticky md:top-0 md:z-10 md:pb-3">
              <button
                onClick={toggleMultiSelectMode}
                className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                  isMultiSelectMode
                    ? 'bg-banana-100 dark:bg-banana-500/20 text-banana-700 dark:text-banana-300 hover:bg-banana-200 dark:hover:bg-banana-500/30'
                    : 'text-gray-500 dark:text-foreground-tertiary hover:bg-gray-100 dark:hover:bg-background-hover'
                }`}
              >
                {isMultiSelectMode ? <CheckSquare size={14} /> : <Square size={14} />}
                <span>{isMultiSelectMode ? t('preview.cancelMultiSelect') : t('preview.multiSelect')}</span>
              </button>
              {isMultiSelectMode && (
                <>
                  <button
                    onClick={selectedPageIds.size === pagesWithImages.length ? deselectAllPages : selectAllPages}
                    className="text-gray-500 dark:text-foreground-tertiary hover:text-banana-600 dark:hover:text-banana-300 transition-colors"
                  >
                    {selectedPageIds.size === pagesWithImages.length ? t('common.deselectAll') : t('common.selectAll')}
                  </button>
                  {selectedPageIds.size > 0 && (
                    <span className="text-banana-600 font-medium">
                      ({selectedPageIds.size}{t('preview.pagesUnit')})
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex md:flex-col gap-2 md:gap-4 min-w-max md:min-w-0">
              {currentProject.pages.map((page, index) => (
                <div key={page.id} className="md:w-full flex-shrink-0 relative">
                  {/* Move end： Simplify thumbnails */}
                  <div className="md:hidden relative">
                    <button
                      onClick={() => {
                        if (isMultiSelectMode && page.id && page.generated_image_path) {
                          togglePageSelection(page.id);
                        } else {
                          setSelectedIndex(index);
                        }
                      }}
                      className={`w-20 h-14 rounded border-2 transition-all ${
                        selectedIndex === index
                          ? 'border-banana-500 shadow-md'
                          : 'border-gray-200 dark:border-border-primary'
                      } ${isMultiSelectMode && page.id && selectedPageIds.has(page.id) ? 'ring-2 ring-banana-400' : ''}`}
                    >
                      {page.generated_image_path ? (
                        <img
                          src={getImageUrl(page.generated_image_path, page.updated_at)}
                          alt={`Slide ${index + 1}`}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100 dark:bg-background-secondary rounded flex items-center justify-center text-xs text-gray-400">
                          {index + 1}
                        </div>
                      )}
                    </button>
                    {/* Multiple check box (move-end)） */}
                    {isMultiSelectMode && page.id && page.generated_image_path && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePageSelection(page.id!);
                        }}
                        className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                          selectedPageIds.has(page.id)
                            ? 'bg-banana-500 text-white'
                            : 'bg-white dark:bg-background-secondary border-2 border-gray-300 dark:border-border-primary'
                        }`}
                      >
                        {selectedPageIds.has(page.id) && <Check size={12} />}
                      </button>
                    )}
                  </div>
                  {/* Desktopend： Full Card */}
                  <div className="hidden md:block relative">
                    {/* Multiple check boxes (desktopend)） */}
                    {isMultiSelectMode && page.id && page.generated_image_path && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePageSelection(page.id!);
                        }}
                        className={`absolute top-2 left-2 z-10 w-6 h-6 rounded flex items-center justify-center transition-all ${
                          selectedPageIds.has(page.id)
                            ? 'bg-banana-500 text-white shadow-md'
                            : 'bg-white/90 border-2 border-gray-300 dark:border-border-primary hover:border-banana-400'
                        }`}
                      >
                        {selectedPageIds.has(page.id) && <Check size={14} />}
                      </button>
                    )}
                    <SlideCard
                      page={page}
                      index={index}
                      isSelected={selectedIndex === index}
                      onClick={() => {
                        if (isMultiSelectMode && page.id && page.generated_image_path) {
                          togglePageSelection(page.id);
                        } else {
                          setSelectedIndex(index);
                        }
                      }}
                      onEdit={() => {
                        setSelectedIndex(index);
                        handleEditPage();
                      }}
                      onDelete={() => page.id && deletePageById(page.id)}
                      isGenerating={page.id ? !!pageGeneratingTasks[page.id] : false}
                      aspectRatio={aspectRatio}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Right： big graphic preview */}
        <main className="relative flex-1 flex flex-col bg-gradient-to-br from-banana-50 dark:from-background-primary via-white dark:via-background-primary to-gray-50 dark:to-background-primary min-w-0 overflow-hidden">
          {currentProject.pages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center overflow-y-auto">
              <div className="text-center">
                <Presentation size={56} className="mx-auto mb-4 text-gray-300 dark:text-foreground-tertiary" strokeWidth={1.5} />
                <h3 className="text-lg md:text-xl font-semibold text-gray-700 dark:text-foreground-secondary mb-2">
                  {t('preview.noPages')}
                </h3>
                <p className="text-sm md:text-base text-gray-500 dark:text-foreground-tertiary mb-6">
                  {t('preview.noPagesHint')}
                </p>
                <Button
                  variant="primary"
                  onClick={() => navigate(`/project/${projectId}/outline`)}
                  className="text-sm md:text-base"
                >
                  {t('preview.backToEdit')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Preview area： slides and floating toolbar below/Command Bar Centre as Group Vertical。
                  On-site editing, slides remain intact, do not zoom, add only one lap of highlight to indicate that they are being edited；
                  The command area is smooth from the capsule position and no more slides.。 */}
              <div className="flex-1 overflow-y-auto min-h-0 flex items-center justify-center p-4 md:p-8">
                <div className="max-w-5xl w-full">
                  <div
                    className={`relative bg-white dark:bg-background-secondary rounded-lg shadow-xl overflow-hidden transition-shadow ${
                      isInlineEditing ? 'ring-2 ring-banana-400' : ''
                    } ${isInlineEditing && isRegionSelectionMode ? 'cursor-crosshair touch-none' : 'touch-manipulation'}`}
                    style={{ aspectRatio: aspectRatioStyle }}
                    onPointerDown={isInlineEditing ? handleSelectionPointerDown : undefined}
                    onPointerMove={isInlineEditing ? handleSelectionPointerMove : undefined}
                    onPointerUp={isInlineEditing ? handleSelectionPointerUp : undefined}
                    onPointerCancel={isInlineEditing ? handleSelectionPointerCancel : undefined}
                  >
                    {selectedPage?.generated_image_path ? (
                      <img
                        ref={isInlineEditing ? imageRef : undefined}
                        src={imageUrl}
                        alt={`Slide ${selectedIndex + 1}`}
                        // Desktop getImageUrl Point 127.0.0.1:<port>，cross-source; area tailoring to this map
                        // Painting canvas，Missing crossOrigin It’s polluting. canvas The image that led to the cut failed.）
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover select-none"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-background-secondary">
                        <div className="text-center">
                          <ImageIcon size={48} className="mx-auto mb-4 text-gray-300 dark:text-foreground-tertiary" strokeWidth={1.5} />
                          <p className="text-gray-500 dark:text-foreground-tertiary mb-4">
                            {selectedPage?.status === 'QUEUED'
                              ? t('preview.queued')
                              : (selectedPage?.id && pageGeneratingTasks[selectedPage.id]) ||
                                selectedPage?.status === 'GENERATING'
                              ? t('preview.generating')
                              : t('preview.notGenerated')}
                          </p>
                          {(!selectedPage?.id || !pageGeneratingTasks[selectedPage.id]) &&
                           selectedPage?.status !== 'QUEUED' &&
                           selectedPage?.status !== 'GENERATING' && (
                            <Button
                              variant="primary"
                              onClick={handleRegeneratePage}
                            >
                              {t('preview.generateThisPage')}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                    {/* In situ editing state： checktips and selection frames are drawn directly on the big map */}
                    {isInlineEditing && (
                      <>
                        <button
                          type="button"
                          aria-pressed={isRegionSelectionMode}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => {
                            resetRegionSelection(!isRegionSelectionMode);
                          }}
                          className={`absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium shadow transition-colors ${
                            isRegionSelectionMode
                              ? 'bg-banana-500 text-black'
                              : 'bg-white/90 text-gray-700 hover:bg-white dark:bg-background-elevated/90 dark:text-foreground-secondary'
                          }`}
                        >
                          <Sparkles size={13} />
                          {isRegionSelectionMode ? t('preview.endRegionSelect') : t('preview.regionSelect')}
                        </button>
                        {selectionRect && (
                          <div
                            data-testid="inline-edit-selection"
                            className="absolute border-2 border-banana-500 bg-banana-500/20 pointer-events-none"
                            style={{
                              left: selectionRect.left,
                              top: selectionRect.top,
                              width: selectionRect.width,
                              height: selectionRect.height,
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>

              {/* The preview capsule is stacked in the same bar as the edit state command dock：Visibility + Transparency + scale
                  Cross-border transition（Apple Wind slows down. cubic-bezier(0.32,0.72,0,1)，Convergence, symmetry），
                  And not...「One disappears in an instant, the other fades down.」。 */}
              <div className="hidden lg:grid mt-4">
                {/* Preview State： Suspended Toolbar */}
                <div
                  data-testid="preview-floating-toolbar"
                  className={`[grid-area:1/1] self-center justify-self-center flex items-center gap-1 rounded-full border border-gray-200 dark:border-border-primary bg-white/95 dark:bg-background-secondary/95 backdrop-blur px-2 py-1.5 shadow-lg origin-center transition-[opacity,transform,visibility] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-opacity motion-reduce:duration-200 [&_button]:whitespace-nowrap ${
                    isInlineEditing
                      ? 'invisible scale-[0.97] opacity-0 pointer-events-none'
                      : 'visible scale-100 opacity-100'
                  }`}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={18} />}
                    onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
                    disabled={selectedIndex === 0}
                    className="rounded-full px-2"
                    title={t('preview.prevPage')}
                    aria-label={t('preview.prevPage')}
                  />
                  <span className="px-1.5 text-sm text-gray-600 dark:text-foreground-tertiary whitespace-nowrap tabular-nums">
                    {selectedIndex + 1} / {currentProject.pages.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronRight size={18} />}
                    onClick={() =>
                      setSelectedIndex(
                        Math.min(currentProject.pages.length - 1, selectedIndex + 1)
                      )
                    }
                    disabled={selectedIndex === currentProject.pages.length - 1}
                    className="rounded-full px-2"
                    title={t('preview.nextPage')}
                    aria-label={t('preview.nextPage')}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Play size={18} />}
                    data-play-trigger
                    onClick={handleOpenPlayer}
                    className="rounded-full px-2"
                    title={t('preview.play')}
                    aria-label={t('preview.play')}
                  />
                  <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-border-primary" />
                  {imageVersions.length > 1 && (
                    <VersionHistoryMenu
                      versions={imageVersions}
                      open={showVersionMenu}
                      onToggleOpen={() => setShowVersionMenu(!showVersionMenu)}
                      onSwitchVersion={handleSwitchVersion}
                      t={t}
                      buttonClassName="rounded-full text-sm"
                      menuAlign="center"
                    />
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleEditPage}
                    disabled={!selectedPage}
                    className="rounded-full text-sm"
                  >
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRegeneratePage}
                    disabled={isCurrentPageGenerating}
                    className="rounded-full text-sm"
                  >
                    {isCurrentPageGenerating ? t('preview.regenerating') : t('preview.regenerate')}
                  </Button>
                </div>

                {/* Edit State： Single Command Bar + Upper Reference Thumbnail */}
                <div
                  className={`[grid-area:1/1] self-center w-full flex flex-col items-center gap-2 origin-center transition-[opacity,transform,visibility] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-opacity motion-reduce:duration-200 ${
                    isInlineEditing
                      ? 'visible scale-100 opacity-100'
                      : 'invisible scale-[0.97] opacity-0 pointer-events-none'
                  }`}
                >
                  {/* Edit attachment line only： command bar though visibility:hidden But they still do. grid Orbital，
                      The rest of the reference diagrams left after exiting the editing will leave a gap at the top of the visible capsule. */}
                  {isInlineEditing && selectedContextImages.uploadedFiles.length > 0 && (
                    <div
                      data-testid="inline-edit-attachments"
                      className="flex flex-wrap items-center justify-center gap-2"
                    >
                      {selectedContextImages.uploadedFiles.map((file, idx) => (
                        <div key={`${file.name}-${idx}`} className="group relative">
                          <img
                            src={uploadedPreviews[idx] || ''}
                            alt={`${t('preview.uploadImages')} ${idx + 1}`}
                            data-testid="inline-edit-attachment-thumb"
                            className="h-12 w-12 rounded-lg border border-gray-200 object-cover shadow-sm dark:border-border-primary"
                          />
                          <button
                            type="button"
                            onClick={() => removeUploadedFile(idx)}
                            aria-label={t('common.delete')}
                            className="no-min-touch-target absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white shadow transition-transform hover:scale-110 active:scale-95 dark:bg-background-elevated"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div
                    data-testid="inline-edit-panel"
                    className="relative flex w-full max-w-2xl items-center gap-1 rounded-3xl border border-gray-200 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur dark:border-border-primary dark:bg-background-secondary/95"
                  >
                    {/* Additional reference chart： individual + Icon Open Menu (Book Library) / Upload） */}
                    <div className="relative flex-shrink-0" ref={attachMenuRef}>
                      <button
                        type="button"
                        onClick={() => setShowAttachMenu((v) => !v)}
                        aria-label={t('preview.addReference')}
                        title={t('preview.addReference')}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 active:scale-90 dark:text-foreground-tertiary dark:hover:bg-background-hover"
                      >
                        <ImagePlus size={18} />
                      </button>
                      {showAttachMenu && (
                        <div className="absolute bottom-full left-0 z-20 mb-2 w-40 origin-bottom-left overflow-hidden rounded-xl border border-gray-200 bg-white/95 py-1 shadow-lg backdrop-blur animate-[popIn_140ms_cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none dark:border-border-primary dark:bg-background-secondary/95">
                          <button
                            type="button"
                            onClick={() => { setShowAttachMenu(false); setIsMaterialSelectorOpen(true); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-foreground-secondary dark:hover:bg-background-hover"
                          >
                            <ImagePlus size={15} />
                            {t('preview.selectFromMaterials')}
                          </button>
                          <label className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-foreground-secondary dark:hover:bg-background-hover">
                            <Upload size={15} />
                            {t('preview.uploadImages')}
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => { setShowAttachMenu(false); handleFileUpload(e); }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                    {/* Instruction input： One-line, long with content，Cmd/Ctrl+Enter Submit */}
                    <textarea
                      data-testid="inline-edit-prompt"
                      rows={1}
                      value={editPrompt}
                      placeholder={t('preview.inlineEditPromptPlaceholder')}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      onFocus={() => setShowAttachMenu(false)}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = 'auto';
                        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && editPrompt.trim() && !isCurrentPageGenerating) {
                          e.preventDefault();
                          handleSubmitEdit();
                        }
                      }}
                      className="max-h-32 min-w-0 flex-1 resize-none self-center bg-transparent px-1.5 py-1.5 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400 dark:text-foreground-primary dark:placeholder:text-foreground-tertiary"
                    />
                    <button
                      type="button"
                      onClick={exitInlineEditing}
                      aria-label={t('common.cancel')}
                      title={t('common.cancel')}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 active:scale-90 dark:hover:bg-background-hover"
                    >
                      <X size={17} />
                    </button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSubmitEdit}
                      disabled={!editPrompt.trim() || isCurrentPageGenerating}
                      className="flex-shrink-0 rounded-full text-sm"
                    >
                      {isCurrentPageGenerating ? t('preview.regenerating') : t('preview.generateImage')}
                    </Button>
                  </div>
                </div>
              </div>
                </div>
              </div>

              {/* Control Bar（lg Below： narrow screens maintained docked Layout */}
              <div data-testid="preview-docked-toolbar" className="lg:hidden bg-white dark:bg-background-secondary border-t border-gray-200 dark:border-border-primary px-3 md:px-6 py-3 md:py-4 flex-shrink-0">
                {/* flex-wrap + nowrap Button： Spread the entire line after opening the drawer instead of breaking the button text */}
                <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-3 max-w-5xl mx-auto [&_button]:whitespace-nowrap">
                  {/* Navigation */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<ChevronLeft size={16} className="md:w-[18px] md:h-[18px]" />}
                      onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
                      disabled={selectedIndex === 0}
                      className="text-xs md:text-sm"
                    >
                      <span className="hidden sm:inline">{t('preview.prevPage')}</span>
                      <span className="sm:hidden">{t('preview.prevPage')}</span>
                    </Button>
                    <span className="px-2 md:px-4 text-xs md:text-sm text-gray-600 dark:text-foreground-tertiary whitespace-nowrap">
                      {selectedIndex + 1} / {currentProject.pages.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Play size={16} className="md:w-[18px] md:h-[18px]" />}
                      data-play-trigger
                      onClick={handleOpenPlayer}
                      className="text-xs md:text-sm"
                      title={t('preview.play')}
                      aria-label={t('preview.play')}
                    >
                      <span>{t('preview.play')}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<ChevronRight size={16} className="md:w-[18px] md:h-[18px]" />}
                      onClick={() =>
                        setSelectedIndex(
                          Math.min(currentProject.pages.length - 1, selectedIndex + 1)
                        )
                      }
                      disabled={selectedIndex === currentProject.pages.length - 1}
                      className="text-xs md:text-sm"
                    >
                      <span className="hidden sm:inline">{t('preview.nextPage')}</span>
                      <span className="sm:hidden">{t('preview.nextPage')}</span>
                    </Button>
                  </div>

                  {/* Operation */}
                  <div className="flex items-center gap-1.5 md:gap-2 w-full sm:w-auto justify-center">
                    <QualityControlToggle
                      enabled={imageQualityControlEnabled}
                      saving={isSavingImageQualityControl}
                      onToggle={handleToggleImageQualityControl}
                      t={t}
                      className="px-1.5 py-1"
                      labelClassName="hidden md:inline"
                      tooltipPlacement="top"
                      tooltipTestId="quality-control-tooltip-docked"
                    />
                    {/* Cellular Port：multi Mode into template configuration，single Mode to open replacement template */}
                    {currentProject?.template_mode === 'multi' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<LayoutTemplate size={16} />}
                        onClick={() => navigate(`/project/${projectId}/template-setup`)}
                        className="lg:hidden text-xs"
                        title={t('preview.templateSetup')}
                      />
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Upload size={16} />}
                        onClick={() => { setDraftTemplateStyle(templateStyle); setIsTemplateModalOpen(true); }}
                        className="lg:hidden text-xs"
                        title={t('preview.changeTemplate')}
                      />
                    )}
                    {/* Cell： Material Generation Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<ImagePlus size={16} />}
                      onClick={() => setIsMaterialModalOpen(true)}
                      className="lg:hidden text-xs"
                      title={t('nav.materialGenerate')}
                    />
                    {/* Mobile： Refresh buttons */}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />}
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      className="md:hidden text-xs"
                      title={t('preview.refresh')}
                    />
                    {imageVersions.length > 1 && (
                      <VersionHistoryMenu
                        versions={imageVersions}
                        open={showVersionMenu}
                        onToggleOpen={() => setShowVersionMenu(!showVersionMenu)}
                        onSwitchVersion={handleSwitchVersion}
                        t={t}
                      />
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleEditPage}
                      disabled={!selectedPage}
                      className="text-xs md:text-sm flex-1 sm:flex-initial"
                    >
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRegeneratePage}
                      disabled={isCurrentPageGenerating}
                      className="text-xs md:text-sm flex-1 sm:flex-initial"
                    >
                      {isCurrentPageGenerating ? t('preview.regenerating') : t('preview.regenerate')}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>

        {/* Right： Page Properties drawers (to drag and tow, desktop end to squeeze the layout in place, narrow screen float display)） */}
        <PagePropertiesDrawer
          page={selectedPage}
          projectId={projectId}
          pageIndex={selectedIndex}
          pageCount={currentProject.pages.length}
          versionCount={imageVersions.length}
          templateMode={currentProject.template_mode}
          templateAssets={templateAssets}
          extraFieldNames={descriptionExtraFields}
          imagePromptFields={imagePromptExtraFields}
          isOpen={isPropertiesOpen}
          isSaving={isSavingPages}
          width={propertiesWidth}
          onWidthChange={handlePropertiesWidthChange}
          onOpen={() => setPropertiesOpen(true)}
          onClose={() => setPropertiesOpen(false)}
          onUpdate={updatePageLocal}
          onUpdatePageTemplate={handleUpdatePageTemplate}
          onUploadTemplateAsset={handleUploadTemplateAsset}
          onOpenTemplateSetup={() => navigate(`/project/${projectId}/template-setup`)}
          showToast={show}
        />
      </div>

      {/* Edit Dialog */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        title={t('preview.editPage')}
        size="lg"
      >
        <div className="space-y-4">
          {/* Picture (support rectangular area selection)） */}
          <div
            className={`bg-gray-100 dark:bg-background-secondary rounded-lg overflow-hidden relative ${
              isRegionSelectionMode ? 'cursor-crosshair touch-none' : 'touch-manipulation'
            }`}
            style={{ aspectRatio: aspectRatioStyle }}
            onPointerDown={handleSelectionPointerDown}
            onPointerMove={handleSelectionPointerMove}
            onPointerUp={handleSelectionPointerUp}
            onPointerCancel={handleSelectionPointerCancel}
          >
            {imageUrl && (
              <>
                {/* Top left corner： Area Selection Mode Switch */}
                <button
                  type="button"
                  aria-pressed={isRegionSelectionMode}
                  onClick={(e) => {
                    e.stopPropagation();
                    resetRegionSelection(!isRegionSelectionMode);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`absolute top-2 left-2 z-10 px-2 py-1 rounded text-[10px] shadow-sm dark:shadow-background-primary/30 flex items-center gap-1 ${
                    isRegionSelectionMode
                      ? 'bg-banana-500 text-black'
                      : 'bg-white/80 text-gray-700 dark:text-foreground-secondary hover:bg-banana-50 dark:hover:bg-background-hover'
                  }`}
                >
                  <Sparkles size={12} />
                  <span>{isRegionSelectionMode ? t('preview.endRegionSelect') : t('preview.regionSelect')}</span>
                </button>

                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Current slide"
                  className="w-full h-full object-contain select-none"
                  draggable={false}
                  crossOrigin="anonymous"
                />
                {selectionRect && (
                  <div
                    className="absolute border-2 border-banana-500 bg-banana-400/10 pointer-events-none"
                    style={{
                      left: selectionRect.left,
                      top: selectionRect.top,
                      width: selectionRect.width,
                      height: selectionRect.height,
                    }}
                  />
                )}
              </>
            )}
          </div>

          {/* Outline - Editable */}
          <div className="bg-gray-50 dark:bg-background-primary rounded-lg border border-gray-200 dark:border-border-primary">
            <button
              onClick={() => setIsOutlineExpanded(!isOutlineExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-background-hover transition-colors"
            >
              <h4 className="text-sm font-semibold text-gray-700 dark:text-foreground-secondary">{t('preview.pageOutline')}</h4>
              {isOutlineExpanded ? (
                <ChevronUp size={18} className="text-gray-500 dark:text-foreground-tertiary" />
              ) : (
                <ChevronDown size={18} className="text-gray-500 dark:text-foreground-tertiary" />
              )}
            </button>
            {isOutlineExpanded && (
              <div className="px-4 pb-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-foreground-tertiary mb-1">{t('outline.titleLabel')}</label>
                  <input
                    type="text"
                    value={editOutlineTitle}
                    onChange={(e) => setEditOutlineTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-border-primary bg-white dark:bg-background-secondary text-gray-900 dark:text-foreground-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-banana-500"
                    placeholder={t('preview.enterTitle')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-foreground-tertiary mb-1">{t('preview.pointsPerLine')}</label>
                  <textarea
                    value={editOutlinePoints}
                    onChange={(e) => setEditOutlinePoints(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-border-primary bg-white dark:bg-background-secondary text-gray-900 dark:text-foreground-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-banana-500 resize-none"
                    placeholder={t('preview.enterPointsPerLine')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Description - Editable */}
          <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
            <button
              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              <h4 className="text-sm font-semibold text-gray-700 dark:text-foreground-secondary">{t('preview.pageDescription')}</h4>
              {isDescriptionExpanded ? (
                <ChevronUp size={18} className="text-gray-500 dark:text-foreground-tertiary" />
              ) : (
                <ChevronDown size={18} className="text-gray-500 dark:text-foreground-tertiary" />
              )}
            </button>
            {isDescriptionExpanded && (
              <div className="px-4 pb-4">
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 text-sm border border-blue-300 dark:border-blue-700 bg-white dark:bg-background-secondary text-gray-900 dark:text-foreground-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-banana-500 resize-none"
                  placeholder={t('preview.enterDescription')}
                />
              </div>
            )}
          </div>

          {/* Context Picture Selection */}
          <div className="bg-gray-50 dark:bg-background-primary rounded-lg border border-gray-200 dark:border-border-primary p-4 space-y-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-foreground-secondary mb-3">{t('preview.selectContextImages')}</h4>

            {/* Template Picture Selection */}
            {currentProject?.template_image_path && (
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="use-template"
                  checked={selectedContextImages.useTemplate}
                  onChange={(e) =>
                    setSelectedContextImages((prev) => ({
                      ...prev,
                      useTemplate: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 text-banana-600 rounded focus:ring-banana-500"
                />
                <label htmlFor="use-template" className="flex items-center gap-2 cursor-pointer">
                  <ImageIcon size={16} className="text-gray-500 dark:text-foreground-tertiary" />
                  <span className="text-sm text-gray-700 dark:text-foreground-secondary">{t('preview.useTemplateImage')}</span>
                  {currentProject.template_image_path && (
                    <img
                      src={getImageUrl(currentProject.template_image_path, currentProject.updated_at)}
                      alt="Template"
                      className="w-16 h-10 object-cover rounded border border-gray-300 dark:border-border-primary"
                    />
                  )}
                </label>
              </div>
            )}

            {/* Desc Pictures in */}
            {selectedPage?.description_content && (() => {
              const descImageUrls = extractImageUrlsFromDescription(selectedPage.description_content);
              return descImageUrls.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">{t('preview.imagesInDescription')}:</label>
                  <div className="grid grid-cols-3 gap-2">
                    {descImageUrls.map((url, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={url}
                          alt={`Desc image ${idx + 1}`}
                          className="w-full h-20 object-cover rounded border-2 border-gray-300 dark:border-border-primary cursor-pointer transition-all"
                          style={{
                            borderColor: selectedContextImages.descImageUrls.includes(url)
                              ? 'var(--banana-yellow)'
                              : 'var(--border-primary)',
                          }}
                          onClick={() => {
                            setSelectedContextImages((prev) => {
                              const isSelected = prev.descImageUrls.includes(url);
                              return {
                                ...prev,
                                descImageUrls: isSelected
                                  ? prev.descImageUrls.filter((u) => u !== url)
                                  : [...prev.descImageUrls, url],
                              };
                            });
                          }}
                        />
                        {selectedContextImages.descImageUrls.includes(url) && (
                          <div className="absolute inset-0 bg-banana-500/20 border-2 border-banana-500 rounded flex items-center justify-center">
                            <div className="w-6 h-6 bg-banana-500 rounded-full flex items-center justify-center">
                              <Check size={12} className="text-white" strokeWidth={3} />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {/* Upload pictures */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">{t('preview.uploadImages')}:</label>
                {projectId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ImagePlus size={16} />}
                    onClick={() => setIsMaterialSelectorOpen(true)}
                  >
                    {t('preview.selectFromMaterials')}
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedContextImages.uploadedFiles.map((_, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={uploadedPreviews[idx] || ''}
                      alt={`Uploaded ${idx + 1}`}
                      className="w-20 h-20 object-cover rounded border border-gray-300 dark:border-border-primary"
                    />
                    <button
                      onClick={() => removeUploadedFile(idx)}
                      className="no-min-touch-target absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <label className="w-20 h-20 border-2 border-dashed border-gray-300 dark:border-border-primary rounded flex flex-col items-center justify-center cursor-pointer hover:border-banana-500 transition-colors">
                  <Upload size={20} className="text-gray-400 mb-1" />
                  <span className="text-xs text-gray-500 dark:text-foreground-tertiary">{t('preview.upload')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Edit Box */}
          <Textarea
            label={t('preview.editPromptLabel')}
            placeholder={t('preview.editPromptPlaceholder')}
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            rows={4}
          />
          <div className="flex justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                handleSaveOutlineAndDescription();
                closeEditModal();
              }}
            >
              {t('preview.saveOutlineOnly')}
            </Button>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={closeEditModal}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmitEdit}
                disabled={!editPrompt.trim() || !selectedPage?.generated_image_path}
              >
                {t('preview.generateImage')}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
      <ToastContainer />
      {ConfirmDialog}

      {/* Template Selection Modal */}
      <Modal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        title={t('preview.changeTemplate')}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-foreground-tertiary mb-4">
            {t('preview.templateModalDesc')}
          </p>
          {/* Picture Template / Text Style Switch */}
          <label className="flex items-center gap-2 cursor-pointer group">
            <span className="text-sm text-gray-600 dark:text-foreground-tertiary group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
              {t('preview.useTextStyle')}
            </span>
            <div className="relative">
              <input
                type="checkbox"
                checked={useTextStyleMode}
                onChange={(e) => setUseTextStyleMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-background-hover peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-banana-300 dark:peer-focus:ring-banana/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white dark:after:bg-foreground-secondary after:border-gray-300 dark:after:border-border-hover after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-banana"></div>
            </div>
          </label>
          {useTextStyleMode ? (
            <TextStyleSelector
              value={draftTemplateStyle}
              onChange={setDraftTemplateStyle}
              onToast={show}
              sourceContent={
                currentProject?.pages
                  ?.map((p) => {
                    const title = p.outline_content?.title || '';
                    const points = p.outline_content?.points || [];
                    const descText = (p.description_content && 'text' in p.description_content ? p.description_content.text : p.description_content?.text_content.join('\n')) || '';
                    return [title, ...points, descText].filter(Boolean).join('\n');
                  })
                  .filter(Boolean)
                  .join('\n\n') || currentProject?.idea_prompt || currentProject?.outline_text || currentProject?.description_text || ''
              }
            />
          ) : (
            <>
              <TemplateSelector
                onSelect={handleTemplateSelect}
                selectedTemplateId={selectedTemplateId}
                selectedPresetTemplateId={selectedPresetTemplateId}
                showUpload={false}
                projectId={projectId || null}
              />
              {isUploadingTemplate && (
                <div className="text-center py-2 text-sm text-gray-500 dark:text-foreground-tertiary">
                  {t('preview.uploadingTemplate')}
                </div>
              )}
            </>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t">
            {useTextStyleMode && (
              <Button
                variant="primary"
                loading={isSavingTemplateStyle}
                onClick={async () => {
                  isEditingTemplateStyle.current = true;
                  setTemplateStyle(draftTemplateStyle);
                  setIsSavingTemplateStyle(true);
                  try {
                    await updateProject(projectId!, { template_style: draftTemplateStyle || '' });
                    isEditingTemplateStyle.current = false;
                    await syncProject(projectId!);
                    show({ message: t('slidePreview.styleDescSaved'), type: 'success' });
                    setIsTemplateModalOpen(false);
                  } catch (error: any) {
                    show({ message: t('slidePreview.saveFailed', { error: error.message || t('slidePreview.unknownError') }), type: 'error' });
                  } finally {
                    setIsSavingTemplateStyle(false);
                  }
                }}
              >
                {t('preview.applyStyle')}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => setIsTemplateModalOpen(false)}
              disabled={isUploadingTemplate || isSavingTemplateStyle}
            >
              {t('common.close')}
            </Button>
          </div>
        </div>
      </Modal>
      {/* Materials to generate modular components (reusable modules, here is only an example to mount)） */}
      {projectId && (
        <>
          <MaterialGeneratorModal
            projectId={projectId}
            isOpen={isMaterialModalOpen}
            onClose={() => setIsMaterialModalOpen(false)}
          />
          {/* Material Selector */}
          <MaterialSelector
            projectId={projectId}
            isOpen={isMaterialSelectorOpen}
            onClose={() => setIsMaterialSelectorOpen(false)}
            onSelect={handleSelectMaterials}
            multiple={true}
          />
          {/* Item Setup Modular Box */}
          <ProjectSettingsModal
            isOpen={isProjectSettingsOpen}
            onClose={() => setIsProjectSettingsOpen(false)}
            extraRequirements={extraRequirements}
            templateStyle={templateStyle}
            sourceContent={
              currentProject?.pages
                ?.map((p) => {
                  const title = p.outline_content?.title || '';
                  const points = p.outline_content?.points || [];
                  const descText = (p.description_content && 'text' in p.description_content ? p.description_content.text : p.description_content?.text_content.join('\n')) || '';
                  return [title, ...points, descText].filter(Boolean).join('\n');
                })
                .filter(Boolean)
                .join('\n\n') || currentProject?.idea_prompt || currentProject?.outline_text || currentProject?.description_text || ''
            }
            onExtraRequirementsChange={(value) => {
              isEditingRequirements.current = true;
              setExtraRequirements(value);
            }}
            onTemplateStyleChange={(value) => {
              isEditingTemplateStyle.current = true;
              setTemplateStyle(value);
            }}
            onSaveExtraRequirements={handleSaveExtraRequirements}
            onSaveTemplateStyle={handleSaveTemplateStyle}
            isSavingRequirements={isSavingRequirements}
            isSavingTemplateStyle={isSavingTemplateStyle}
            // Export Settings
            exportExtractorMethod={exportExtractorMethod}
            exportInpaintMethod={exportInpaintMethod}
            exportAllowPartial={exportAllowPartial}
            enableIconSubjectExtraction={enableIconSubjectExtraction}
            onExportExtractorMethodChange={setExportExtractorMethod}
            onExportInpaintMethodChange={setExportInpaintMethod}
            onExportAllowPartialChange={setExportAllowPartial}
            onEnableIconSubjectExtractionChange={setEnableIconSubjectExtraction}
            onSaveExportSettings={handleSaveExportSettings}
            isSavingExportSettings={isSavingExportSettings}
            // Image Scale
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            onSaveAspectRatio={handleSaveAspectRatio}
            isSavingAspectRatio={isSavingAspectRatio}
            hasImages={hasImages}
          />
        </>
      )}

      {/* Each page is independent→Unified Template Switching Bomb Layers */}
      <SwitchToSingleModeDialog
        isOpen={isSwitchSingleOpen}
        onClose={() => setIsSwitchSingleOpen(false)}
        assets={templateAssets}
        onConfirmExisting={handleSwitchToSingleExisting}
        onConfirmUpload={handleSwitchToSingleUpload}
      />

      {/* 1K Resolution Warning Dialogue */}
      <Modal
        isOpen={show1KWarningDialog}
        onClose={handleCancel1KWarning}
        title={t('preview.resolution1KWarning')}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle size={22} className="text-amber-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-amber-800">
                {t('preview.resolution1KWarningText')}
              </p>
              <p className="text-sm text-amber-700 mt-2">
                {t('preview.resolution1KWarningHint')}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={skip1KWarningChecked}
              onChange={(e) => setSkip1KWarningChecked(e.target.checked)}
              className="w-4 h-4 text-banana-600 rounded focus:ring-banana-500"
            />
            <span className="text-sm text-gray-600 dark:text-foreground-tertiary">{t('preview.dontShowAgain')}</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleCancel1KWarning}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleConfirm1KWarning}>
              {t('preview.generateAnyway')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Online： Approximate full screen overlay，Support to switch browser whole screen */}
      <SlidePlayer
        key={isPlayerOpen ? 'open' : 'closed'}
        open={isPlayerOpen}
        initialIndex={selectedIndex}
        pages={currentProject.pages}
        aspectRatio={aspectRatio}
        onClose={handleClosePlayer}
        onIndexChange={setSelectedIndex}
      />

    </div>
  );
};
