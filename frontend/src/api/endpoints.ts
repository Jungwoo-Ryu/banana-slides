import { apiClient, getBaseURL } from './client';
import type { Project, Task, ApiResponse, CreateProjectRequest, Page, Material, TemplateAsset } from '@/types';
import type { Settings } from '../types/index';

export type { Material };

// ===== Access password API =====

export const checkAccessCode = async (): Promise<ApiResponse<{ enabled: boolean }>> => {
  const response = await apiClient.get<ApiResponse<{ enabled: boolean }>>('/api/access-code/check');
  return response.data;
};

export const verifyAccessCode = async (code: string): Promise<ApiResponse<{ valid: boolean }>> => {
  const response = await apiClient.post<ApiResponse<{ valid: boolean }>>('/api/access-code/verify', { code });
  return response.data;
};

// ===== Project-related API =====

/**
 * Create Item
 */
export const createProject = async (data: CreateProjectRequest): Promise<ApiResponse<Project>> => {
  // Prefer to visible inbound creation_type（The blank item does not contain any text and cannot be inferred）
  let creation_type: string = data.creation_type ?? 'idea';
  if (!data.creation_type) {
    if (data.description_text) {
      creation_type = 'descriptions';
    } else if (data.outline_text) {
      creation_type = 'outline';
    }
  }

  const response = await apiClient.post<ApiResponse<Project>>('/api/projects', {
    creation_type,
    idea_prompt: data.idea_prompt,
    outline_text: data.outline_text,
    description_text: data.description_text,
    template_style: data.template_style,
    image_aspect_ratio: data.image_aspect_ratio,
  });
  return response.data;
};

/**
 * Upload Template Pictures
 */
export const uploadTemplate = async (
  projectId: string,
  templateImage: File
): Promise<ApiResponse<{ template_image_url: string }>> => {
  const formData = new FormData();
  formData.append('template_image', templateImage);

  const response = await apiClient.post<ApiResponse<{ template_image_url: string }>>(
    `/api/projects/${projectId}/template`,
    formData
  );
  return response.data;
};

/**
 * Retrieving list of items (historical items)）
 */
export const listProjects = async (limit?: number, offset?: number): Promise<ApiResponse<{ projects: Project[]; total: number }>> => {
  const params = new URLSearchParams();
  if (limit !== undefined) params.append('limit', limit.toString());
  if (offset !== undefined) params.append('offset', offset.toString());

  const queryString = params.toString();
  const url = `/api/projects${queryString ? `?${queryString}` : ''}`;
  const response = await apiClient.get<ApiResponse<{ projects: Project[]; total: number }>>(url);
  return response.data;
};

/**
 * Retrieving project details
 */
export const getProject = async (projectId: string): Promise<ApiResponse<Project>> => {
  const response = await apiClient.get<ApiResponse<Project>>(`/api/projects/${projectId}`);
  return response.data;
};

/**
 * Delete Item
 */
export const deleteProject = async (projectId: string): Promise<ApiResponse> => {
  const response = await apiClient.delete<ApiResponse>(`/api/projects/${projectId}`);
  return response.data;
};

/**
 * Update item
 */
export const updateProject = async (
  projectId: string,
  data: Partial<Project>
): Promise<ApiResponse<Project>> => {
  const response = await apiClient.put<ApiResponse<Project>>(`/api/projects/${projectId}`, data);
  return response.data;
};

/**
 * Update Page Order
 */
export const updatePagesOrder = async (
  projectId: string,
  pageIds: string[]
): Promise<ApiResponse<Project>> => {
  const response = await apiClient.put<ApiResponse<Project>>(
    `/api/projects/${projectId}`,
    { pages_order: pageIds }
  );
  return response.data;
};

// ===== Outline Generation =====

/**
 * Generate Outline
 * @param projectId Item ID
 * @param language Output Language (optional, default from sessionStorage Access）
 */
export const generateOutline = async (projectId: string, language?: OutputLanguage): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/generate/outline`,
    { language: lang }
  );
  return response.data;
};

/**
 * Fluid Generating Outline（SSE）
 * Back ReadableStream，Every one page Event contains a page object
 */
export interface OutlineStreamPage {
  index: number;
  title: string;
  points: string[];
  part?: string;
  description_text?: string;
  extra_fields?: Record<string, string>;
}

export interface OutlineStreamCallbacks {
  onPage: (page: OutlineStreamPage) => void;
  onDone: (data: { total: number; pages: Page[] }) => void;
  onError: (message: string) => void;
}

export const generateOutlineStream = async (
  projectId: string,
  callbacks: OutlineStreamCallbacks,
  language?: OutputLanguage,
  lockPageCount?: boolean,
): Promise<void> => {
  const lang = language || await getStoredOutputLanguage();
  const accessCode = localStorage.getItem('banana-access-code');

  const response = await fetch(`${getBaseURL()}/api/projects/${projectId}/generate/outline/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessCode ? { 'X-Access-Code': accessCode } : {}),
    },
    body: JSON.stringify({ language: lang, lock_page_count: lockPageCount }),
  });

  if (!response.ok || !response.body) {
    callbacks.onError(`HTTP ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let readResult = await reader.read();
  while (!readResult.done) {
    const { value } = readResult;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part.split('\n');
      let eventType = '';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7);
        else if (line.startsWith('data: ')) eventData = line.slice(6);
      }

      if (!eventType || !eventData) continue;

      try {
        const parsed = JSON.parse(eventData);
        if (eventType === 'page') callbacks.onPage(parsed);
        else if (eventType === 'done') callbacks.onDone(parsed);
        else if (eventType === 'error') callbacks.onError(parsed.message);
      } catch {
        // Skip malformed events
      }
    }

    readResult = await reader.read();
  }
};

// ===== Description Generation =====

/**
 * Generate outline and page description from the description text (one-time completion)）
 * @param projectId Item ID
 * @param descriptionText Description text (optional)）
 * @param language Output Language (optional, default from sessionStorage Access）
 */
export const generateFromDescription = async (projectId: string, descriptionText?: string, language?: OutputLanguage): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/generate/from-description`,
    {
      ...(descriptionText ? { description_text: descriptionText } : {}),
      language: lang
    }
  );
  return response.data;
};

