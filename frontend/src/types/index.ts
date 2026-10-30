// Page Status
export type PageStatus = 'DRAFT' | 'GENERATING_DESCRIPTION' | 'DESCRIPTION_GENERATED' | 'QUEUED' | 'GENERATING' | 'COMPLETED' | 'FAILED';

// Project Status
export type ProjectStatus = 'DRAFT' | 'OUTLINE_GENERATED' | 'DESCRIPTIONS_GENERATED' | 'COMPLETED';

// Outline
export interface OutlineContent {
  title: string;
  points: string[];
}

// Description - Supports two formats： the backend may return pure text or structured content
export type DescriptionContent =
  | {
      // Format 1: Pure text format for backends
      text: string;
      extra_fields?: Record<string, string>;
      layout_suggestion?: string; // Backward compatibility
    }
  | {
      // Format 2: Structured format in type definitions
      title: string;
      text_content: string[];
      extra_fields?: Record<string, string>;
      layout_suggestion?: string; // Backward compatibility
    };

// Photo Version
export interface ImageVersion {
  version_id: string;
  page_id: string;
  image_path: string;
  image_url?: string;
  version_number: number;
  is_current: boolean;
  created_at?: string;
}

// Template Mode
export type TemplateMode = 'single' | 'multi';

// Template Selection Source
export type TemplateSelectionSource = 'manual' | 'auto' | 'batch_apply';

// Template Asset Parsing State
export type TemplateAnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Template Parsing Area (text)/Image）
export interface TemplateRegion {
  name: string;
  position: string;
  size: string;
}

// Template Parsing Results（PRD §5.3 Nine Fields schema）
export interface TemplateAnalysis {
  template_role: string;
  layout_structure: string;
  content_capacity: 'low' | 'medium' | 'high';
  text_regions: TemplateRegion[];
  image_regions: TemplateRegion[];
  visual_density: 'low' | 'medium' | 'high';
  style_keywords: string[];
  color_palette: string[];
  notes: string;
}

// A template asset in the project template library
export interface TemplateAsset {
  id: string;
  image_url: string;
  thumb_url: string | null;
  analysis_status: TemplateAnalysisStatus;
  analysis_json: TemplateAnalysis | null;
  analysis_notes: string | null;
  analysis_error: string | null;
  user_label: string | null;
  user_edited_analysis: boolean;
  source: 'upload' | 'pdf_split' | 'system_preset';
  sort_order: number;
  referenced_page_ids?: string[];
}

// Page
export interface Page {
  page_id: string;  // Backend Backend page_id
  id?: string;      // Alias used at the frontend
  order_index: number;
  part?: string; // Chapter Name
  outline_content: OutlineContent | null;
  description_content?: DescriptionContent;
  narration_text?: string; // TTS Narrative Text
  generated_image_url?: string; // Backend Backend generated_image_url
  generated_image_path?: string; // Alias used at the frontend
  status: PageStatus;
  created_at?: string;
  updated_at?: string;
  image_versions?: ImageVersion[]; // Historical version list
  // Page-level template（per-page template）
  template_asset_id?: string | null;
  template_style_text?: string | null;
  template_selection_source?: TemplateSelectionSource | null;
  template_match_reason?: string | null;
  template_match_confidence?: number | null;
}

export interface NarrationConfig {
  speaker_persona: string;
  target_audience: string;
  speech_tone: string;
  presentation_topic: string;
  min_words: number;
  max_words: number;
}

// Export Settings - Component extraction method
export type ExportExtractorMethod = 'configured' | 'mineru' | 'hybrid';

// Export Settings - How to get background maps
export type ExportInpaintMethod = 'local' | 'generative' | 'baidu' | 'hybrid';

