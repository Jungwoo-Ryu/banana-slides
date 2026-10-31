import { ReportForm, emptyReport, buildReportPrompt } from '@/components/shared/ReportForm';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, FileText, FileEdit, ImagePlus, Paperclip, Palette, Lightbulb, Search, Settings, FolderOpen, HelpCircle, Sun, Moon, Globe, Monitor, ChevronDown, Upload, RefreshCw, FilePlus, ArrowRight, X } from 'lucide-react';
import { Button, Card, useToast, MaterialGeneratorModal, MaterialCenterModal, MaterialSelector, ReferenceFileList, ReferenceFileSelector, FilePreviewModal, HelpModal, Footer, TextStyleSelector } from '@/components/shared';
import { MarkdownTextarea, type MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';
import { TemplateSelector, getTemplateFile } from '@/components/shared/TemplateSelector';
import { listUserTemplates, type UserTemplate, uploadReferenceFile, type ReferenceFile, associateFileToProject, triggerFileParse, associateMaterialsToProject, createPptRenovationProject } from '@/api/endpoints';
import { useProjectStore } from '@/store/useProjectStore';
import { devLog } from '@/utils/logger';
import { useTheme } from '@/hooks/useTheme';
import { useImagePaste, buildMaterialsMarkdown } from '@/hooks/useImagePaste';
import type { Material } from '@/types';
import { useT } from '@/hooks/useT';
import logoUrl from '@/assets/sola-sun.svg';
import { ASPECT_RATIO_OPTIONS } from '@/config/aspectRatio';
import { isDesktop } from '@/utils';

type CreationType = 'idea' | 'outline' | 'description' | 'ppt_renovation';

// Supports document extensions uploaded as reference files (with backends) file_parser_service Consistency）
const ALLOWED_DOC_EXTENSIONS = ['pdf', 'docx', 'pptx', 'doc', 'ppt', 'xlsx', 'xls', 'csv', 'txt', 'md'];

// Page-specific translation - AI You can see all the files directly, keep the originals. key Structure
const homeI18n = {
  zh: {
    nav: {
      materialGenerate: 'Generate Material', materialCenter: 'Material Center',
      history: 'History', settings: 'Settings', help: 'Help'
    },
    settings: {
      language: { label: 'Interface Language' },
      theme: { label: 'Theme', light: 'Light', dark: 'Dark', system: 'System' }
    },
    home: {
      title: 'Sol.A',
      subtitle: 'Vibe your slides like vibe coding',
      tagline: 'AI-native PPT generator powered by nano banana pro',
      features: {
        oneClick: 'One-click PPT generation',
        naturalEdit: 'Natural language editing',
        regionEdit: 'Region-specific editing',
        export: 'Export to PPTX/PDF',
      },
      tabs: {
        idea: 'From Idea',
        outline: 'From Outline',
        description: 'From Description',
        ppt_renovation: 'PPT Renovation',
      },
      tabDescriptions: {
        idea: 'Enter your idea, AI will generate a complete PPT for you',
        outline: 'Have an outline? Paste it directly, AI will split it into a structured outline',
        description: 'Have detailed descriptions? AI will parse and generate images directly, skipping the outline step',
        ppt_renovation: 'Upload an existing PDF/PPTX file, AI will parse its content and regenerate the renovated PPT',
      },
      placeholders: {
        idea: 'e.g., Generate a presentation about the history of AI',
        outline: 'Paste your PPT outline...',
        description: 'Paste your complete page descriptions...',
      },
      examples: {
        outline: 'Format example:\n\nSlide 1: The Origins of AI\n- 1956 Dartmouth Conference\n- Vision of early researchers\n\nSlide 2: The Rise of Machine Learning\n- From rule-based to data-driven\n- Classic algorithms overview\n\nSlide 3: Future Outlook\n- Trends and challenges\n\nTitles with bullet points, or titles only. AI will split it into a structured outline.',
        description: 'Format example:\n\nSlide 1: The Origins of AI\nIntroduce the birth of AI, starting from the 1956 Dartmouth Conference. Use a left-text right-image layout with a timeline on the left and a retro-style computer illustration on the right.\n\nSlide 2: The Rise of Machine Learning\nExplain the shift from rule-based to data-driven approaches. Dark blue background, algorithm comparison chart in the center, key milestones at the bottom.\n\nEach slide can include content, layout, and visual style. Separate slides with blank lines.',
      },
      template: {
        title: 'Select Style Template',
        useTextStyle: 'Use text description for style',
        multiMode: 'Per-page templates',
        multiModeHint: 'Each page can use a different template; assign them per page on the setup page after creation',
      },
      actions: {
        selectFile: 'Select reference file',
        parsing: 'Parsing...',
        createProject: 'Create New Project',
        startBlank: 'Or start from a blank project',
        startBlankHint: 'Skip outline generation — add or import pages yourself',
      },
      renovation: {
        uploadHint: 'Click or drag to upload PDF / PPTX file',
        formatHint: 'Supports .pdf, .pptx, .ppt formats (PDF recommended)',
        keepLayout: 'Keep original layout',
        onlyPdfPptx: 'Only PDF and PPTX files are supported',
        uploadFile: 'Please upload a PDF or PPTX file first',
      },
      messages: {
        enterContent: 'Please enter content',
        filesParsing: '{{count}} reference file(s) are still parsing, please wait',
        projectCreateFailed: 'Failed to create project',
        multiModeSwitchFailed: 'Failed to switch to per-page templates; please retry inside the project',
        uploadingImage: 'Uploading and recognizing image...',
        imageUploadSuccess: 'Image uploaded! Inserted at cursor position',
        imageUploadFailed: 'Failed to upload image',
        fileUploadSuccess: 'File uploaded successfully',
        fileUploadFailed: 'Failed to upload file',
        fileTooLarge: 'File too large: {{size}}MB, maximum 200MB',
        fileUploadInProgress: 'A file upload is already in progress — please wait for it to finish',
        unsupportedFileType: 'Unsupported file type: {{type}}',
        loadTemplateFailed: 'Failed to load the template. Please select or upload it again',
        pptTip: 'We recommend converting your PPTX to PDF locally before uploading for better compatibility and faster processing',
        filesAdded: 'Added {{count}} reference file(s)',
        imageRemoved: 'Image removed',
        serviceTestTip: 'Test services in Settings first to avoid issues',
        verifying: 'Verifying API configuration...',
        verifyFailed: 'Please configure a valid API Key in Settings and click "Service Test" at the bottom to verify',
      },
    },
  },
  en: {
    nav: {
      materialGenerate: 'Generate Material', materialCenter: 'Material Center',
      history: 'History', settings: 'Settings', help: 'Help'
    },
    settings: {
      language: { label: 'Interface Language' },
      theme: { label: 'Theme', light: 'Light', dark: 'Dark', system: 'System' }
    },
    home: {
      title: 'Sol.A',
      subtitle: 'Vibe your slides like vibe coding',
      tagline: 'AI-native PPT generator powered by nano banana pro',
      features: {
        oneClick: 'One-click PPT generation',
        naturalEdit: 'Natural language editing',
        regionEdit: 'Region-specific editing',
        export: 'Export to PPTX/PDF',
      },
      tabs: {
        idea: 'From Idea',
        outline: 'From Outline',
        description: 'From Description',
        ppt_renovation: 'PPT Renovation',
      },
      tabDescriptions: {
        idea: 'Enter your idea, AI will generate a complete PPT for you',
        outline: 'Have an outline? Paste it directly, AI will split it into a structured outline',
        description: 'Have detailed descriptions? AI will parse and generate images directly, skipping the outline step',
        ppt_renovation: 'Upload an existing PDF/PPTX file, AI will parse its content and regenerate the renovated PPT',
      },
      placeholders: {
        idea: 'e.g., Generate a presentation about the history of AI',
        outline: 'Paste your PPT outline...',
        description: 'Paste your complete page descriptions...',
      },
      examples: {
        outline: 'Format example:\n\nSlide 1: The Origins of AI\n- 1956 Dartmouth Conference\n- Vision of early researchers\n\nSlide 2: The Rise of Machine Learning\n- From rule-based to data-driven\n- Classic algorithms overview\n\nSlide 3: Future Outlook\n- Trends and challenges\n\nTitles with bullet points, or titles only. AI will split it into a structured outline.',
        description: 'Format example:\n\nSlide 1: The Origins of AI\nIntroduce the birth of AI, starting from the 1956 Dartmouth Conference. Use a left-text right-image layout with a timeline on the left and a retro-style computer illustration on the right.\n\nSlide 2: The Rise of Machine Learning\nExplain the shift from rule-based to data-driven approaches. Dark blue background, algorithm comparison chart in the center, key milestones at the bottom.\n\nEach slide can include content, layout, and visual style. Separate slides with blank lines.',
      },
      template: {
        title: 'Select Style Template',
        useTextStyle: 'Use text description for style',
        multiMode: 'Per-page templates',
        multiModeHint: 'Each page can use a different template; assign them per page on the setup page after creation',
      },
      actions: {
        selectFile: 'Select reference file',
        parsing: 'Parsing...',
        createProject: 'Create New Project',
        startBlank: 'Or start from a blank project',
        startBlankHint: 'Skip outline generation — add or import pages yourself',
      },
      renovation: {
        uploadHint: 'Click or drag to upload PDF / PPTX file',
        formatHint: 'Supports .pdf, .pptx, .ppt formats (PDF recommended)',
        keepLayout: 'Keep original layout',
        onlyPdfPptx: 'Only PDF and PPTX files are supported',
        uploadFile: 'Please upload a PDF or PPTX file first',
      },
      messages: {
        enterContent: 'Please enter content',
        filesParsing: '{{count}} reference file(s) are still parsing, please wait',
        projectCreateFailed: 'Failed to create project',
        multiModeSwitchFailed: 'Failed to switch to per-page templates; please retry inside the project',
        uploadingImage: 'Uploading and recognizing image...',
        imageUploadSuccess: 'Image uploaded! Inserted at cursor position',
        imageUploadFailed: 'Failed to upload image',
        fileUploadSuccess: 'File uploaded successfully',
        fileUploadFailed: 'Failed to upload file',
        fileTooLarge: 'File too large: {{size}}MB, maximum 200MB',
        fileUploadInProgress: 'A file upload is already in progress — please wait for it to finish',
        unsupportedFileType: 'Unsupported file type: {{type}}',
        loadTemplateFailed: 'Failed to load the template. Please select or upload it again',
        pptTip: 'We recommend converting your PPTX to PDF locally before uploading for better compatibility and faster processing',
        filesAdded: 'Added {{count}} reference file(s)',
        imageRemoved: 'Image removed',
        serviceTestTip: 'Test services in Settings first to avoid issues',
        verifying: 'Verifying API configuration...',
        verifyFailed: 'Please configure a valid API Key in Settings and click "Service Test" at the bottom to verify',
      },
    },
  },
};

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const t = useT(homeI18n);
  const { theme, isDark, setTheme } = useTheme();
  const { initializeProject, isGlobalLoading, switchTemplateMode } = useProjectStore();
  const { show, ToastContainer } = useToast();

  const [activeTab, setActiveTab] = useState<CreationType>('idea');
  const [multiTemplateMode, setMultiTemplateMode] = useState(false);
  const [freeContent, setFreeContent] = useState('');
  const [reportMode, setReportMode] = useState(false);
  const [reportFields, setReportFields] = useState({ ...emptyReport });
  const [reportPrompt, setReportPrompt] = useState('');
  const [reportEdited, setReportEdited] = useState(false);
  const structured = activeTab === 'idea' && reportMode;
  const content = structured ? reportPrompt : freeContent;
  const setContent = (value: React.SetStateAction<string>) => {
    if (structured) { setReportPrompt(value); setReportEdited(true); }
    else setFreeContent(value);
  };
  const [selectedTemplate, setSelectedTemplate] = useState<File | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedPresetTemplateId, setSelectedPresetTemplateId] = useState<string | null>(null);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isMaterialCenterOpen, setIsMaterialCenterOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFile[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isFileSelectorOpen, setIsFileSelectorOpen] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);

  const [useTemplateStyle, setUseTemplateStyle] = useState(false);
  const [templateStyle, setTemplateStyle] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [isAspectRatioOpen, setIsAspectRatioOpen] = useState(false);
  const [renovationFile, setRenovationFile] = useState<File | null>(null);
  const [keepLayout, setKeepLayout] = useState(false);
  const renovationFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Endurance Draft to sessionStorage，Make sure you don’t lose the contents when you return after skipping the settings
  useEffect(() => {
    if (content) {
      sessionStorage.setItem('home-draft-content', content);
    }
  }, [content]);

  useEffect(() => {
    sessionStorage.setItem('home-draft-tab', activeTab);
  }, [activeTab]);


  // Check for current items & Load user templates
  useEffect(() => {
    const projectId = localStorage.getItem('currentProjectId');
    setCurrentProjectId(projectId);

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
  }, []);

  // First Access AutoEject Help Model
  useEffect(() => {
    const hasSeenHelp = localStorage.getItem('hasSeenHelpModal');
    if (!hasSeenHelp) {
      // Delay 500ms Open, let the page finish first.
      const timer = setTimeout(() => {
        setIsHelpModalOpen(true);
        localStorage.setItem('hasSeenHelpModal', 'true');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'material-generate') {
      setIsMaterialModalOpen(true);
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete('action');
      setSearchParams(nextSearchParams, { replace: true });
    } else if (action === 'material-center') {
      setIsMaterialCenterOpen(true);
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete('action');
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleOpenMaterialModal = () => {
    // Always generate global material on the home page, not associated with any items
    setIsMaterialModalOpen(true);
  };

  const textareaRef = useRef<MarkdownTextareaRef>(null);
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);

  // Callback to insert at cursor position in the textarea
  const insertAtCursor = useCallback((markdown: string) => {
    textareaRef.current?.insertAtCursor(markdown);
  }, []);

  // Unified use of graphic paste hook（Batch support, no warning for non-photo files from below handlePaste Processing documents）
  const { handlePaste: handleImagePaste, handleFiles: handleImageFiles, isUploading: isUploadingImage } = useImagePaste({
    projectId: null,
    setContent,
    showToast: show,
    warnUnsupportedTypes: false,
    insertAtCursor,
  });

  const handleMaterialSelect = useCallback((materials: Material[]) => {
    const markdown = buildMaterialsMarkdown(materials, setContent);
    textareaRef.current?.insertAtCursor(markdown + '\n');
  }, [setContent]);

  // Check paste event. Pictures go. hook，Document takes an independent logic
  const handlePaste = async (e: React.ClipboardEvent<HTMLElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Classification： Pictures vs Documentation vs Not supported
    let hasImages = false;
    const docFiles: File[] = [];
    const unsupportedExts: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (!file) continue;

      if (file.type.startsWith('image/')) {
        hasImages = true;
      } else {
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        if (fileExt && ALLOWED_DOC_EXTENSIONS.includes(fileExt)) {
          docFiles.push(file);
        } else {
          unsupportedExts.push(fileExt || file.type);
        }
      }
    }

    // Give me the picture. hook Processing (volume uploading)）
    if (hasImages) {
      handleImagePaste(e);
    }

    // Upload document files one by one
    if (docFiles.length > 0) {
      if (!hasImages) e.preventDefault();
      for (const file of docFiles) {
        await handleFileUpload(file);
      }
    }

    // Unsupported file type hint
    if (unsupportedExts.length > 0 && !hasImages && docFiles.length === 0) {
      show({ message: t('home.messages.unsupportedFileType', { type: unsupportedExts.join(', ') }), type: 'info' });
    }
  };

  // Upload File
  // Yes. Home page, the file is always uploaded as a global file (unconnected item) because there are no items at this time
  const handleFileUpload = useCallback(async (file: File) => {
    if (isUploadingFile) return;

    // Check file size (frontend pre-check)）
    const maxSize = 200 * 1024 * 1024; // 200MB
    if (file.size > maxSize) {
      show({
        message: t('home.messages.fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }),
        type: 'error'
      });
      return;
    }

    // Check for yes or no. PPT File, hint to use PDF
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (fileExt === 'ppt' || fileExt === 'pptx')
      show({ message: t('home.messages.pptTip'), type: 'info' });

    setIsUploadingFile(true);
    try {
      // Yes. Home Pages, always uploaded as global files
      const response = await uploadReferenceFile(file, null);
      if (response?.data?.file) {
        const uploadedFile = response.data.file;
        setReferenceFiles(prev => [...prev, uploadedFile]);
        show({ message: t('home.messages.fileUploadSuccess'), type: 'success' });

        // If the file state is pending，Auto Trigger Parsing
        if (uploadedFile.parse_status === 'pending') {
          try {
            const parseResponse = await triggerFileParse(uploadedFile.id);
            // Update the file object status returned using the parsing interface
            if (parseResponse?.data?.file) {
              const parsedFile = parseResponse.data.file;
              setReferenceFiles(prev =>
                prev.map(f => f.id === uploadedFile.id ? parsedFile : f)
              );
            } else {
              // If no file object is returned, manually update as parsing（The range will be updated later.）
              setReferenceFiles(prev =>
                prev.map(f => f.id === uploadedFile.id ? { ...f, parse_status: 'parsing' as const } : f)
              );
            }
          } catch (parseError: any) {
            console.error('Trigger file resolution failed:', parseError);
            // Parsing the trigger failure does not affect upload success tips
          }
        }
      } else {
        show({ message: t('home.messages.fileUploadFailed'), type: 'error' });
      }
    } catch (error: any) {
      console.error('File upload failed:', error);

      // Special handling 413 Error
      if (error?.response?.status === 413) {
        show({
          message: t('home.messages.fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }),
          type: 'error'
        });
      } else {
        show({
          message: `${t('home.messages.fileUploadFailed')}: ${error?.response?.data?.error?.message || error.message || ''}`.replace(/: $/, ''),
          type: 'error'
        });
      }
    } finally {
      setIsUploadingFile(false);
    }
  }, [isUploadingFile, show, t]);

  // Drag-in document file： filter by extension and reuse handleFileUpload（Uploading each case+Auto Trigger Parsing）
  const handleDocumentFiles = useCallback(async (files: File[]) => {
    // Uploading already exists to inform users while they are in progress, so that files are not discarded silently（handleFileUpload It’s... isUploadingFile Guards.）
    if (isUploadingFile) {
      show({ message: t('home.messages.fileUploadInProgress'), type: 'info' });
      return;
    }

    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext && ALLOWED_DOC_EXTENSIONS.includes(ext)) {
        accepted.push(file);
      } else {
        rejected.push(ext || file.type || file.name);
      }
    }

    if (rejected.length > 0) {
      // To reextend the name and avoid dragging multiple files of the same type at a time toast It’s long.
      show({
        message: t('home.messages.unsupportedFileType', {
          type: Array.from(new Set(rejected)).join(', '),
        }),
        type: 'info',
      });
    }

    for (const file of accepted) {
      await handleFileUpload(file);
    }
  }, [isUploadingFile, handleFileUpload, show, t]);

  // Remove file references from the current item (do not delete the file itself)）
  const handleFileRemove = (fileId: string) => {
    setReferenceFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Document status changeback
  const handleFileStatusChange = (updatedFile: ReferenceFile) => {
    setReferenceFiles(prev =>
      prev.map(f => f.id === updatedFile.id ? updatedFile : f)
    );
  };

  // Click on the return pin button - Open File Selector
  const handlePaperclipClick = () => {
    setIsFileSelectorOpen(true);
  };

  // Backup from Selector to Select File
  const handleFilesSelected = (selectedFiles: ReferenceFile[]) => {
    // Merge the newly selected files to the list (reweighted)）
    setReferenceFiles(prev => {
      const existingIds = new Set(prev.map(f => f.id));
      const newFiles = selectedFiles.filter(f => !existingIds.has(f.id));
      // Updates the status of a file when it is merged if it already exists (possibly the status of the resolution has changed)）
      const updated = prev.map(f => {
        const updatedFile = selectedFiles.find(sf => sf.id === f.id);
        return updatedFile || f;
      });
      return [...updated, ...newFiles];
    });
    show({ message: t('home.messages.filesAdded', { count: selectedFiles.length }), type: 'success' });
  };

  // Fetch the currently selected file ID List, pass to selector (use useMemo Avoid recalculating every rendering）
  const selectedFileIds = useMemo(() => {
    return referenceFiles.map(f => f.id);
  }, [referenceFiles]);

  // File selection changes
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      await handleFileUpload(files[i]);
    }

    // Clear input，Allow repeated selection of the same file
    e.target.value = '';
  };

  const tabConfig = {
    idea: {
      icon: <Sparkles size={20} />,
      label: t('home.tabs.idea'),
      placeholder: t('home.placeholders.idea'),
      description: t('home.tabDescriptions.idea'),
      example: null as string | null,
    },
    outline: {
      icon: <FileText size={20} />,
      label: t('home.tabs.outline'),
      placeholder: t('home.placeholders.outline'),
      description: t('home.tabDescriptions.outline'),
      example: t('home.examples.outline'),
    },
    description: {
      icon: <FileEdit size={20} />,
      label: t('home.tabs.description'),
      placeholder: t('home.placeholders.description'),
      description: t('home.tabDescriptions.description'),
      example: t('home.examples.description'),
    },
    ppt_renovation: {
      icon: <RefreshCw size={20} />,
      label: t('home.tabs.ppt_renovation'),
      placeholder: '',
      description: t('home.tabDescriptions.ppt_renovation'),
      example: null as string | null,
    },
  };

  const handleTemplateSelect = async (templateFile: File | null, templateId?: string) => {
    // Always set file (if available)）
    if (templateFile) {
      setSelectedTemplate(templateFile);
    }

    // Process Templates ID
    if (templateId) {
      // Whether the user template or the preset template is judged
      // Preset Templates ID Usually. '1', '2', '3' Short Strings
      // User Templates ID It’s usually longer.（UUID Format）
      if (templateId.length <= 3 && /^\d+$/.test(templateId)) {
        // Preset Templates
        setSelectedPresetTemplateId(templateId);
        setSelectedTemplateId(null);
      } else {
        // User Templates
        setSelectedTemplateId(templateId);
        setSelectedPresetTemplateId(null);
      }
    } else {
      // If not templateId，Could be a directly uploaded file.
      // Empty all selections
      setSelectedTemplateId(null);
      setSelectedPresetTemplateId(null);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (structured && !reportFields.topic.trim()) {
      show({ message: i18n.language?.startsWith('zh') ? 'Please complete the subject and continue.' : '주제를 입력하세요', type: 'error' });
      return;
    }
    // For ppt_renovation, validate file instead of content
    if (activeTab === 'ppt_renovation') {
      if (!renovationFile) {
        show({ message: t('home.renovation.uploadFile'), type: 'error' });
        return;
      }
    } else if (!content.trim()) {
      show({ message: t('home.messages.enterContent'), type: 'error' });
      return;
    }

    // Check if there are files in the process of resolution
    const parsingFiles = referenceFiles.filter(f =>
      f.parse_status === 'pending' || f.parse_status === 'parsing'
    );
    if (parsingFiles.length > 0) {
      show({
        message: t('home.messages.filesParsing', { count: parsingFiles.length }),
        type: 'info'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // PPT Refurbishment mode： independent upload+Step Resolution Process
      if (activeTab === 'ppt_renovation' && renovationFile) {
        const styleDesc = templateStyle.trim() ? templateStyle.trim() : undefined;
        const result = await createPptRenovationProject(renovationFile, {
          keepLayout,
          templateStyle: styleDesc,
        });

        const projectId = result.data?.project_id;
        const taskId = result.data?.task_id;
        if (!projectId) {
          show({ message: t('home.messages.projectCreateFailed'), type: 'error' });
          return;
        }

        // Save project ID and task ID for DetailEditor to poll
        localStorage.setItem('currentProjectId', projectId);
        if (taskId) {
          localStorage.setItem('renovationTaskId', taskId);
        }

        // Clear draft
        sessionStorage.removeItem('home-draft-content');
        sessionStorage.removeItem('home-draft-tab');

        // Navigate to detail editor (will poll for task completion with skeleton UI)
        navigate(`/project/${projectId}/detail`);
        return;
      }

      // If there is a template ID But I didn’t. File，Load on demand
      let templateFile = selectedTemplate;
      if (!templateFile && (selectedTemplateId || selectedPresetTemplateId)) {
        const templateId = selectedTemplateId || selectedPresetTemplateId;
        if (templateId) {
          templateFile = await getTemplateFile(templateId, userTemplates);
          if (!templateFile) {
            show({ message: t('home.messages.loadTemplateFailed'), type: 'error' });
            return;
          }
        }
      }

      // Pass style description (transmit as long as you have content, regardless of switch status)）
      const styleDesc = templateStyle.trim() ? templateStyle.trim() : undefined;

      // Transmission of reference documents ID List, make sure AI Read reference file contents when generating
      const refFileIds = referenceFiles
        .filter(f => f.parse_status === 'completed')
        .map(f => f.id);

      await initializeProject(activeTab as 'idea' | 'outline' | 'description', content, templateFile || undefined, styleDesc, refFileIds.length > 0 ? refFileIds : undefined, aspectRatio);

      // Jump to different pages according to type
      const projectId = localStorage.getItem('currentProjectId');
      if (!projectId) {
        show({ message: t('home.messages.projectCreateFailed'), type: 'error' });
        return;
      }

      // Single template per page： project default single，Cut after creation multi（Page-level template specified on the template configuration page）
      if (multiTemplateMode) {
        try {
          await switchTemplateMode(projectId, { mode: 'multi' });
        } catch (error) {
          console.error('Failed to switch to multi-template mode:', error);
          show({ message: t('home.messages.multiModeSwitchFailed'), type: 'error' });
        }
      }

      // Association does not complete the resolution reference document (in progress) initializeProject Association）
      if (referenceFiles.length > 0) {
        const unassociatedFiles = referenceFiles.filter(f => f.parse_status !== 'completed');
        if (unassociatedFiles.length > 0) {
          devLog(`Associating ${unassociatedFiles.length} remaining reference files to project ${projectId}:`, unassociatedFiles);
          try {
            await Promise.all(
              unassociatedFiles.map(async file => {
                const response = await associateFileToProject(file.id, projectId);
                return response;
              })
            );
          } catch (error) {
            console.error('Failed to associate reference files:', error);
          }
        }
      }

      // Association Image assets To Item (Parse) content Medium markdown Picture Link）
      const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      const materialUrls: string[] = [];
      let match;
      while ((match = imageRegex.exec(content)) !== null) {
        materialUrls.push(match[2]); // match[2] Yes. URL
      }

      if (materialUrls.length > 0) {
        devLog(`Associating ${materialUrls.length} materials to project ${projectId}:`, materialUrls);
        try {
          const response = await associateMaterialsToProject(projectId, materialUrls);
          devLog('Materials associated successfully:', response);
        } catch (error) {
          console.error('Failed to associate materials:', error);
          // Do not affect the main process. Continue.
        }
      } else {
        devLog('No materials to associate');
      }

      navigate(`/project/${projectId}/outline`);
    } catch (error: any) {
      console.error('Failed to create project:', error);
      const msg = error?.response?.data?.error?.message || error?.message || t('home.messages.projectCreateFailed');
      show({ message: msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create blank items： no outline generation, go straight to outline page to add manually/Import Page
  const handleCreateBlank = async () => {
    setIsSubmitting(true);
    try {
      const styleDesc = templateStyle.trim() ? templateStyle.trim() : undefined;
      await initializeProject('blank', '', selectedTemplate || undefined, styleDesc, undefined, aspectRatio);

      const projectId = localStorage.getItem('currentProjectId');
      if (!projectId) {
        show({ message: t('home.messages.projectCreateFailed'), type: 'error' });
        return;
      }

      if (multiTemplateMode) {
        try {
          await switchTemplateMode(projectId, { mode: 'multi' });
        } catch (error) {
          console.error('Failed to switch to multi-template mode:', error);
          show({ message: t('home.messages.multiModeSwitchFailed'), type: 'error' });
        }
      }

      navigate(`/project/${projectId}/outline`);
    } catch (error: any) {
      console.error('Failed to create blank item:', error);
      const msg = error?.response?.data?.error?.message || error?.message || t('home.messages.projectCreateFailed');
      show({ message: msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50/30 to-pink-50/50 dark:from-background-primary dark:via-background-primary dark:to-background-primary relative overflow-hidden">
      {/* Background Decoration Elements - Show only in bright color mode */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none dark:hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-banana-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-yellow-400/5 rounded-full blur-3xl"></div>
      </div>

      {/* Navigation Bar — web only */}
      {!isDesktop && (
      <nav className="relative z-50 h-16 md:h-18 bg-white/40 dark:bg-background-primary backdrop-blur-2xl dark:backdrop-blur-none dark:border-b dark:border-border-primary">

        <div className="max-w-7xl mx-auto px-4 md:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              <img
                src={logoUrl}
                alt="Sol.A Sol.A Logo"
                className="h-10 md:h-12 w-auto rounded-lg object-contain"
              />
            </div>
            <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-banana-600 via-orange-500 to-pink-500 bg-clip-text text-transparent">
              Sol.A
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {/* Desktopend： Text-based material generation button */}
            <Button
              variant="ghost"
              size="sm"
              icon={<ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={handleOpenMaterialModal}
              className="hidden sm:inline-flex hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium"
            >
              <span className="hidden md:inline">{t('nav.materialGenerate')}</span>
            </Button>
            {/* Cellend： Icon-only material generation button */}
            <Button
              variant="ghost"
              size="sm"
              icon={<ImagePlus size={16} />}
              onClick={handleOpenMaterialModal}
              className="sm:hidden hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200"
              title={t('nav.materialGenerate')}
            />
            {/* Desktopend： A text-based material center button */}
            <Button
              variant="ghost"
              size="sm"
              icon={<FolderOpen size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => setIsMaterialCenterOpen(true)}
              className="hidden sm:inline-flex hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium"
            >
              <span className="hidden md:inline">{t('nav.materialCenter')}</span>
            </Button>
            {/* Cell： Icon-only material centre button */}
            <Button
              variant="ghost"
              size="sm"
              icon={<FolderOpen size={16} />}
              onClick={() => setIsMaterialCenterOpen(true)}
              className="sm:hidden hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200"
              title={t('nav.materialCenter')}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/history')}
              className="text-xs md:text-sm hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium"
            >
              <span className="hidden sm:inline">{t('nav.history')}</span>
              <span className="sm:hidden">{t('nav.history')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Settings size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => navigate('/settings')}
              className="text-xs md:text-sm hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium"
            >
              <span className="hidden md:inline">{t('nav.settings')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsHelpModalOpen(true)}
              className="hidden md:inline-flex hover:bg-banana-50/50"
            >
              {t('nav.help')}
            </Button>
            {/* Move-side help button */}
            <Button
              variant="ghost"
              size="sm"
              icon={<HelpCircle size={16} />}
              onClick={() => setIsHelpModalOpen(true)}
              className="md:hidden hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200"
              title={t('nav.help')}
            />
            {/* Separator */}
            <div className="h-5 w-px bg-gray-300 dark:bg-border-primary mx-1" />
            {/* Language Switch button */}
            <button
              onClick={() => i18n.changeLanguage('ko')}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-gray-100 hover:bg-banana-100/60 dark:hover:bg-background-hover rounded-md transition-all"
              title={t('settings.language.label')}
            >
              <Globe size={14} />
              <span>한국어</span>
            </button>
            {/* Theme Switch button */}
            <div className="relative" ref={themeMenuRef}>
              <button
                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                className="flex items-center gap-1 p-1.5 text-gray-600 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-gray-100 hover:bg-banana-100/60 dark:hover:bg-background-hover rounded-md transition-all"
                title={t('settings.theme.label')}
              >
                {theme === 'system' ? <Monitor size={16} /> : isDark ? <Moon size={16} /> : <Sun size={16} />}
                <ChevronDown size={12} className={`transition-transform ${isThemeMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {/* Theme Downshow Menu */}
              {isThemeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsThemeMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-background-secondary border border-gray-200 dark:border-border-primary rounded-lg shadow-lg dark:shadow-none py-1 min-w-[120px]">
                    <button
                      onClick={() => { setTheme('light'); setIsThemeMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-background-hover transition-colors ${theme === 'light' ? 'text-banana' : 'text-gray-700 dark:text-foreground-secondary'}`}
                    >
                      <Sun size={14} />
                      <span>{t('settings.theme.light')}</span>
                    </button>
                    <button
                      onClick={() => { setTheme('dark'); setIsThemeMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-background-hover transition-colors ${theme === 'dark' ? 'text-banana' : 'text-gray-700 dark:text-foreground-secondary'}`}
                    >
                      <Moon size={14} />
                      <span>{t('settings.theme.dark')}</span>
                    </button>
                    <button
                      onClick={() => { setTheme('system'); setIsThemeMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-background-hover transition-colors ${theme === 'system' ? 'text-banana' : 'text-gray-700 dark:text-foreground-secondary'}`}
                    >
                      <Monitor size={14} />
                      <span>{t('settings.theme.system')}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            {/* Separator */}
            <div className="h-5 w-px bg-gray-300 dark:bg-border-primary mx-1" />
            {/* GitHub Warehouse Cards */}

            {/* Separator */}
          </div>
        </div>
      </nav>
      )}

      {/* Main content */}
      <main className="relative max-w-5xl mx-auto px-3 md:px-4 py-8 md:py-12">
        {/* Hero Title Area */}
        <div className="text-center mb-10 md:mb-16 space-y-4 md:space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-background-secondary backdrop-blur-sm rounded-full shadow-sm dark:shadow-none mb-4">
            <span className="text-2xl animate-pulse"><Sparkles size={20} className="text-orange-500 dark:text-banana" /></span>
            <span className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">{t('home.tagline')}</span>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight">
            <span className="bg-gradient-to-r from-yellow-600 via-orange-500 to-pink-500 dark:from-banana-dark dark:via-banana dark:to-banana-light bg-clip-text text-transparent dark:italic" style={{
              backgroundSize: '200% auto',
              animation: 'gradient 3s ease infinite',
            }}>
              {i18n.language?.startsWith('zh') ? `${t('home.title')} · Sol.A` : 'Sol.A'}
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-600 dark:text-foreground-secondary max-w-2xl mx-auto font-light">
            {t('home.subtitle')}
          </p>

          {/* Feature Label */}
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 pt-4">
            {[
              { icon: <Sparkles size={14} className="text-yellow-600 dark:text-banana" />, label: t('home.features.oneClick') },
              { icon: <FileEdit size={14} className="text-blue-500 dark:text-blue-400" />, label: t('home.features.naturalEdit') },
              { icon: <Search size={14} className="text-orange-500 dark:text-orange-400" />, label: t('home.features.regionEdit') },

              { icon: <Paperclip size={14} className="text-green-600 dark:text-green-400" />, label: t('home.features.export') },
            ].map((feature, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/70 dark:bg-background-secondary backdrop-blur-sm rounded-full text-xs md:text-sm text-gray-700 dark:text-foreground-secondary border border-gray-200/50 dark:border-border-primary shadow-sm dark:shadow-none hover:shadow-md dark:hover:border-border-hover transition-all hover:scale-105 cursor-default"
              >
                {feature.icon}
                {feature.label}
              </span>
            ))}
          </div>
        </div>

        {/* Create card */}
        <Card className="p-4 md:p-10 bg-white/90 dark:bg-background-secondary backdrop-blur-xl dark:backdrop-blur-none shadow-2xl dark:shadow-none border-0 dark:border dark:border-border-primary hover:shadow-3xl dark:hover:shadow-none transition-all duration-300 dark:rounded-2xl">
          {/* tab */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-6 md:mb-8">
            {(Object.keys(tabConfig) as CreationType[]).map((type) => {
              const config = tabConfig[type];
              return (
                <button
                  key={type}
                  onClick={() => setActiveTab(type)}
                  className={`flex-1 flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-6 py-2.5 md:py-3 rounded-lg dark:rounded-xl font-medium transition-all text-sm md:text-base touch-manipulation ${
                    activeTab === type
                      ? 'bg-gradient-to-r from-banana-500 to-banana-600 dark:from-banana dark:to-banana text-black shadow-yellow dark:shadow-lg dark:shadow-banana/20'
                      : 'bg-white dark:bg-background-elevated border border-gray-200 dark:border-border-primary text-gray-700 dark:text-foreground-secondary hover:bg-banana-50 dark:hover:bg-background-hover active:bg-banana-100'
                  }`}
                >
                  <span className="scale-90 md:scale-100">{config.icon}</span>
                  <span className="truncate">{config.label}</span>
                </button>
              );
            })}
          </div>

          {/* Description */}
          <div className="relative">
            <p className="text-sm md:text-base mb-4 md:mb-6 leading-relaxed">
              <span className="inline-flex items-center gap-2 text-gray-600 dark:text-foreground-tertiary">
                <Lightbulb size={16} className="text-banana-600 dark:text-banana flex-shrink-0" />
                <span className="font-semibold">
                  {tabConfig[activeTab].description}
                </span>
                {tabConfig[activeTab].example && (
                  <span className="relative group/tip inline-flex">
                    <HelpCircle size={15} className="text-gray-400 dark:text-foreground-tertiary hover:text-banana-600 dark:hover:text-banana cursor-help transition-colors" />
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover/tip:block z-50 w-72 md:w-80 p-3 bg-white dark:bg-background-elevated border border-gray-200 dark:border-border-primary rounded-lg shadow-xl dark:shadow-none text-xs text-gray-700 dark:text-foreground-secondary whitespace-pre-line leading-relaxed">
                      {tabConfig[activeTab].example}
                      <span className="absolute left-1/2 -translate-x-1/2 top-full -mt-px w-2 h-2 bg-white dark:bg-background-elevated border-r border-b border-gray-200 dark:border-border-primary rotate-45" />
                    </span>
                  </span>
                )}
              </span>
            </p>
          </div>

          {/* Input Area - With Toolbars */}
          <div className="mb-2">
            {activeTab === 'ppt_renovation' ? (
              /* PPT Refurbishment： document upload area */
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed border-gray-300 dark:border-border-primary rounded-xl p-8 text-center cursor-pointer hover:border-banana-400 dark:hover:border-banana transition-colors duration-200"
                  onClick={() => renovationFileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files[0];
                    if (file && (file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.pptx') || file.name.toLowerCase().endsWith('.ppt'))) {
                      setRenovationFile(file);
                      const ext = file.name.split('.').pop()?.toLowerCase();
                      if (ext === 'ppt' || ext === 'pptx') {
                        show({ message: t('home.messages.pptTip'), type: 'info' });
                      }
                    } else {
                      show({ message: t('home.renovation.onlyPdfPptx'), type: 'error' });
                    }
                  }}
                >
                  {renovationFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileText size={24} className="text-banana-600 dark:text-banana" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{renovationFile.name}</p>
                        <p className="text-xs text-gray-500 dark:text-foreground-tertiary">{(renovationFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setRenovationFile(null); }}
                        className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload size={32} className="mx-auto text-gray-400 dark:text-foreground-tertiary" />
                      <p className="text-sm text-gray-600 dark:text-foreground-secondary">{t('home.renovation.uploadHint')}</p>
                      <p className="text-xs text-gray-400 dark:text-foreground-tertiary">{t('home.renovation.formatHint')}</p>
                    </div>
                  )}
                </div>
                <input
                  ref={renovationFileInputRef}
                  type="file"
                  accept=".pdf,.pptx,.ppt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setRenovationFile(file);
                      const ext = file.name.split('.').pop()?.toLowerCase();
                      if (ext === 'ppt' || ext === 'pptx') {
                        show({ message: t('home.messages.pptTip'), type: 'info' });
                      }
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                {/* Keep Layout toggle */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <span className="text-sm text-gray-600 dark:text-foreground-tertiary group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                      {t('home.renovation.keepLayout')}
                    </span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={keepLayout}
                        onChange={(e) => setKeepLayout(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-background-hover peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-banana-300 dark:peer-focus:ring-banana/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white dark:after:bg-foreground-secondary after:border-gray-300 dark:after:border-border-hover after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-banana"></div>
                    </div>
                  </label>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    loading={isSubmitting || isGlobalLoading}
                    disabled={!renovationFile}
                    className="shadow-sm dark:shadow-background-primary/30 text-xs md:text-sm px-3 md:px-4"
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            ) : (
            <>
            {activeTab === 'idea' && <div className="flex gap-2 mb-4">
              {[false, true].map(report => <button type="button" key={String(report)} aria-pressed={reportMode === report}
                disabled={isSubmitting || isGlobalLoading} onClick={() => setReportMode(report)}
                className={`px-3 py-2 rounded-lg text-sm ${reportMode === report ? 'bg-banana-100 text-gray-900' : 'text-gray-500'}`}>
                {report ? (i18n.language?.startsWith('zh') ? 'Daily debriefing' : '보고서 작성') : (i18n.language?.startsWith('zh') ? 'Free input' : '자유 입력')}
              </button>)}
            </div>}
            {structured && <ReportForm fields={reportFields} zh={!!i18n.language?.startsWith('zh')} disabled={isSubmitting || isGlobalLoading}
              onChange={fields => { setReportFields(fields); if (!reportEdited) setReportPrompt(buildReportPrompt(fields, !!i18n.language?.startsWith('zh'))); }}
              onRebuild={() => { setReportEdited(false); setReportPrompt(buildReportPrompt(reportFields, !!i18n.language?.startsWith('zh'))); }} />}
            <MarkdownTextarea
              ref={textareaRef}
              placeholder={tabConfig[activeTab].placeholder}
              value={content}
              onChange={setContent}
              onPaste={handlePaste}
              onFiles={handleImageFiles}
              onDocumentFiles={handleDocumentFiles}
              onSelectFromLibrary={() => setIsMaterialSelectorOpen(true)}
              rows={activeTab === 'idea' ? 4 : 8}
              className="text-sm md:text-base border-2 border-gray-200 dark:border-border-primary dark:bg-background-tertiary dark:text-white focus-within:border-banana-400 dark:focus-within:border-banana transition-colors duration-200"
              toolbarLeft={
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePaperclipClick}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-foreground-tertiary dark:hover:text-foreground-secondary dark:hover:bg-background-hover rounded transition-colors active:scale-95 touch-manipulation"
                    title={t('home.actions.selectFile')}
                  >
                    <Paperclip size={18} />
                  </button>
                  {/* Image Scale Selection */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsAspectRatioOpen(!isAspectRatioOpen)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-foreground-tertiary dark:hover:text-foreground-secondary dark:hover:bg-background-hover rounded transition-colors"
                      title={"화면 비율"}
                    >
                      <span>{aspectRatio}</span>
                      <ChevronDown size={12} className={`transition-transform ${isAspectRatioOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isAspectRatioOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsAspectRatioOpen(false)} />
                        <div className="absolute left-0 bottom-full mb-1 z-50 bg-white dark:bg-background-elevated border border-gray-200 dark:border-border-primary rounded-lg shadow-lg dark:shadow-none py-1 min-w-[80px]">
                          {ASPECT_RATIO_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => { setAspectRatio(opt.value); setIsAspectRatioOpen(false); }}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-background-hover transition-colors ${aspectRatio === opt.value ? 'text-banana font-semibold' : 'text-gray-700 dark:text-foreground-secondary'}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              }
              toolbarRight={
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  loading={isSubmitting || isGlobalLoading}
                  disabled={
                    !content.trim() || (structured && !reportFields.topic.trim()) ||
                    isUploadingImage ||
                    referenceFiles.some(f => f.parse_status === 'pending' || f.parse_status === 'parsing')
                  }
                  className="shadow-sm dark:shadow-background-primary/30 text-xs md:text-sm px-3 md:px-4"
                >
                  {referenceFiles.some(f => f.parse_status === 'pending' || f.parse_status === 'parsing')
                    ? t('home.actions.parsing')
                    : t('common.next')}
                </Button>
              }
            />
            </>
            )}
          </div>

          {/* Blank project entry： Skip AI Generate, add manually directly to the outline page/Import */}
          <div className="flex justify-center mb-4">
            <button
              type="button"
              onClick={handleCreateBlank}
              disabled={isSubmitting || isGlobalLoading}
              title={t('home.actions.startBlankHint')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm text-gray-500 dark:text-foreground-tertiary hover:text-banana-600 dark:hover:text-banana hover:bg-banana-50 dark:hover:bg-background-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
            >
              <FilePlus size={14} className="flex-shrink-0" />
              <span>{t('home.actions.startBlank')}</span>
              <ArrowRight size={14} className="flex-shrink-0" />
            </button>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md"
            onChange={handleFileSelect}
            className="hidden"
          />

          <ReferenceFileList
            files={referenceFiles}
            onFileClick={setPreviewFileId}
            onFileDelete={handleFileRemove}
            onFileStatusChange={handleFileStatusChange}
            deleteMode="remove"
            className="mb-4"
            showToast={show}
          />

          {/* Template Selection */}
          <div className="mb-6 md:mb-8 pt-4 border-t border-gray-100 dark:border-border-primary">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="flex items-center gap-2">
                <Palette size={18} className="text-orange-600 dark:text-banana flex-shrink-0" />
                <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">
                  {t('home.template.title')}
                </h3>
              </div>
              {/* No template chart mode switch */}
              <label className="flex items-center gap-2 cursor-pointer group">
                <span className="text-sm text-gray-600 dark:text-foreground-tertiary group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  {t('home.template.useTextStyle')}
                </span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={useTemplateStyle}
                    onChange={(e) => {
                      setUseTemplateStyle(e.target.checked);
                      // Empty template selection when switching to no template pattern
                      if (e.target.checked) {
                        setSelectedTemplate(null);
                        setSelectedTemplateId(null);
                        setSelectedPresetTemplateId(null);
                      }
                      // Do not empty the style description anymore, allowing the user to keep the entered content
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-background-hover peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-banana-300 dark:peer-focus:ring-banana/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white dark:after:bg-foreground-secondary after:border-gray-300 dark:after:border-border-hover after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-banana"></div>
                </div>
              </label>
            </div>

            {/* A separate template switch per page */}
            <label className="flex items-center gap-2 cursor-pointer group mb-3" title={t('home.template.multiModeHint')}>
              <input
                type="checkbox"
                checked={multiTemplateMode}
                onChange={(e) => setMultiTemplateMode(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-banana-500 focus:ring-banana-400"
              />
              <span className="text-sm text-gray-600 dark:text-foreground-tertiary group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                {t('home.template.multiMode')}
              </span>
              <span className="text-xs text-gray-400">{t('home.template.multiModeHint')}</span>
            </label>

            {/* Show different content according to mode */}
            {useTemplateStyle ? (
              <TextStyleSelector
                value={templateStyle}
                onChange={setTemplateStyle}
                onToast={show}
                sourceContent={content}
              />
            ) : (
              <TemplateSelector
                onSelect={handleTemplateSelect}
                selectedTemplateId={selectedTemplateId}
                selectedPresetTemplateId={selectedPresetTemplateId}
                showUpload={true} // Save template uploaded on home page to user template library
                projectId={currentProjectId}
              />
            )}
          </div>

        </Card>
      </main>
      <ToastContainer />
      {/* The material produces the pattern. - Always generate global material on the home page */}
      <MaterialGeneratorModal
        projectId={null}
        isOpen={isMaterialModalOpen}
        onClose={() => setIsMaterialModalOpen(false)}
      />
      {/* The material center pattern. */}
      <MaterialCenterModal
        isOpen={isMaterialCenterOpen}
        onClose={() => setIsMaterialCenterOpen(false)}
      />
      {/* Select Insert From Library to Text Box */}
      <MaterialSelector
        isOpen={isMaterialSelectorOpen}
        onClose={() => setIsMaterialSelectorOpen(false)}
        onSelect={handleMaterialSelect}
        multiple
      />
      {/* Reference File Selector */}
      {/* Yes. Home Page, always query global files, as there are no items at this time */}
      <ReferenceFileSelector
        projectId={null}
        isOpen={isFileSelectorOpen}
        onClose={() => setIsFileSelectorOpen(false)}
        onSelect={handleFilesSelected}
        multiple={true}
        initialSelectedIds={selectedFileIds}
      />

      <FilePreviewModal fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
      {/* Help mode frame */}
      <HelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />
      {/* Footer */}
      <Footer />
    </div>
  );
};
