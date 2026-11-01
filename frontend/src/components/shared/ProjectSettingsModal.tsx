import React, { useState } from 'react';
import { X, FileText, Settings as SettingsIcon, Download, Sparkles, AlertTriangle, HelpCircle, Lightbulb } from 'lucide-react';
import { Button, Textarea, TextStyleSelector } from '@/components/shared';
import { useT } from '@/hooks/useT';
import { SettingsPage } from '@/pages/Settings';
import type { ExportExtractorMethod, ExportInpaintMethod } from '@/types';
import { ASPECT_RATIO_OPTIONS } from '@/config/aspectRatio';

// ProjectSettings Component contains translation
const projectSettingsI18n = {
  zh: {
    projectSettings: {
      title: "Settings", projectConfig: "Project Settings", exportConfig: "Export Settings", globalConfig: "Global Settings",
      projectConfigTitle: "Project-level Configuration", projectConfigDesc: "These settings only apply to the current project",
      globalConfigTitle: "Global Settings", globalConfigDesc: "These settings apply to all projects",
      aspectRatio: "Aspect Ratio", aspectRatioDesc: "Set the aspect ratio for generated slide images",
      aspectRatioLocked: "Cannot change aspect ratio after images have been generated",
      aspectRatioHelp: "Azure GPT-image-2 supports aspect ratios up to 3:1.",
      extraRequirements: "Extra Requirements", extraRequirementsDesc: "AI will reference these extra requirements when generating each page",
      extraRequirementsPlaceholder: "e.g., Use compact layout, show first-level outline title at top, add richer PPT illustrations...",
      saveExtraRequirements: "Save Extra Requirements",
      styleDescription: "Style Description", styleDescriptionDesc: "Describe your expected PPT overall style, AI will generate pages in that style",
      styleDescriptionPlaceholder: "e.g., Simple business style, use navy blue and white colors, clear fonts, clean layout...",
      saveStyleDescription: "Save Style Description",
      styleTip: "Style description will be automatically added to the prompt when generating images. If a template image is also uploaded, the style description will serve as supplementary notes.",
      editablePptxExport: "Editable PPTX Export Settings", editablePptxExportDesc: "Configure how \"Export Editable PPTX\" works. These settings affect export quality and API call costs.",
      extractorMethod: "Component Extraction Method", extractorMethodDesc: "Choose how to extract editable components like text and tables from PPT images",
      extractorHybrid: "Hybrid Extraction (Recommended)", extractorHybridDesc: "Extract text with the configured local or company OCR service.",
      extractorMineru: "MinerU Extraction", extractorMineruDesc: "Use only MinerU for layout analysis and text recognition",
      backgroundMethod: "Background Image Method", backgroundMethodDesc: "Choose how to generate clean background images (remove text from original for PPT background)",
      backgroundHybrid: "Hybrid Method (Recommended)", backgroundHybridDesc: "Local text removal with Azure image enhancement.",
      backgroundGenerative: "Generative Method", backgroundGenerativeDesc: "Use Azure GPT-image-2 to recreate the background; some original elements may remain.",
      backgroundBaidu: "Local restoration", backgroundBaiduDesc: "Restore the background locally with OpenCV.",
      usesAiModel: "Uses AI Image Model",
      costTip: "Azure image generation incurs API usage per page. Local restoration uses OpenCV.",
      iconSubjectExtraction: "Icon Transparent Background",
      iconSubjectExtractionDesc: "When enabled, images detected as icons during export are processed via the local RMBG-2.0 model to produce transparent-background PNGs before being placed in the PPT, avoiding the icon's original background clashing with the new slide background. Only applies to elements classified as icons; photos and illustrations keep the original rectangular crop.",
      iconSubjectExtractionTip: "Powered by local RMBG-2.0 ONNX inference. The ~512MB model is downloaded automatically on first use. If extraction fails for an individual icon, it falls back silently to the original rectangular crop without affecting export.",
      errorHandling: "Error Handling Strategy", errorHandlingDesc: "Configure how to handle errors during export",
      allowPartialResult: "Allow Partial Results", allowPartialResultDesc: "When enabled, export will skip errors (like style extraction or text rendering failures) and continue, potentially resulting in incomplete output. When disabled, any error will stop export immediately with a specific reason.",
      allowPartialResultWarning: "Enabling this option may result in PPTX files with missing text styles, mispositioned elements, or missing content. Only enable when you need quick results and can accept quality loss.",
      saveExportSettings: "Save Export Settings",
      tip: "Tip"
    },
    shared: { saving: "Saving..." }
  },
  en: {
    projectSettings: {
      title: "Settings", projectConfig: "Project Settings", exportConfig: "Export Settings", globalConfig: "Global Settings",
      projectConfigTitle: "Project-level Configuration", projectConfigDesc: "These settings only apply to the current project",
      globalConfigTitle: "Global Settings", globalConfigDesc: "These settings apply to all projects",
      aspectRatio: "Aspect Ratio", aspectRatioDesc: "Set the aspect ratio for generated slide images",
      aspectRatioLocked: "Cannot change aspect ratio after images have been generated",
      aspectRatioHelp: "Azure GPT-image-2 supports aspect ratios up to 3:1.",
      extraRequirements: "Extra Requirements", extraRequirementsDesc: "AI will reference these extra requirements when generating each page",
      extraRequirementsPlaceholder: "e.g., Use compact layout, show first-level outline title at top, add richer PPT illustrations...",
      saveExtraRequirements: "Save Extra Requirements",
      styleDescription: "Style Description", styleDescriptionDesc: "Describe your expected PPT overall style, AI will generate pages in that style",
      styleDescriptionPlaceholder: "e.g., Simple business style, use navy blue and white colors, clear fonts, clean layout...",
      saveStyleDescription: "Save Style Description",
      styleTip: "Style description will be automatically added to the prompt when generating images. If a template image is also uploaded, the style description will serve as supplementary notes.",
      editablePptxExport: "Editable PPTX Export Settings", editablePptxExportDesc: "Configure how \"Export Editable PPTX\" works. These settings affect export quality and API call costs.",
      extractorMethod: "Component Extraction Method", extractorMethodDesc: "Choose how to extract editable components like text and tables from PPT images",
      extractorHybrid: "Hybrid Extraction (Recommended)", extractorHybridDesc: "Extract text with the configured local or company OCR service.",
      extractorMineru: "MinerU Extraction", extractorMineruDesc: "Use only MinerU for layout analysis and text recognition",
      backgroundMethod: "Background Image Method", backgroundMethodDesc: "Choose how to generate clean background images (remove text from original for PPT background)",
      backgroundHybrid: "Hybrid Method (Recommended)", backgroundHybridDesc: "Local text removal with Azure image enhancement.",
      backgroundGenerative: "Generative Method", backgroundGenerativeDesc: "Use Azure GPT-image-2 to recreate the background; some original elements may remain.",
      backgroundBaidu: "Local restoration", backgroundBaiduDesc: "Restore the background locally with OpenCV.",
      usesAiModel: "Uses AI Image Model",
      costTip: "Azure image generation incurs API usage per page. Local restoration uses OpenCV.",
      iconSubjectExtraction: "Icon Transparent Background",
      iconSubjectExtractionDesc: "When enabled, images detected as icons during export are processed via the local RMBG-2.0 model to produce transparent-background PNGs before being placed in the PPT, avoiding the icon's original background clashing with the new slide background. Only applies to elements classified as icons; photos and illustrations keep the original rectangular crop.",
      iconSubjectExtractionTip: "Powered by local RMBG-2.0 ONNX inference. The ~512MB model is downloaded automatically on first use. If extraction fails for an individual icon, it falls back silently to the original rectangular crop without affecting export.",
      errorHandling: "Error Handling Strategy", errorHandlingDesc: "Configure how to handle errors during export",
      allowPartialResult: "Allow Partial Results", allowPartialResultDesc: "When enabled, export will skip errors (like style extraction or text rendering failures) and continue, potentially resulting in incomplete output. When disabled, any error will stop export immediately with a specific reason.",
      allowPartialResultWarning: "Enabling this option may result in PPTX files with missing text styles, mispositioned elements, or missing content. Only enable when you need quick results and can accept quality loss.",
      saveExportSettings: "Save Export Settings",
      tip: "Tip"
    },
    shared: { saving: "Saving..." }
  }
};

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  extraRequirements: string;
  templateStyle: string;
  onExtraRequirementsChange: (value: string) => void;
  onTemplateStyleChange: (value: string) => void;
  onSaveExtraRequirements: () => void;
  onSaveTemplateStyle: () => void;
  isSavingRequirements: boolean;
  isSavingTemplateStyle: boolean;
  sourceContent?: string;
  exportExtractorMethod?: ExportExtractorMethod;
  exportInpaintMethod?: ExportInpaintMethod;
  exportAllowPartial?: boolean;
  enableIconSubjectExtraction?: boolean;
  onExportExtractorMethodChange?: (value: ExportExtractorMethod) => void;
  onExportInpaintMethodChange?: (value: ExportInpaintMethod) => void;
  onExportAllowPartialChange?: (value: boolean) => void;
  onEnableIconSubjectExtractionChange?: (value: boolean) => void;
  onSaveExportSettings?: () => void;
  isSavingExportSettings?: boolean;
  aspectRatio?: string;
  onAspectRatioChange?: (value: string) => void;
  onSaveAspectRatio?: () => void;
  isSavingAspectRatio?: boolean;
  hasImages?: boolean;
}