/**
 * Batch generation description (parallel mode)）
 * @param projectId Item ID
 * @param language Output Language (optional, default from sessionStorage Access）
 */
export const generateDescriptions = async (projectId: string, language?: OutputLanguage, detailLevel?: string): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/generate/descriptions`,
    { language: lang, detail_level: detailLevel || 'default' }
  );
  return response.data;
};

/**
 * Fluid Generation Description（SSE）
 */
export interface DescriptionStreamEvent {
  narration_text?: string | null;
  page_index: number;
  page_id: string;
  text: string;
  extra_fields?: Record<string, string>;
}

export interface DescriptionStreamCallbacks {
  onDescription: (data: DescriptionStreamEvent) => void;
  onDone: (data: { total: number; pages: Page[] }) => void;
  onError: (message: string) => void;
}

export const generateDescriptionsStream = async (
  projectId: string,
  callbacks: DescriptionStreamCallbacks,
  language?: OutputLanguage,
  detailLevel?: string,
): Promise<void> => {
  const lang = language || await getStoredOutputLanguage();
  const accessCode = localStorage.getItem('banana-access-code');

  const response = await fetch(`${getBaseURL()}/api/projects/${projectId}/generate/descriptions/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessCode ? { 'X-Access-Code': accessCode } : {}),
    },
    body: JSON.stringify({ language: lang, detail_level: detailLevel || 'default' }),
  });

  if (!response.ok || !response.body) {
    callbacks.onError(`HTTP ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let readResult = await reader.read();
  while (!readResult.done) {
    const { value } = readResult;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part.split('\n');
      let eventType = '';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7);
        else if (line.startsWith('data: ')) eventData = line.slice(6);
      }

      if (!eventType || !eventData) continue;

      try {
        const parsed = JSON.parse(eventData);
        if (eventType === 'description') callbacks.onDescription(parsed);
        else if (eventType === 'done') callbacks.onDone(parsed);
        else if (eventType === 'error') callbacks.onError(parsed.message);
      } catch {
        // Skip malformed events
      }
    }

    readResult = await reader.read();
  }
};

/**
 * Generate a single page description
 */
export const generatePageDescription = async (
  projectId: string,
  pageId: string,
  forceRegenerate: boolean = false,
  language?: OutputLanguage,
  detailLevel?: string
): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/generate/description`,
    { force_regenerate: forceRegenerate, language: lang, detail_level: detailLevel || 'default' }
  );
  return response.data;
};

/**
 * Regenerated PPT Single page of the renovation project (resolved) PDF And extract the content.）
 */
export const regenerateRenovationPage = async (
  projectId: string,
  pageId: string,
  keepLayout: boolean = false,
  language?: OutputLanguage
): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/regenerate-renovation`,
    { keep_layout: keepLayout, language: lang }
  );
  return response.data;
};

/**
 * Modify the outline according to user requirements
 * @param projectId Item ID
 * @param userRequirement User Requirements
 * @param previousRequirements Historical requirements (optional)）
 * @param language Output Language (optional, default from sessionStorage Access）
 */
export const refineOutline = async (
  projectId: string,
  userRequirement: string,
  previousRequirements?: string[],
  language?: OutputLanguage
): Promise<ApiResponse<{ pages: Page[]; message: string }>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse<{ pages: Page[]; message: string }>>(
    `/api/projects/${projectId}/refine/outline`,
    {
      user_requirement: userRequirement,
      previous_requirements: previousRequirements || [],
      language: lang
    }
  );
  return response.data;
};

/**
 * Modify page description according to user requirements
 * @param projectId Item ID
 * @param userRequirement User Requirements
 * @param previousRequirements Historical requirements (optional)）
 * @param language Output Language (optional, default from sessionStorage Access）
 */
export const refineDescriptions = async (
  projectId: string,
  userRequirement: string,
  previousRequirements?: string[],
  language?: OutputLanguage
): Promise<ApiResponse<{ pages: Page[]; message: string }>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse<{ pages: Page[]; message: string }>>(
    `/api/projects/${projectId}/refine/descriptions`,
    {
      user_requirement: userRequirement,
      previous_requirements: previousRequirements || [],
      language: lang
    }
  );
  return response.data;
};

// ===== Picture Generation =====

/**
 * Batch Generate Pictures
 * @param projectId Item ID
 * @param language Output Language (optional, default from sessionStorage Access）
 * @param pageIds Optional Pages ID List, if not provided, generate all pages
 */
export const generateImages = async (projectId: string, language?: OutputLanguage, pageIds?: string[]): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/generate/images`,
    { language: lang, page_ids: pageIds }
  );
  return response.data;
};