// Item
export interface Project {
  project_id: string;  // Backend Backend project_id
  id?: string;         // Alias used at the frontend
  project_title?: string;
  idea_prompt: string;
  outline_text?: string;  // Outline text entered by the user (for outline Type）
  description_text?: string;  // Description text entered by user (used for description Type）
  extra_requirements?: string; // Extra requirements, applied to each page AI Phrasing
  outline_requirements?: string; // Outline generation requirements
  description_requirements?: string; // Page Description Generation Requirements
  creation_type?: string;
  template_image_url?: string; // Backend Backend template_image_url
  template_image_path?: string; // Alias used at the frontend
  template_style?: string; // Style description text (no template pattern)）
  template_mode?: TemplateMode; // Harmonization/A separate template for each page（UI hint，Always a template for every page at the bottom）
  // Export Settings
  export_extractor_method?: ExportExtractorMethod; // Component extraction method
  export_inpaint_method?: ExportInpaintMethod; // How to get background maps
  export_allow_partial?: boolean; // Whether to allow the return of semi-finished products (continue rather than stop when an error occurs)）
  enable_icon_subject_extraction?: boolean; // Whether to walk a 100-degree smart map of a small size icon (transparent background)）
  image_aspect_ratio?: string; // Image scale (e.g. 16:9, 4:3）
  status: ProjectStatus;
  pages: Page[];
  created_at: string;
  updated_at: string;
}

/**
 * Materials Information
 */
export interface Material {
  id: string;
  project_id?: string | null;
  filename: string;
  url: string;
  relative_path: string;
  created_at: string;
  updated_at: string;
  prompt?: string;
  original_filename?: string | null;
  source_filename?: string;
  name?: string;
  caption?: string | null;
}

// Task Status
export type TaskStatus = 'PENDING' | 'RUNNING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// Task Information
export interface Task {
  task_id: string;
  id?: string; // Alias
  task_type?: string;
  status: TaskStatus;
  progress?: {
    total: number;
    completed: number;
    failed?: number;
    [key: string]: any; // Allow additional fields, e. g. material_id, image_url Wait.
  };
  error_message?: string;
  result?: any;
  error?: string; // Alias
  created_at?: string;
  completed_at?: string;
}

// Request to create a project
export interface CreateProjectRequest {
  creation_type?: 'idea' | 'outline' | 'descriptions' | 'blank';
  idea_prompt?: string;
  outline_text?: string;
  description_text?: string;
  template_image?: File;
  template_style?: string;
  image_aspect_ratio?: string;
}

// API Response
export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  task_id?: string;
  message?: string;
  error?: string;
}

// Settings
export interface Settings {
  id: number;
  ai_provider_format: string;
  api_base_url?: string;
  image_resolution: string;
  image_quality?: string;
  image_aspect_ratio: string;
  max_description_workers: number;
  max_image_workers: number;
  text_model?: string;
  image_model?: string;
  mineru_api_base?: string;
  image_caption_model?: string;
  output_language: 'ko' | 'en' | 'auto';
  // Description of generation mode
  description_generation_mode: 'streaming' | 'parallel';
  // Description of extra fields
  description_extra_fields?: string[];
  image_prompt_extra_fields?: string[];
  // Reasoning settings (separate text and image controls）
  enable_text_reasoning: boolean;
  text_max_output_tokens: number;
  text_thinking_budget: number;
  enable_image_reasoning: boolean;
  image_thinking_budget: number;
  enable_image_quality_control: boolean;
  // LazyLLM Configuration
  text_model_source?: string;
  image_model_source?: string;
  image_caption_model_source?: string;
  // Per-model API credentials (for gemini/openai per-model overrides)
  text_api_base_url?: string;
  image_api_base_url?: string;
  image_caption_api_base_url?: string;
  // OpenAI image API protocol
  openai_image_api_protocol?: string;
  // OpenAI Codex OAuth
  // ElevenLabs TTS
  elevenlabs_enabled: boolean;
  elevenlabs_api_key_length: number;
  elevenlabs_voice_id?: string;
  created_at?: string;
  updated_at?: string;
}