type SettingsTab = 'project' | 'global' | 'export';

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  isOpen,
  onClose,
  extraRequirements,
  templateStyle,
  onExtraRequirementsChange,
  onTemplateStyleChange,
  onSaveExtraRequirements,
  onSaveTemplateStyle,
  isSavingRequirements,
  isSavingTemplateStyle,
  sourceContent,
  exportExtractorMethod = 'configured',
  exportInpaintMethod = 'local',
  exportAllowPartial = false,
  onExportExtractorMethodChange,
  onExportInpaintMethodChange,
  onExportAllowPartialChange,
  onEnableIconSubjectExtractionChange,
  onSaveExportSettings,
  isSavingExportSettings = false,
  aspectRatio = '16:9',
  onAspectRatioChange,
  onSaveAspectRatio,
  isSavingAspectRatio = false,
  hasImages = false,
}) => {
  const t = useT(projectSettingsI18n);
  const [activeTab, setActiveTab] = useState<SettingsTab>('project');

  const EXTRACTOR_METHOD_OPTIONS: { value: ExportExtractorMethod; labelKey: string; descKey: string }[] = [
    { value: 'configured', labelKey: 'projectSettings.extractorHybrid', descKey: 'projectSettings.extractorHybridDesc' },
  ];

  const INPAINT_METHOD_OPTIONS: { value: ExportInpaintMethod; labelKey: string; descKey: string; usesAI: boolean }[] = [
    { value: 'local', labelKey: 'projectSettings.backgroundHybrid', descKey: 'projectSettings.backgroundHybridDesc', usesAI: false },
    { value: 'generative', labelKey: 'projectSettings.backgroundGenerative', descKey: 'projectSettings.backgroundGenerativeDesc', usesAI: true },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-background-secondary rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-border-primary flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-foreground-primary">{t('projectSettings.title')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-background-hover rounded-lg transition-colors"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          <aside className="w-full md:w-64 bg-gray-50 dark:bg-background-primary border-b md:border-b-0 md:border-r border-gray-200 dark:border-border-primary flex-shrink-0">
            <nav className="grid grid-cols-3 gap-2 p-2 md:block md:p-4 md:space-y-2">
              <button
                onClick={() => setActiveTab('project')}
                className={`w-full flex items-center justify-center md:justify-start gap-2 md:gap-3 px-2 md:px-4 py-3 rounded-lg transition-all ${
                  activeTab === 'project'
                    ? 'bg-banana-500 text-white shadow-md'
                    : 'bg-white dark:bg-background-secondary text-gray-700 dark:text-foreground-secondary hover:bg-gray-100 dark:hover:bg-background-hover'
                }`}
              >
                <FileText size={20} />
                <span className="font-medium">{t('projectSettings.projectConfig')}</span>
              </button>
              <button
                onClick={() => setActiveTab('export')}
                className={`w-full flex items-center justify-center md:justify-start gap-2 md:gap-3 px-2 md:px-4 py-3 rounded-lg transition-all ${
                  activeTab === 'export'
                    ? 'bg-banana-500 text-white shadow-md'
                    : 'bg-white dark:bg-background-secondary text-gray-700 dark:text-foreground-secondary hover:bg-gray-100 dark:hover:bg-background-hover'
                }`}
              >
                <Download size={20} />
                <span className="font-medium">{t('projectSettings.exportConfig')}</span>
              </button>
              <button
                onClick={() => setActiveTab('global')}
                className={`w-full flex items-center justify-center md:justify-start gap-2 md:gap-3 px-2 md:px-4 py-3 rounded-lg transition-all ${
                  activeTab === 'global'
                    ? 'bg-banana-500 text-white shadow-md'
                    : 'bg-white dark:bg-background-secondary text-gray-700 dark:text-foreground-secondary hover:bg-gray-100 dark:hover:bg-background-hover'
                }`}
              >
                <SettingsIcon size={20} />
                <span className="font-medium">{t('projectSettings.globalConfig')}</span>
              </button>
            </nav>
          </aside>

          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 md:p-6">
            {activeTab === 'project' ? (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground-primary mb-4">{t('projectSettings.projectConfigTitle')}</h3>
                  <p className="text-sm text-gray-600 dark:text-foreground-tertiary mb-6">
                    {t('projectSettings.projectConfigDesc')}
                  </p>
                </div>

                {/* Image Scale */}
                <div className="pb-6 border-b border-gray-200 dark:border-border-primary space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary">{t('projectSettings.aspectRatio')}</h4>
                      <div className="relative group">
                        <button type="button" className="p-1 -m-1 rounded-full focus:outline-none focus:ring-2 focus:ring-banana-500">
                          <HelpCircle size={16} className="text-gray-400 dark:text-foreground-tertiary cursor-help" />
                        </button>
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-10 pointer-events-none">
                          {t('projectSettings.aspectRatioHelp')}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-foreground-tertiary">
                      {hasImages ? t('projectSettings.aspectRatioLocked') : t('projectSettings.aspectRatioDesc')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ASPECT_RATIO_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={hasImages}
                        onClick={() => onAspectRatioChange?.(opt.value)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          aspectRatio === opt.value
                            ? 'border-banana-500 bg-banana-50 dark:bg-background-secondary text-banana-700 dark:text-banana'
                            : 'border-gray-200 dark:border-border-primary text-gray-700 dark:text-foreground-secondary hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-background-secondary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {onSaveAspectRatio && !hasImages && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onSaveAspectRatio}
                      disabled={isSavingAspectRatio}
                      className="w-full sm:w-auto"
                    >
                      {isSavingAspectRatio ? t('shared.saving') : t('common.save')}
                    </Button>
                  )}
                </div>

                <div className="pb-6 border-b border-gray-200 dark:border-border-primary space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary mb-2">{t('projectSettings.extraRequirements')}</h4>
                    <p className="text-sm text-gray-600 dark:text-foreground-tertiary">
                      {t('projectSettings.extraRequirementsDesc')}
                    </p>
                  </div>
                  <Textarea
                    value={extraRequirements}
                    onChange={(e) => onExtraRequirementsChange(e.target.value)}
                    placeholder={t('projectSettings.extraRequirementsPlaceholder')}
                    rows={4}
                    className="text-sm"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onSaveExtraRequirements}
                    disabled={isSavingRequirements}
                    className="w-full sm:w-auto"
                  >
                    {isSavingRequirements ? t('shared.saving') : t('projectSettings.saveExtraRequirements')}
                  </Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary mb-2">{t('projectSettings.styleDescription')}</h4>
                    <p className="text-sm text-gray-600 dark:text-foreground-tertiary">
                      {t('projectSettings.styleDescriptionDesc')}
                    </p>
                  </div>
                  <TextStyleSelector
                    value={templateStyle}
                    onChange={onTemplateStyleChange}
                    sourceContent={sourceContent}
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onSaveTemplateStyle}
                      disabled={isSavingTemplateStyle}
                      className="w-full sm:w-auto"
                    >
                      {isSavingTemplateStyle ? t('shared.saving') : t('projectSettings.saveStyleDescription')}
                    </Button>
                  </div>
                  <div className="pl-4 border-l-4 border-blue-300 dark:border-blue-600">
                    <p className="text-xs text-gray-700 dark:text-foreground-secondary flex items-start gap-1.5">
                      <Lightbulb size={14} className="flex-shrink-0 mt-0.5" />
                      <span><strong>{t('projectSettings.tip')}：</strong>{t('projectSettings.styleTip')}</span>
                    </p>
                  </div>
                </div>
              </div>
            ) : activeTab === 'export' ? (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground-primary mb-4">{t('projectSettings.editablePptxExport')}</h3>
                  <p className="text-sm text-gray-600 dark:text-foreground-tertiary mb-6">
                    {t('projectSettings.editablePptxExportDesc')}
                  </p>
                </div>

                <div className="pb-6 border-b border-gray-200 dark:border-border-primary space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary mb-2">{t('projectSettings.extractorMethod')}</h4>
                    <p className="text-sm text-gray-600 dark:text-foreground-tertiary">
                      {t('projectSettings.extractorMethodDesc')}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {EXTRACTOR_METHOD_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          exportExtractorMethod === option.value
                            ? 'border-banana-500 bg-banana-50 dark:bg-background-secondary'
                            : 'border-gray-200 dark:border-border-primary hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-background-secondary'
                        }`}
                      >
                        <input
                          type="radio"
                          name="extractorMethod"
                          value={option.value}
                          checked={exportExtractorMethod === option.value}
                          onChange={(e) => onExportExtractorMethodChange?.(e.target.value as ExportExtractorMethod)}
                          className="mt-1 w-4 h-4 text-banana-500 focus:ring-banana-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-foreground-primary">{t(option.labelKey)}</div>
                          <div className="text-sm text-gray-600 dark:text-foreground-tertiary mt-1">{t(option.descKey)}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pb-6 border-b border-gray-200 dark:border-border-primary space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary mb-2">{t('projectSettings.backgroundMethod')}</h4>
                    <p className="text-sm text-gray-600 dark:text-foreground-tertiary">
                      {t('projectSettings.backgroundMethodDesc')}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {INPAINT_METHOD_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          exportInpaintMethod === option.value
                            ? 'border-banana-500 bg-banana-50 dark:bg-background-secondary'
                            : 'border-gray-200 dark:border-border-primary hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-background-secondary'
                        }`}
                      >
                        <input
                          type="radio"
                          name="inpaintMethod"
                          value={option.value}
                          checked={exportInpaintMethod === option.value}
                          onChange={(e) => onExportInpaintMethodChange?.(e.target.value as ExportInpaintMethod)}
                          className="mt-1 w-4 h-4 text-banana-500 focus:ring-banana-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-foreground-primary">{t(option.labelKey)}</span>
                            {option.usesAI && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                                <Sparkles size={12} />
                                {t('projectSettings.usesAiModel')}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-foreground-tertiary mt-1">{t(option.descKey)}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="pl-4 border-l-4 border-yellow-300 dark:border-yellow-600 flex items-start gap-2">
                    <AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-700 dark:text-foreground-secondary">
                      <strong>{t('projectSettings.tip')}：</strong>{t('projectSettings.costTip')}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary mb-2">{t('projectSettings.iconSubjectExtraction')}</h4>
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={false}
                      disabled
                      onChange={(e) => onEnableIconSubjectExtractionChange?.(e.target.checked)}
                      className="mt-1 w-4 h-4 text-banana-500 focus:ring-banana-500 rounded"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-foreground-primary">{t('projectSettings.iconSubjectExtraction')}</div>
                      <div className="text-sm text-gray-600 dark:text-foreground-tertiary mt-1">
                        {t('projectSettings.iconSubjectExtractionDesc')}
                      </div>
                    </div>
                  </label>
                  <div className="pl-4 border-l-4 border-yellow-300 dark:border-yellow-600 flex items-start gap-2">
                    <AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-700 dark:text-foreground-secondary">
                      <strong>{t('projectSettings.tip')}：</strong>{t('projectSettings.iconSubjectExtractionTip')}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-foreground-primary mb-2">{t('projectSettings.errorHandling')}</h4>
                    <p className="text-sm text-gray-600 dark:text-foreground-tertiary">
                      {t('projectSettings.errorHandlingDesc')}
                    </p>
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportAllowPartial}
                      onChange={(e) => onExportAllowPartialChange?.(e.target.checked)}
                      className="mt-1 w-4 h-4 text-red-500 focus:ring-red-500 rounded"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-foreground-primary">{t('projectSettings.allowPartialResult')}</div>
                      <div className="text-sm text-gray-600 dark:text-foreground-tertiary mt-1">
                        {t('projectSettings.allowPartialResultDesc')}
                      </div>
                    </div>
                  </label>
                  <div className="pl-4 border-l-4 border-red-300 dark:border-red-600 flex items-start gap-2">
                    <AlertTriangle size={16} className="text-red-700 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-700 dark:text-foreground-secondary">
                      <strong>{t('common.warning')}：</strong>{t('projectSettings.allowPartialResultWarning')}
                    </p>
                  </div>
                </div>

                {onSaveExportSettings && (
                  <div className="flex justify-end pt-4">
                    <Button
                      variant="primary"
                      onClick={onSaveExportSettings}
                      disabled={isSavingExportSettings}
                    >
                      {isSavingExportSettings ? t('shared.saving') : t('projectSettings.saveExportSettings')}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-4xl">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground-primary mb-2">{t('projectSettings.globalConfigTitle')}</h3>
                  <p className="text-sm text-gray-600 dark:text-foreground-tertiary">
                    {t('projectSettings.globalConfigDesc')}
                  </p>
                </div>
                <SettingsPage />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