/**
 * Generate single page pictures
 */
export const generatePageImage = async (
  projectId: string,
  pageId: string,
  forceRegenerate: boolean = false,
  language?: OutputLanguage
): Promise<ApiResponse> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/generate/image`,
    { force_regenerate: forceRegenerate, language: lang }
  );
  return response.data;
};

/**
 * Edit pictures (natural language modification)）
 */
export const editPageImage = async (
  projectId: string,
  pageId: string,
  editPrompt: string,
  contextImages?: {
    useTemplate?: boolean;
    descImageUrls?: string[];
    uploadedFiles?: File[];
  }
): Promise<ApiResponse> => {
  // If there is an upload file, use multipart/form-data
  if (contextImages?.uploadedFiles && contextImages.uploadedFiles.length > 0) {
    const formData = new FormData();
    formData.append('edit_instruction', editPrompt);
    formData.append('use_template', String(contextImages.useTemplate || false));
    if (contextImages.descImageUrls && contextImages.descImageUrls.length > 0) {
      formData.append('desc_image_urls', JSON.stringify(contextImages.descImageUrls));
    }
    // Add Uploading File
    contextImages.uploadedFiles.forEach((file) => {
      formData.append('context_images', file);
    });

    const response = await apiClient.post<ApiResponse>(
      `/api/projects/${projectId}/pages/${pageId}/edit/image`,
      formData
    );
    return response.data;
  } else {
    // Usage JSON
    const response = await apiClient.post<ApiResponse>(
      `/api/projects/${projectId}/pages/${pageId}/edit/image`,
      {
        edit_instruction: editPrompt,
        context_images: {
          use_template: contextImages?.useTemplate || false,
          desc_image_urls: contextImages?.descImageUrls || [],
        },
      }
    );
    return response.data;
  }
};

/**
 * Get Page Picture History Version
 */
export const getPageImageVersions = async (
  projectId: string,
  pageId: string
): Promise<ApiResponse<{ versions: any[] }>> => {
  const response = await apiClient.get<ApiResponse<{ versions: any[] }>>(
    `/api/projects/${projectId}/pages/${pageId}/image-versions`
  );
  return response.data;
};

/**
 * Set the currently used image version
 */
export const setCurrentImageVersion = async (
  projectId: string,
  pageId: string,
  versionId: string
): Promise<ApiResponse> => {
  const response = await apiClient.post<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}/image-versions/${versionId}/set-current`
  );
  return response.data;
};

// ===== Page Operations =====

/**
 * Update Page
 */
export const updatePage = async (
  projectId: string,
  pageId: string,
  data: Partial<Page>
): Promise<ApiResponse<Page>> => {
  const response = await apiClient.put<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}`,
    data
  );
  return response.data;
};

/**
 * Update Page Description
 */
export const updatePageDescription = async (
  projectId: string,
  pageId: string,
  descriptionContent: any,
  language?: OutputLanguage
): Promise<ApiResponse<Page>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.put<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/description`,
    { description_content: descriptionContent, language: lang }
  );
  return response.data;
};

/**
 * Update Page Outline
 */
export const updatePageOutline = async (
  projectId: string,
  pageId: string,
  outlineContent: any,
  language?: OutputLanguage
): Promise<ApiResponse<Page>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.put<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/outline`,
    { outline_content: outlineContent, language: lang }
  );
  return response.data;
};

/**
 * Delete Page
 */
export const deletePage = async (projectId: string, pageId: string): Promise<ApiResponse> => {
  const response = await apiClient.delete<ApiResponse>(
    `/api/projects/${projectId}/pages/${pageId}`
  );
  return response.data;
};

/**
 * Add Page
 */
export const addPage = async (projectId: string, data: Partial<Page>): Promise<ApiResponse<Page>> => {
  const response = await apiClient.post<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages`,
    data
  );
  return response.data;
};

/**
 * Batch Add Page
 */
export const addPages = async (projectId: string, pages: Partial<Page>[]): Promise<ApiResponse<Page[]>> => {
  const response = await apiClient.post<ApiResponse<Page[]>>(
    `/api/projects/${projectId}/pages/batch`,
    { pages }
  );
  return response.data;
};

// ===== Task Query =====

/**
 * Query Task Status
 */
export const getTaskStatus = async (projectId: string, taskId: string): Promise<ApiResponse<Task>> => {
  const response = await apiClient.get<ApiResponse<Task>>(`/api/projects/${projectId}/tasks/${taskId}`);
  return response.data;
};

// ===== Narrator. (Narration) =====

/**
 * Update page adhesion text
 */
export const updatePageNarration = async (
  projectId: string,
  pageId: string,
  narrationText: string
): Promise<ApiResponse<Page>> => {
  const response = await apiClient.put<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/narration`,
    { narration_text: narrationText }
  );
  return response.data;
};

/**
 * AI Generate single page confidance
 */
export const generatePageNarration = async (
  projectId: string,
  pageId: string,
  language?: OutputLanguage
): Promise<ApiResponse<Page>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse<Page>>(
    `/api/projects/${projectId}/pages/${pageId}/generate/narration`,
    { language: lang }
  );
  return response.data;
};

/**
 * Batch Generate All Page Appearances
 */
export const generateAllNarrations = async (
  projectId: string,
  language?: OutputLanguage,
  forceRegenerate?: boolean
): Promise<ApiResponse<{ total: number; generated: number; skipped: number; failed: number; pages: Page[] }>> => {
  const lang = language || await getStoredOutputLanguage();
  const response = await apiClient.post<ApiResponse<{ total: number; generated: number; skipped: number; failed: number; pages: Page[] }>>(
    `/api/projects/${projectId}/generate/narrations`,
    { language: lang, force_regenerate: forceRegenerate || false }
  );
  return response.data;
};

// ===== Export =====

/**
 * Helper function to build query string with page_ids
 */
const buildPageIdsQuery = (pageIds?: string[]): string => {
  if (!pageIds || pageIds.length === 0) return '';
  const params = new URLSearchParams();
  params.set('page_ids', pageIds.join(','));
  return `?${params.toString()}`;
};

const buildExportQuery = (params: Record<string, string | string[] | boolean | undefined>): string => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length > 0) query.set(key, value.join(','));
      return;
    }
    query.set(key, String(value));
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

/**
 * Export As PPTX
 * @param projectId Item ID
 * @param pageIds Optional Pages ID List, export all pages if not provided
 * @param clientTaskId Optional Tasks ID，Use to create a request to respond to a lost recovery
 */
export const exportPPTX = async (
  projectId: string,
  pageIds?: string[],
  options?: {
    transitionEnabled?: boolean;
    transitionEffects?: string[];
  }
): Promise<ApiResponse<{ download_url: string; download_url_absolute?: string }>> => {
  const url = `/api/projects/${projectId}/export/pptx${buildExportQuery({
    page_ids: pageIds,
    transition_enabled: options?.transitionEnabled ? true : undefined,
    transition_effects: options?.transitionEnabled ? options.transitionEffects : undefined,
  })}`;
  const response = await apiClient.get<
    ApiResponse<{ download_url: string; download_url_absolute?: string }>
  >(url);
  return response.data;
};

/**
 * Export As PDF
 * @param projectId Item ID
 * @param pageIds Optional Pages ID List, export all pages if not provided
 */
export const exportPDF = async (
  projectId: string,
  pageIds?: string[]
): Promise<ApiResponse<{ download_url: string; download_url_absolute?: string }>> => {
  const url = `/api/projects/${projectId}/export/pdf${buildPageIdsQuery(pageIds)}`;
  const response = await apiClient.get<
    ApiResponse<{ download_url: string; download_url_absolute?: string }>
  >(url);
  return response.data;
};

/**
 * Export as Picture (one direct download, multiple packs) ZIP）
 */
export const exportImages = async (
  projectId: string,
  pageIds?: string[]
): Promise<ApiResponse<{ download_url: string; download_url_absolute?: string }>> => {
  const url = `/api/projects/${projectId}/export/images${buildPageIdsQuery(pageIds)}`;
  const response = await apiClient.get<
    ApiResponse<{ download_url: string; download_url_absolute?: string }>
  >(url);
  return response.data;
};

/**
 * Export to Editable PPTX（Step-by-step mission）
 * @param projectId Item ID
 * @param filename Optional filename
 * @param pageIds Optional Pages ID List, export all pages if not provided
 */
export const exportEditablePPTX = async (
  projectId: string,
  filename?: string,
  pageIds?: string[],
  clientTaskId?: string,
): Promise<ApiResponse<{ task_id: string }>> => {
  const response = await apiClient.post<
    ApiResponse<{ task_id: string }>
  >(`/api/projects/${projectId}/export/editable-pptx`, {
    filename,
    page_ids: pageIds,
    client_task_id: clientTaskId,
  });
  return response.data;
};

/**
 * List the exported files of the item
 */
export const listExports = async (
  projectId: string,
): Promise<ApiResponse<{ files: Array<{
  filename: string;
  type: string;
  size: number;
  modified_at: string;
  download_url: string;
}> }>> => {
  const response = await apiClient.get(`/api/projects/${projectId}/exports`);
  return response.data;
};

/**
 * Remove Exported File of the Item
 */
export const deleteExport = async (
  projectId: string,
  filename: string,
): Promise<ApiResponse<{ filename: string }>> => {
  const response = await apiClient.delete(
    `/api/projects/${projectId}/exports/${encodeURIComponent(filename)}`
  );
  return response.data;
};

/**
 * Export as a lecture video (speech task)）
 * @param projectId Item ID
 * @param options Export Options
 */
export const exportVideo = async (
  projectId: string,
  options?: { filename?: string; pageIds?: string[]; voice?: string; speed?: number; generateNarration?: boolean }
): Promise<ApiResponse<{ task_id: string }>> => {
  const response = await apiClient.post<ApiResponse<{ task_id: string }>>(`/api/projects/${projectId}/export/video`, {
    filename: options?.filename, page_ids: options?.pageIds, voice: options?.voice,
    speed: options?.speed, generate_narration: options?.generateNarration ?? true,
  });
  return response.data;
};

// ===== Material generation =====

/**
 * Generate single image of material (no specific pages bound)）
 * Now return to the walker. ID，It needs to be passed. getTaskStatus Query for results
 */
export const generateMaterialImage = async (
  projectId: string,
  prompt: string,
  refImage?: File | null,
  extraImages?: File[],
  aspectRatio?: string
): Promise<ApiResponse<{ task_id: string; status: string }>> => {
  const formData = new FormData();
  formData.append('prompt', prompt);
  if (aspectRatio) {
    formData.append('aspect_ratio', aspectRatio);
  }
  if (refImage) {
    formData.append('ref_image', refImage);
  }

  if (extraImages && extraImages.length > 0) {
    extraImages.forEach((file) => {
      formData.append('extra_images', file);
    });
  }

  const response = await apiClient.post<ApiResponse<{ task_id: string; status: string }>>(
    `/api/projects/${projectId}/materials/generate`,
    formData
  );
  return response.data;
};

export type MaterialProcessOperation =
  | 'generate'
  | 'edit_full'
  | 'region_edit'
  | 'erase_region';

export interface MaterialSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  image_width: number;
  image_height: number;
}

export interface ProcessMaterialOptions {
  operation: MaterialProcessOperation;
  prompt?: string;
  sourceImage?: File | null;
  refImage?: File | null;
  extraImages?: File[];
  aspectRatio?: string;
  selection?: MaterialSelectionRect | null;
  applyMode?: 'overlay_selection' | 'replace_full';
}

export const processMaterialImage = async (
  projectId: string,
  options: ProcessMaterialOptions
): Promise<ApiResponse<{ task_id: string; status: string }>> => {
  const formData = new FormData();
  formData.append('operation', options.operation);
  if (options.prompt) {
    formData.append('prompt', options.prompt);
  }
  if (options.aspectRatio) {
    formData.append('aspect_ratio', options.aspectRatio);
  }
  if (options.applyMode) {
    formData.append('apply_mode', options.applyMode);
  }
  if (options.selection) {
    formData.append('selection', JSON.stringify(options.selection));
  }
  if (options.sourceImage) {
    formData.append('source_image', options.sourceImage);
  }
  if (options.refImage) {
    formData.append('ref_image', options.refImage);
  }
  if (options.extraImages && options.extraImages.length > 0) {
    options.extraImages.forEach((file) => {
      formData.append('extra_images', file);
    });
  }

  const response = await apiClient.post<ApiResponse<{ task_id: string; status: string }>>(
    `/api/projects/${projectId}/materials/process`,
    formData
  );
  return response.data;
};

/**
 * Retrieving material list
 * @param projectId Item ID，Optional
 *   - If provided and not 'all' or 'none': Get materials for specific project via /api/projects/{projectId}/materials
 *   - If 'all': Get all materials via /api/materials?project_id=all
 *   - If 'none': Get global materials (not bound to any project) via /api/materials?project_id=none
 *   - If not provided: Get all materials via /api/materials
 */
export const listMaterials = async (
  projectId?: string
): Promise<ApiResponse<{ materials: Material[]; count: number }>> => {
  let url: string;

  if (!projectId || projectId === 'all') {
    // Get all materials using global endpoint
    url = '/api/materials?project_id=all';
  } else if (projectId === 'none') {
    // Get global materials (not bound to any project)
    url = '/api/materials?project_id=none';
  } else {
    // Get materials for specific project
    url = `/api/projects/${projectId}/materials`;
  }

  const response = await apiClient.get<ApiResponse<{ materials: Material[]; count: number }>>(url);
  return response.data;
};

/**
 * Upload material pictures
 * @param file Photo Files
 * @param projectId Optional items ID
 *   - If provided: Upload material bound to the project
 *   - If not provided or 'none': Upload as global material (not bound to any project)
 */
export const uploadMaterial = async (
  file: File,
  projectId?: string | null,
  generateCaption?: boolean
): Promise<ApiResponse<Material & { caption?: string }>> => {
  const formData = new FormData();
  formData.append('file', file);

  let url: string;
  if (!projectId || projectId === 'none') {
    // Use global upload endpoint for materials not bound to any project
    url = '/api/materials/upload';
  } else {
    // Use project-specific upload endpoint
    url = `/api/projects/${projectId}/materials/upload`;
  }

  if (generateCaption) {
    url += (url.includes('?') ? '&' : '?') + 'generate_caption=true';
  }

  const response = await apiClient.post<ApiResponse<Material & { caption?: string }>>(url, formData);
  return response.data;
};

/**
 * Remove material
 */
export const deleteMaterial = async (materialId: string): Promise<ApiResponse<{ id: string }>> => {
  const response = await apiClient.delete<ApiResponse<{ id: string }>>(`/api/materials/${materialId}`);
  return response.data;
};

/**
 * Generate caption for an existing material
 */
export const getMaterialCaption = async (materialId: string): Promise<ApiResponse<{ caption: string }>> => {
  const response = await apiClient.get<ApiResponse<{ caption: string }>>(`/api/materials/${materialId}/caption`);
  return response.data;
};

/**
 * Get material by URL and ensure it has a caption
 */
export const getMaterialByUrl = async (url: string): Promise<ApiResponse<Material>> => {
  const response = await apiClient.get<ApiResponse<Material>>(`/api/materials/by-url`, { params: { url } });
  return response.data;
};

/**
 * Download selected materials bundled as a zip archive.
 */
export const downloadMaterialsZip = async (
  materialIds: string[]
): Promise<ApiResponse<{ download_url: string }>> => {
  const { data: blob } = await apiClient.post<Blob>(
    '/api/materials/download',
    { material_ids: materialIds },
    { responseType: 'blob' },
  );

  const href = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), {
    href,
    download: 'materials.zip',
  });
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);

  return { success: true, data: { download_url: '' } };
};

/**
 * Link material to project (through URL）
 * @param projectId Item ID
 * @param materialUrls Materials URL List
 */
export const associateMaterialsToProject = async (
  projectId: string,
  materialUrls: string[]
): Promise<ApiResponse<{ updated_ids: string[]; count: number }>> => {
  const response = await apiClient.post<ApiResponse<{ updated_ids: string[]; count: number }>>(
    '/api/materials/associate',
    { project_id: projectId, material_urls: materialUrls }
  );
  return response.data;
};

// ===== User Templates =====

export interface UserTemplate {
  template_id: string;
  name?: string;
  template_image_url: string;
  thumb_url?: string;  // Thumbnail URL for faster loading
  created_at?: string;
  updated_at?: string;
}

/**
 * Upload user templates
 */
export const uploadUserTemplate = async (
  templateImage: File,
  name?: string
): Promise<ApiResponse<UserTemplate>> => {
  const formData = new FormData();
  formData.append('template_image', templateImage);
  if (name) {
    formData.append('name', name);
  }

  const response = await apiClient.post<ApiResponse<UserTemplate>>(
    '/api/user-templates',
    formData
  );
  return response.data;
};

/**
 * Get a list of user templates
 */
export const listUserTemplates = async (): Promise<ApiResponse<{ templates: UserTemplate[] }>> => {
  const response = await apiClient.get<ApiResponse<{ templates: UserTemplate[] }>>(
    '/api/user-templates'
  );
  return response.data;
};

/**
 * Remove user templates
 */
export const deleteUserTemplate = async (templateId: string): Promise<ApiResponse> => {
  const response = await apiClient.delete<ApiResponse>(`/api/user-templates/${templateId}`);
  return response.data;
};

// ===== Relevant reference documents API =====

export interface UserStyleTemplate {
  id: string;
  name: string;
  description: string;
  color?: string;
  created_at?: string;
}

export const createUserStyleTemplate = async (
  data: { name: string; description: string; color?: string }
): Promise<ApiResponse<UserStyleTemplate>> => {
  const response = await apiClient.post<ApiResponse<UserStyleTemplate>>(
    '/api/user-style-templates',
    data
  );
  return response.data;
};

export const listUserStyleTemplates = async (): Promise<ApiResponse<{ templates: UserStyleTemplate[] }>> => {
  const response = await apiClient.get<ApiResponse<{ templates: UserStyleTemplate[] }>>(
    '/api/user-style-templates'
  );
  return response.data;
};

export const deleteUserStyleTemplate = async (id: string): Promise<ApiResponse> => {
  const response = await apiClient.delete<ApiResponse>(`/api/user-style-templates/${id}`);
  return response.data;
};

// ===== Relevant reference documents API =====

export interface ReferenceFile {
  id: string;
  project_id: string | null;
  filename: string;
  file_size: number;
  file_type: string;
  parse_status: 'pending' | 'parsing' | 'completed' | 'failed';
  markdown_content: string | null;
  error_message: string | null;
  image_caption_failed_count?: number;  // Optional, calculated dynamically
  created_at: string;
  updated_at: string;
}

/**
 * Uploading reference files
 * @param file Documentation
 * @param projectId Optional items ID（If not provided or'none'，global file）
 */
export const uploadReferenceFile = async (
  file: File,
  projectId?: string | null
): Promise<ApiResponse<{ file: ReferenceFile }>> => {
  const formData = new FormData();
  formData.append('file', file);
  if (projectId && projectId !== 'none') {
    formData.append('project_id', projectId);
  }

  const response = await apiClient.post<ApiResponse<{ file: ReferenceFile }>>(
    '/api/reference-files/upload',
    formData
  );
  return response.data;
};

/**
 * Access to reference document information
 * @param fileId Documentation ID
 */
export const getReferenceFile = async (fileId: string): Promise<ApiResponse<{ file: ReferenceFile }>> => {
  const response = await apiClient.get<ApiResponse<{ file: ReferenceFile }>>(
    `/api/reference-files/${fileId}`
  );
  return response.data;
};

/**
 * References for projects
 * @param projectId Item ID（'global' or 'none' For listing global files）
 */
export const listProjectReferenceFiles = async (
  projectId: string
): Promise<ApiResponse<{ files: ReferenceFile[] }>> => {
  const response = await apiClient.get<ApiResponse<{ files: ReferenceFile[] }>>(
    `/api/reference-files/project/${projectId}`
  );
  return response.data;
};

/**
 * Remove reference file
 * @param fileId Documentation ID
 */
export const deleteReferenceFile = async (fileId: string): Promise<ApiResponse<{ message: string }>> => {
  const response = await apiClient.delete<ApiResponse<{ message: string }>>(
    `/api/reference-files/${fileId}`
  );
  return response.data;
};

/**
 * Trigger File Parsing
 * @param fileId Documentation ID
 */
export const triggerFileParse = async (fileId: string): Promise<ApiResponse<{ file: ReferenceFile; message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ file: ReferenceFile; message: string }>>(
    `/api/reference-files/${fileId}/parse`
  );
  return response.data;
};

/**
 * Link reference files to items
 * @param fileId Documentation ID
 * @param projectId Item ID
 */
export const associateFileToProject = async (
  fileId: string,
  projectId: string
): Promise<ApiResponse<{ file: ReferenceFile }>> => {
  const response = await apiClient.post<ApiResponse<{ file: ReferenceFile }>>(
    `/api/reference-files/${fileId}/associate`,
    { project_id: projectId }
  );
  return response.data;
};

/**
 * Remove reference files from items (do not delete the document itself)）
 * @param fileId Documentation ID
 */
export const dissociateFileFromProject = async (
  fileId: string
): Promise<ApiResponse<{ file: ReferenceFile; message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ file: ReferenceFile; message: string }>>(
    `/api/reference-files/${fileId}/dissociate`
  );
  return response.data;
};

// ===== Output Language Settings =====

export type OutputLanguage = 'zh' | 'ja' | 'en' | 'auto';

export interface OutputLanguageOption {
  value: OutputLanguage;
  label: string;
}

export const OUTPUT_LANGUAGE_OPTIONS: OutputLanguageOption[] = [
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'en', label: 'English' },
  { value: 'auto', label: 'Auto' },
];

/**
 * Get default output language settings (read from server environment variables)）
 *
 * Note： This returns only the default language of the server configuration。
 * The actual language selection should be at the front end sessionStorage Medium management，
 * and by each request generated language Parameter Transfer。
 */
export const getDefaultOutputLanguage = async (): Promise<ApiResponse<{ language: OutputLanguage }>> => {
  const response = await apiClient.get<ApiResponse<{ language: OutputLanguage }>>(
    '/api/output-language'
  );
  return response.data;
};

/**
 * From Backend Settings Get user preference for output language
 * If fetching failed, return default value 'zh'
 */
export const getStoredOutputLanguage = async (): Promise<OutputLanguage> => {
  try {
    const response = await apiClient.get<ApiResponse<{ language: OutputLanguage }>>('/api/output-language');
    return response.data.data?.language || 'zh';
  } catch (error) {
    console.warn('Failed to load output language from settings, using default', error);
    return 'zh';
  }
};

/**
 * Get System Settings
 */
export const getSettings = async (): Promise<ApiResponse<Settings>> => {
  const response = await apiClient.get<ApiResponse<Settings>>('/api/settings');
  return response.data;
};



/**
 * Update System Settings
 */
export const updateSettings = async (
  data: Partial<Settings>
): Promise<ApiResponse<Settings>> => {
  const response = await apiClient.put<ApiResponse<Settings>>('/api/settings', data);
  return response.data;
};

/**
 * Reset System Settings
 */
export const resetSettings = async (): Promise<ApiResponse<Settings>> => {
  const response = await apiClient.post<ApiResponse<Settings>>('/api/settings/reset');
  return response.data;
};

/**
 * Authentication API key Available
 */
export const verifyApiKey = async (): Promise<ApiResponse<{ available: boolean; message: string }>> => {
  const response = await apiClient.post<ApiResponse<{ available: boolean; message: string }>>('/api/settings/verify');
  return response.data;
};

// ===== PPT Refurbishment related API =====

/**
 * Create PPT Renovation projects
 * Upload PDF/PPTX File, back-end isostep resolution and fill in outline+Description
 */
export const createPptRenovationProject = async (
  file: File,
  options?: {
    keepLayout?: boolean;
    templateStyle?: string;
    language?: string;
  }
): Promise<ApiResponse<{ project_id: string; task_id: string; page_count: number }>> => {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.keepLayout) {
    formData.append('keep_layout', 'true');
  }
  if (options?.templateStyle) {
    formData.append('template_style', options.templateStyle);
  }
  if (options?.language) {
    formData.append('language', options.language);
  }

  const response = await apiClient.post<ApiResponse<{ project_id: string; task_id: string; page_count: number }>>(
    '/api/projects/renovation',
    formData
  );
  return response.data;
};

/**
 * Extract style description from pictures (general, no bound items)）
 */
export const extractStyleFromImage = async (
  imageFile: File
): Promise<ApiResponse<{ style_description: string }>> => {
  const formData = new FormData();
  formData.append('image', imageFile);

  const response = await apiClient.post<ApiResponse<{ style_description: string }>>(
    '/api/extract-style',
    formData
  );
  return response.data;
};

/**
 * Generate style descriptions based on content (general, no bound items)）
 */
export const generateStyleFromContent = async (
  content: string,
  language: string = 'zh'
): Promise<ApiResponse<{ style_description: string }>> => {
  const response = await apiClient.post<ApiResponse<{ style_description: string }>>(
    '/api/generate-style-from-content',
    { content, language }
  );
  return response.data;
};

// ===== Templates per Page（per-page template）API =====

/**
 * List Project Template Library
 */
export const listTemplateAssets = async (
  projectId: string
): Promise<ApiResponse<{ assets: TemplateAsset[] }>> => {
  const response = await apiClient.get<ApiResponse<{ assets: TemplateAsset[] }>>(
    `/api/projects/${projectId}/template-assets`
  );
  return response.data;
};

/**
 * A picture of the flyer template (speech trigger resolution)）
 * @param opts.bindToPageId Automatically bind to the page after upload（PRD §10.3）
 */
export const uploadTemplateAsset = async (
  projectId: string,
  image: File,
  opts?: { userLabel?: string; bindToPageId?: string }
): Promise<ApiResponse<{ asset: TemplateAsset; analyze_task_id: string }>> => {
  const formData = new FormData();
  formData.append('image', image);
  if (opts?.userLabel) formData.append('user_label', opts.userLabel);
  const query = opts?.bindToPageId
    ? `?bind_to_page=${encodeURIComponent(opts.bindToPageId)}`
    : '';
  const response = await apiClient.post<
    ApiResponse<{ asset: TemplateAsset; analyze_task_id: string }>
  >(`/api/projects/${projectId}/template-assets${query}`, formData);
  return response.data;
};

/**
 * Upload PDF Split Pages (Speech, Return) task_id For a rotation.）
 */
export const uploadTemplatePdf = async (
  projectId: string,
  pdf: File
): Promise<ApiResponse<{ task_id: string }>> => {
  const formData = new FormData();
  formData.append('pdf', pdf);
  const response = await apiClient.post<ApiResponse<{ task_id: string }>>(
    `/api/projects/${projectId}/template-assets/upload-pdf`,
    formData
  );
  return response.data;
};

/**
 * Edit Template Assets (User Tags) / Fix Parsing）
 */
export const updateTemplateAsset = async (
  projectId: string,
  assetId: string,
  patch: {
    user_label?: string | null;
    analysis_json?: TemplateAsset['analysis_json'];
    analysis_notes?: string | null;
    sort_order?: number;
  }
): Promise<ApiResponse<{ asset: TemplateAsset }>> => {
  const response = await apiClient.patch<ApiResponse<{ asset: TemplateAsset }>>(
    `/api/projects/${projectId}/template-assets/${assetId}`,
    patch
  );
  return response.data;
};

/**
 * Delete template asset (reference to page field emptyed backend)）
 */
export const deleteTemplateAsset = async (
  projectId: string,
  assetId: string
): Promise<ApiResponse<{ deleted: boolean; cleared_page_ids: string[] }>> => {
  const response = await apiClient.delete<
    ApiResponse<{ deleted: boolean; cleared_page_ids: string[] }>
  >(`/api/projects/${projectId}/template-assets/${assetId}`);
  return response.data;
};

/**
 * Manually resolve the template assets
 */
export const reanalyzeTemplateAsset = async (
  projectId: string,
  assetId: string
): Promise<ApiResponse<{ analyze_task_id: string }>> => {
  const response = await apiClient.post<ApiResponse<{ analyze_task_id: string }>>(
    `/api/projects/${projectId}/template-assets/${assetId}/reanalyze`
  );
  return response.data;
};

/**
 * Single Page Setup Template（asset / Text Style / Clear）
 */
export const updatePageTemplate = async (
  projectId: string,
  pageId: string,
  patch: {
    template_asset_id?: string | null;
    template_style_text?: string | null;
    selection_source?: 'manual' | 'auto' | 'batch_apply';
  }
): Promise<ApiResponse<{ page: Page }>> => {
  const response = await apiClient.patch<ApiResponse<{ page: Page }>>(
    `/api/projects/${projectId}/pages/${pageId}/template`,
    patch
  );
  return response.data;
};

/**
 * Toggle Template Mode（JSON Path, decision-making 7）
 * Single→More：{ mode: 'multi' }
 * More→Single：{ mode: 'single', unified_asset_id? , unified_style_text? }
 */
export const switchTemplateMode = async (
  projectId: string,
  payload:
    | { mode: 'multi' }
    | { mode: 'single'; unified_asset_id?: string | null; unified_style_text?: string | null }
): Promise<ApiResponse<{ project: Project }>> => {
  const response = await apiClient.patch<ApiResponse<{ project: Project }>>(
    `/api/projects/${projectId}/template-mode`,
    payload
  );
  return response.data;
};

/**
 * More→Single + A new traditional template（multipart Path）
 */
export const switchTemplateModeSingleWithUpload = async (
  projectId: string,
  image: File,
  unifiedStyleText?: string
): Promise<ApiResponse<{ asset: TemplateAsset; project: Project; analyze_task_id: string }>> => {
  const formData = new FormData();
  formData.append('image', image);
  if (unifiedStyleText) formData.append('unified_style_text', unifiedStyleText);
  const response = await apiClient.post<
    ApiResponse<{ asset: TemplateAsset; project: Project; analyze_task_id: string }>
  >(`/api/projects/${projectId}/template-mode/single-with-upload`, formData);
  return response.data;
};

/**
 * Auto-matching of full project (decision-making) 5）
 */
export const autoMatchAllTemplates = async (
  projectId: string,
  opts?: { overwrite_existing?: boolean; preserve_non_empty?: boolean }
): Promise<ApiResponse<{ task_id: string }>> => {
  const response = await apiClient.post<ApiResponse<{ task_id: string }>>(
    `/api/projects/${projectId}/template-assets/auto-match`,
    {
      overwrite_existing: opts?.overwrite_existing ?? true,
      preserve_non_empty: opts?.preserve_non_empty ?? false,
    }
  );
  return response.data;
};

/**
 * Auto Matching One Page（PRD §9）
 */
export const autoMatchPageTemplate = async (
  projectId: string,
  pageId: string
): Promise<ApiResponse<{ task_id: string }>> => {
  const response = await apiClient.post<ApiResponse<{ task_id: string }>>(
    `/api/projects/${projectId}/pages/${pageId}/template/auto-match`
  );
  return response.data;
};
