import { create } from 'zustand';
import type { Project, TemplateAsset, Task } from '@/types';
import * as api from '@/api/endpoints';
import {
  debounce,
  normalizeProject,
  normalizeErrorMessage,
} from '@/utils';
import { devLog } from '@/utils/logger';
import { triggerDownload } from '@/api/client';
import { getT } from '@/utils/i18nHelper';

const storeI18n = {
  zh: {
    store: {
      createFailed: 'Failed to create project',
      createNoId: 'Project creation failed: no project ID returned',
      syncFailed: 'Failed to sync project',
      projectNotFound: 'Project not found, it may have been deleted',
      requestFailed: 'Request failed',
      requestFailedStatus: 'Request failed: {{status}}',
      networkError: 'Network error, please check if the backend service is running',
      updateOrderFailed: 'Failed to update page order',
      newPage: 'New Page',
      addPageFailed: 'Failed to add page',
      deletePageFailed: 'Failed to delete page',
      taskStartFailed: 'Failed to start task',
      taskFailed: 'Task failed',
      unknownTaskStatus: 'Unknown task status: {{status}}',
      taskQueryFailed: 'Failed to query task',
      generateOutlineFailed: 'Failed to generate outline',
      generateFromDescFailed: 'Failed to generate from description',
      projectIdMissing: 'Project ID not found',
      noTaskId: 'No task ID received',
      generateDescFailed: 'Failed to generate description',
      generateDescTimeout: 'Failed to generate description: polling timeout',
      startGenerationFailed: 'Failed to start generation task',
      regenerateFailed: 'Failed to regenerate',
      batchGenerateFailed: 'Batch generation failed',
      editImageFailed: 'Failed to edit image',
      exportLinkFailed: 'Failed to get export link',
      exportFailed: 'Export failed',
      exportEditableFailed: 'Failed to export editable PPTX',
    }
  },
  en: {
    store: {
      createFailed: 'Failed to create project',
      createNoId: 'Project creation failed: no project ID returned',
      syncFailed: 'Failed to sync project',
      projectNotFound: 'Project not found, it may have been deleted',
      requestFailed: 'Request failed',
      requestFailedStatus: 'Request failed: {{status}}',
      networkError: 'Network error, please check if the backend service is running',
      updateOrderFailed: 'Failed to update page order',
      newPage: 'New Page',
      addPageFailed: 'Failed to add page',
      deletePageFailed: 'Failed to delete page',
      taskStartFailed: 'Failed to start task',
      taskFailed: 'Task failed',
      unknownTaskStatus: 'Unknown task status: {{status}}',
      taskQueryFailed: 'Failed to query task',
      generateOutlineFailed: 'Failed to generate outline',
      generateFromDescFailed: 'Failed to generate from description',
      projectIdMissing: 'Project ID not found',
      noTaskId: 'No task ID received',
      generateDescFailed: 'Failed to generate description',
      generateDescTimeout: 'Failed to generate description: polling timeout',
      startGenerationFailed: 'Failed to start generation task',
      regenerateFailed: 'Failed to regenerate',
      batchGenerateFailed: 'Batch generation failed',
      editImageFailed: 'Failed to edit image',
      exportLinkFailed: 'Failed to get export link',
      exportFailed: 'Export failed',
      exportEditableFailed: 'Failed to export editable PPTX',
    }
  }
};
const t = getT(storeI18n);

// Clean up the old prototype. per-project localStorage key（Handover of documents §3：Old demo Data does not migrate）。
// Do it once when the module is loaded and connect the obsolete template key Remove Directly。
(function cleanupLegacyTemplateLocalStorageKeys() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const legacyPrefixes = ['template_mode_', 'template_assets_', 'page_template_assign_'];
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && legacyPrefixes.some((prefix) => key.startsWith(prefix))) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // localStorage Skip silently when not available
  }
})();

interface ProjectState {
  // Status
  currentProject: Project | null;
  isGlobalLoading: boolean;
  // There are page changes in the tremors queue or backends (used for「Saving/Saved」Hint）
  isSavingPages: boolean;
  activeTaskId: string | null;
  taskProgress: { total: number; completed: number } | null;
  error: string | null;
  // Generating Tasks for Each Page ID Map (pageId -> taskId)
  pageGeneratingTasks: Record<string, string>;
  // Warning Message
  warningMessage: string | null;
  // Streaming outline generation
  isOutlineStreaming: boolean;
  // Items that are streaming out the outline. Tasks can still be done backstage, but can only update their own projects。
  outlineStreamingProjectIds: string[];
  // Streaming description generation
  isDescriptionStreaming: boolean;
  // Project Template Library（per-page template）
  templateAssets: TemplateAsset[];

  // Actions
  setCurrentProject: (project: Project | null) => void;
  setGlobalLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Project Operations
  initializeProject: (type: 'idea' | 'outline' | 'description' | 'blank', content: string, templateImage?: File, templateStyle?: string, referenceFileIds?: string[], aspectRatio?: string) => Promise<void>;
  syncProject: (projectId?: string) => Promise<void>;

  // Page Operations
  updatePageLocal: (pageId: string, data: any) => void;
  saveAllPages: () => Promise<void>;
  reorderPages: (newOrder: string[]) => Promise<void>;
  addNewPage: () => Promise<void>;
  deletePageById: (pageId: string) => Promise<void>;

  // Step-by-step mission
  startAsyncTask: (apiCall: () => Promise<any>) => Promise<void>;
  pollTask: (taskId: string) => Promise<void>;
  pollImageTask: (taskId: string, pageIds: string[]) => void;

  // Generate Operations
  generateOutline: () => Promise<void>;
  generateOutlineStream: (lockPageCount?: boolean) => Promise<{ complete: boolean; active: boolean } | undefined>;
  generateFromDescription: () => Promise<void>;
  generateDescriptions: (detailLevel?: string) => Promise<void>;
  generatePageDescription: (pageId: string, detailLevel?: string) => Promise<void>;
  regenerateRenovationPage: (pageId: string, keepLayout?: boolean) => Promise<void>;
  generatePageImage: (pageId: string, forceRegenerate?: boolean) => Promise<void>;
  generateImages: (pageIds?: string[]) => Promise<void>;
  editPageImage: (
    pageId: string,
    editPrompt: string,
    contextImages?: {
      useTemplate?: boolean;
      descImageUrls?: string[];
      uploadedFiles?: File[];
    }
  ) => Promise<void>;

  // Export
  exportPPTX: (pageIds?: string[]) => Promise<void>;
  exportPDF: (pageIds?: string[]) => Promise<void>;
  exportEditablePPTX: (filename?: string, pageIds?: string[]) => Promise<void>;

  // Templates per Page（per-page template）
  loadTemplateAssets: (projectId: string) => Promise<TemplateAsset[]>;
  uploadTemplateAsset: (projectId: string, file: File, opts?: { userLabel?: string; bindToPageId?: string }) => Promise<TemplateAsset>;
  uploadTemplatePdf: (projectId: string, file: File) => Promise<string>;
  updateTemplateAsset: (projectId: string, assetId: string, patch: { user_label?: string | null; analysis_json?: TemplateAsset['analysis_json']; analysis_notes?: string | null; sort_order?: number }) => Promise<TemplateAsset>;
  deleteTemplateAsset: (projectId: string, assetId: string) => Promise<string[]>;
  reanalyzeTemplateAsset: (projectId: string, assetId: string) => Promise<string>;
  updatePageTemplate: (projectId: string, pageId: string, patch: { template_asset_id?: string | null; template_style_text?: string | null; selection_source?: 'manual' | 'auto' | 'batch_apply' }) => Promise<void>;
  switchTemplateMode: (projectId: string, payload: { mode: 'multi' } | { mode: 'single'; unified_asset_id?: string | null; unified_style_text?: string | null }) => Promise<void>;
  switchTemplateModeWithUpload: (projectId: string, file: File, unifiedStyleText?: string) => Promise<void>;
  autoMatchAll: (projectId: string, opts?: { overwrite_existing?: boolean; preserve_non_empty?: boolean }) => Promise<string>;
  autoMatchPage: (projectId: string, pageId: string) => Promise<string>;
  pollTemplateTask: (taskId: string, projectId: string, onProgress?: (task: Task) => void) => Promise<Task>;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  // Send one page field to their backends
  const savePageFields = async (projectId: string, pageId: string, data: any) => {
    const promises: Promise<any>[] = [];

    // If it’s updated description_content，Use specific endpoints
    if (data.description_content) {
      promises.push(api.updatePageDescription(projectId, pageId, data.description_content));
    }

    // If it’s updated outline_content，Use specific endpoints
    if (data.outline_content) {
      promises.push(api.updatePageOutline(projectId, pageId, data.outline_content));
    }

    // If it’s updated narration_text，Use specific endpoints
    // （General Endpoint Accepts Only part，narration This is where we’re going to get to the bottom of this.）
    if ('narration_text' in data) {
      promises.push(api.updatePageNarration(projectId, pageId, data.narration_text ?? ''));
    }

    // If it’s updated part fields, using generic endpoints
    if ('part' in data) {
      promises.push(api.updatePage(projectId, pageId, { part: data.part }));
    }

    // Use common endpoint if no specific content update is available
    if (promises.length === 0) {
      await api.updatePage(projectId, pageId, data);
    } else {
      // Implement all updates in parallel
      await Promise.all(promises);
    }
  };

  // Page changes to be written backend：pageId -> Merged Fields。
  // The vibrating timer is shared across the board, so it has to accumulate, not overwhelm, parameters.，
  // Otherwise... 1s Continuous editing of multiple fields (or continued editing after cutting pages) will remove previous changes。
  const pendingPageUpdates = new Map<string, { projectId: string; data: any }>();

  const flushPageUpdates = async () => {
    const entries = Array.from(pendingPageUpdates.entries());
    pendingPageUpdates.clear();
    if (entries.length === 0) return;

    try {
      await Promise.all(
        entries.map(([pageId, { projectId, data }]) => savePageFields(projectId, pageId, data))
      );

      // API Sync project status to update after successful call updated_at
      // Picture generation time poll Already 2s Sync, skip to avoid simultaneous competition
      // The user may have cut the item off in the shivering window, at which point the sync will cover the current item into an old one
      // The queue may be mixed with multiple project changes.
      // Is there a copy of the current project, not just the first one?
      const { syncProject, pageGeneratingTasks, currentProject } = get();
      const touchedCurrentProject =
        !!currentProject && entries.some(([, update]) => update.projectId === currentProject.project_id);
      if (touchedCurrentProject && Object.keys(pageGeneratingTasks).length === 0) {
        await syncProject(currentProject!.id);
      }
    } catch (error: any) {
      console.error('Failed to save page:', error);
      // You can add error tips here, but only logs are recorded for the time being in order to avoid frequent tips.
      // If necessary, through the event system or toast Notify users
    } finally {
      // The queue could be this time. flush Period is written again, only when empty is saved is finished
      if (pendingPageUpdates.size === 0) set({ isSavingPages: false });
    }
  };

  const debouncedFlushPageUpdates = debounce(flushPageUpdates, 1000);

  const debouncedUpdatePage = (projectId: string, pageId: string, data: any) => {
    const existing = pendingPageUpdates.get(pageId);
    pendingPageUpdates.set(pageId, {
      projectId,
      data: { ...(existing?.data ?? {}), ...data },
    });
    // Duplication during word-to-word input set Trigger unnecessary heavy rendering
    if (!get().isSavingPages) set({ isSavingPages: true });
    debouncedFlushPageUpdates();
  };

  return {
  // Initial Status
  currentProject: null,
  isGlobalLoading: false,
  isSavingPages: false,
  activeTaskId: null,
  taskProgress: null,
  error: null,
  pageGeneratingTasks: {},
  warningMessage: null,
  isOutlineStreaming: false,
  outlineStreamingProjectIds: [],
  isDescriptionStreaming: false,
  templateAssets: [],

  // Setters
  setCurrentProject: (project) => set({ currentProject: project }),
  setGlobalLoading: (loading) => set({ isGlobalLoading: loading }),
  setError: (error) => set({ error }),

  // Initialization project
  initializeProject: async (type, content, templateImage, templateStyle, referenceFileIds, aspectRatio) => {
    set({ isGlobalLoading: true, error: null });
    try {
      const request: any = {};
      const normalizedContent = typeof content === 'string' ? content.trim() : '';

      if (type === 'blank') {
        // Blank items have no text content and must be clearly stated type
        request.creation_type = 'blank';
      } else if (type === 'idea') {
        request.idea_prompt = normalizedContent;
      } else if (type === 'outline') {
        request.outline_text = normalizedContent;
      } else if (type === 'description') {
        request.description_text = normalizedContent;
      }

      // Add style description (if available)）
      if (templateStyle && templateStyle.trim()) {
        request.template_style = templateStyle.trim();
      }

      // Add image ratio (if any)）
      if (aspectRatio) {
        request.image_aspect_ratio = aspectRatio;
      }

      // 1. Create Item
      const response = await api.createProject(request);
      const projectId = response.data?.project_id;

      if (!projectId) {
        throw new Error(t('store.createNoId'));
      }

      // 2. Link reference file to project (Ensure before generation) AI Read reference files）
      if (referenceFileIds && referenceFileIds.length > 0) {
        try {
          await Promise.all(
            referenceFileIds.map(fileId => api.associateFileToProject(fileId, projectId))
          );
          devLog(`[Initialization project] Association ${referenceFileIds.length} Reference document`);
        } catch (error) {
          console.warn('[Initialization project] Link reference file failed:', error);
        }
      }

      // 3. Upload template if you have a template picture
      if (templateImage) {
        try {
          await api.uploadTemplate(projectId, templateImage);
        } catch (error) {
          console.warn('Template upload failed:', error);
          // Template upload failure does not affect project creation, continue
        }
      }

      // 4. Gets full project information./Describe the entrance. AI Generates an outline page SSE Process takeover。
      const projectResponse = await api.getProject(projectId);
      const project = normalizeProject(projectResponse.data);

      if (project) {
        set({ currentProject: project });
        // Save To localStorage
        localStorage.setItem('currentProjectId', project.id!);
      }
    } catch (error: any) {
      set({ error: normalizeErrorMessage(error.message || t('store.createFailed')) });
      throw error;
    } finally {
      set({ isGlobalLoading: false });
    }
  },

  // Sync Project Data
  syncProject: async (projectId?: string) => {
    const { currentProject } = get();

    // If not provided projectId，Try From currentProject or localStorage Access
    let targetProjectId = projectId;
    if (!targetProjectId) {
      if (currentProject?.id) {
        targetProjectId = currentProject.id;
      } else {
        targetProjectId = localStorage.getItem('currentProjectId') || undefined;
      }
    }

    if (!targetProjectId) {
      console.warn('syncProject: No items available ID');
      return;
    }

    try {
      const response = await api.getProject(targetProjectId);
      if (response.data) {
        const project = normalizeProject(response.data);
        devLog('[syncProject] Sync Project Data:', {
          projectId: project.id,
          pagesCount: project.pages?.length || 0,
          status: project.status
        });
        set({ currentProject: project });
        // Ensure localStorage saved items in ID
        localStorage.setItem('currentProjectId', project.id!);
      }
    } catch (error: any) {
      // Extract more detailed error information
      let errorMessage = t('store.syncFailed');
      let shouldClearStorage = false;

      if (error.response) {
        // The server returned the error response
        const errorData = error.response.data;
        if (error.response.status === 404) {
          // 404 Error： Project does not exist, cleared localStorage
          errorMessage = errorData?.error?.message || t('store.projectNotFound');
          shouldClearStorage = true;
        } else if (errorData?.error?.message) {
          // Extract messages from backend error format
          errorMessage = errorData.error.message;
        } else if (errorData?.message) {
          errorMessage = errorData.message;
        } else if (errorData?.error) {
          errorMessage = typeof errorData.error === 'string' ? errorData.error : errorData.error.message || t('store.requestFailed');
        } else {
          errorMessage = t('store.requestFailedStatus', { status: error.response.status });
        }
      } else if (error.request) {
        // Request sent but no response received
        errorMessage = t('store.networkError');
      } else if (error.message) {
        // other errors
        errorMessage = error.message;
      }

      // If Project does not exist, Clear localStorage and reset the current item
      // Do not show errors toast，Because it’s usually an expired item discovered during automatic sync. ID
      if (shouldClearStorage) {
        console.warn('[syncProject] Project does not exist, clean localStorage');
        localStorage.removeItem('currentProjectId');
        set({ currentProject: null });
      } else {
        set({ error: normalizeErrorMessage(errorMessage) });
      }
    }
  },

  // Local update page (optimistic update)）
  updatePageLocal: (pageId, data) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const updatedPages = currentProject.pages.map((page) =>
      page.id === pageId ? { ...page, ...data } : page
    );

    set({
      currentProject: {
        ...currentProject,
        pages: updatedPages,
      },
    });

    // Call after shivering API
    debouncedUpdatePage(currentProject.project_id, pageId, data);
  },

  // Save all page changes immediately (for saving buttons)）
  // Waiting for the shivering to be completed and then synchronize the project status to ensure updated_at Update
  saveAllPages: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    // Waiting for the shaking delay（1 sec）+ Additional time to ensure API Call Completed
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Sync Project Status. This will get the latest from the backend. updated_at
    await get().syncProject(currentProject.project_id);
  },

  // Reorder Page
  reorderPages: async (newOrder) => {
    const { currentProject } = get();
    if (!currentProject) return;

    // Optimistic Update
    const reorderedPages = newOrder
      .map((id) => currentProject.pages.find((p) => p.id === id))
      .filter(Boolean) as any[];

    set({
      currentProject: {
        ...currentProject,
        pages: reorderedPages,
      },
    });

    try {
      await api.updatePagesOrder(currentProject.project_id, newOrder);
    } catch (error: any) {
      set({ error: error.message || t('store.updateOrderFailed') });
      // Sync after Failed
      await get().syncProject();
    }
  },

  // Add New Page
  addNewPage: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      const newPage = {
        outline_content: { title: t('store.newPage'), points: [] },
        order_index: currentProject.pages.length,
      };

      const response = await api.addPage(currentProject.project_id, newPage);
      if (response.data) {
        await get().syncProject();
      }
    } catch (error: any) {
      set({ error: error.message || t('store.addPageFailed') });
    }
  },

  // Delete Page
  deletePageById: async (pageId) => {
    const { currentProject } = get();
    if (!currentProject) return;

    try {
      await api.deletePage(currentProject.project_id, pageId);
      await get().syncProject();
    } catch (error: any) {
      set({ error: error.message || t('store.deletePageFailed') });
    }
  },

  // Start a staggered mission.
  startAsyncTask: async (apiCall) => {
    devLog('[Step-by-step mission] Start a staggered mission....');
    set({ isGlobalLoading: true, error: null });
    try {
      const response = await apiCall();
      devLog('[Step-by-step mission] API Response:', response);

      // task_id Yes. response.data Medium
      const taskId = response.data?.task_id;
      if (taskId) {
        devLog('[Step-by-step mission] Copy that. task_id:', taskId, 'Start a rotation....');
        set({ activeTaskId: taskId });
        await get().pollTask(taskId);
      } else {
        console.warn('[Step-by-step mission] No response. task_id，Could be a sync operation.:', response);
        // Refresh project data after the sync operation is completed
        await get().syncProject();
        set({ isGlobalLoading: false });
      }
    } catch (error: any) {
      console.error('[Step-by-step mission] Starting Failed:', error);
      set({ error: error.message || t('store.taskStartFailed'), isGlobalLoading: false });
      throw error;
    }
  },

  // Query Task Status
  pollTask: async (taskId) => {
    devLog(`[Rotation] Start a rotation.: ${taskId}`);
    const { currentProject } = get();
    if (!currentProject) {
      console.warn('[Rotation] No current item, stop Query');
      return;
    }
    const projectId = currentProject.id!;

    const poll = async () => {
      try {
        devLog(`[Rotation] Query Task Status: ${taskId}`);
        const response = await api.getTaskStatus(projectId, taskId);
        const task = response.data;

        if (!task) {
          console.warn('[Rotation] No task data in response');
          return;
        }

        // Update progress
        if (task.progress) {
          set({ taskProgress: task.progress });
        }

        devLog(`[Rotation] Task ${taskId} Status: ${task.status}`, task);

        // Check Task Status
        if (task.status === 'COMPLETED') {
          devLog(`[Rotation] Task ${taskId} Completed, update item data`);

          // Editable if Exportable PPTX Tasks, check for download links
          if (task.task_type === 'EXPORT_EDITABLE_PPTX' && task.progress) {
            const progress = typeof task.progress === 'string'
              ? JSON.parse(task.progress)
              : task.progress;

            const downloadUrl = progress?.download_url;
            if (downloadUrl) {
              devLog('[Export Editable PPTX] Fetch download links from task response:', downloadUrl);
              // Delay to make sure the status update is complete before opening the download link.
              setTimeout(() => {
                triggerDownload(downloadUrl);
              }, 500);
            } else {
              console.warn('[Export Editable PPTX] Task completed without downloading links');
            }
          }

          set({
            activeTaskId: null,
            taskProgress: null,
            isGlobalLoading: false
          });
          // Refresh Item Data
          await get().syncProject();
        } else if (task.status === 'FAILED') {
          console.error(`[Rotation] Task ${taskId} Failed:`, task.error_message || task.error);
          set({
            error: normalizeErrorMessage(task.error_message || task.error || t('store.taskFailed')),
            activeTaskId: null,
            taskProgress: null,
            isGlobalLoading: false
          });
        } else if (task.status === 'PENDING' || task.status === 'PROCESSING') {
          // We’ll continue our rounds.（PENDING or PROCESSING）
          devLog(`[Rotation] Task ${taskId} Processing，2 Continue the inquiry in seconds....`);
          setTimeout(poll, 2000);
        } else {
          // Unknown status, stop quizing
          console.warn(`[Rotation] Task ${taskId} Unknown status: ${task.status}，Stop Query`);
          set({
            error: `${t('store.unknownTaskStatus', { status: task.status })}`,
            activeTaskId: null,
            taskProgress: null,
            isGlobalLoading: false
          });
        }
      } catch (error: any) {
        console.error('Job Rotation Error:', error);
        set({
          error: normalizeErrorMessage(error.message || t('store.taskQueryFailed')),
          activeTaskId: null,
          isGlobalLoading: false
        });
      }
    };

    await poll();
  },

  // Generate outline (sync operation, no questioner required)）
  generateOutline: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isGlobalLoading: true, error: null });
    try {
      const response = await api.generateOutline(currentProject.id!);
      devLog('[Generate Outline] API Response:', response);

      // Refresh project data to ensure access to the latest outline page
      await get().syncProject();

      // Reconfirm the data as updated
      const { currentProject: updatedProject } = get();
      devLog('[Generate Outline] Refreshed Items:', updatedProject?.pages.length, 'Pages');
    } catch (error: any) {
      console.error('[Generate Outline] Error:', error);
      const message =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        t('store.generateOutlineFailed');
      set({ error: normalizeErrorMessage(message) });
      throw error;
    } finally {
      set({ isGlobalLoading: false });
    }
  },

  // Fluid Generating Outline（SSE，Page-by-page rendering）
  generateOutlineStream: async (lockPageCount?: boolean) => {
    const { currentProject } = get();
    const projectId = currentProject?.id;
    if (!currentProject || !projectId) return;

    if (get().outlineStreamingProjectIds.includes(projectId)) return;

    const finishStream = () => {
      set((state) => {
        const outlineStreamingProjectIds = state.outlineStreamingProjectIds.filter((id) => id !== projectId);
        return {
          outlineStreamingProjectIds,
          isOutlineStreaming: outlineStreamingProjectIds.length > 0,
        };
      });
    };
    const isViewingTargetProject = () => get().currentProject?.id === projectId;

    set((state) => ({
      outlineStreamingProjectIds: [...state.outlineStreamingProjectIds, projectId],
      isOutlineStreaming: true,
      error: null,
    }));

    // Clear existing pages for fresh streaming display
    set((state) => ({
      currentProject: state.currentProject?.id === projectId
        ? { ...state.currentProject, pages: [] }
        : state.currentProject,
    }));

    // Concurrent queue: pages are pushed by SSE callbacks, drained by a timer loop
    const pageQueue: any[] = [];
    let streamDone = false;
    const streamResult: { value: { total: number; pages: any[]; complete?: boolean } | null } = { value: null };
    const STAGGER_MS = 150;

    // Start the render loop — runs concurrently with the SSE stream
    const renderPromise = new Promise<void>((resolve) => {
      const tick = () => {
        if (pageQueue.length > 0) {
          const page = pageQueue.shift()!;
          const { currentProject: proj } = get();
          if (proj?.id === projectId) {
            const tempPage: any = {
              id: `streaming-${page.index}`,
              order_index: page.index,
              outline_content: { title: page.title, points: page.points },
              description_content: page.description_text
                ? { text: page.description_text, ...(page.extra_fields ? { extra_fields: page.extra_fields } : {}) }
                : undefined,
              part: page.part,
              status: page.description_text ? 'DESCRIPTION_GENERATED' : 'DRAFT',
            };
            set({
              currentProject: { ...proj, pages: [...proj.pages, tempPage] },
            });
          }
          setTimeout(tick, STAGGER_MS);
        } else if (streamDone) {
          resolve();
        } else {
          // Queue empty but stream still going — poll quickly
          setTimeout(tick, 30);
        }
      };
      tick();
    });

    try {
      await api.generateOutlineStream(projectId, {
        onPage: (page) => { pageQueue.push(page); },
        onDone: (data) => { streamResult.value = data; },
        onError: (message) => {
          console.error('[Fluid Outline] Error:', message);
          if (isViewingTargetProject()) {
            set({ error: normalizeErrorMessage(message) });
          }
          streamDone = true;
        },
      }, undefined /* language */, lockPageCount);

      streamDone = true;
      await renderPromise;

      // Replace temp pages with real persisted pages
      if (streamResult.value) {
        const { currentProject: proj } = get();
        if (proj?.id === projectId) {
          const normalized = normalizeProject({ ...proj, pages: streamResult.value.pages });
          set({ currentProject: normalized });
        }
        devLog('[Fluid Outline] Completed:', streamResult.value.total, 'Pages');
        return { complete: streamResult.value.complete ?? false, active: isViewingTargetProject() };
      } else {
        return { complete: false, active: isViewingTargetProject() };
      }
    } catch (error: any) {
      console.error('[Fluid Outline] Error:', error);
      streamDone = true;
      if (!isViewingTargetProject()) {
        // Toggled away from the project generated from the launch： expired failed to throw again to avoid a bullet in the item that was later opened
        return { complete: false, active: false };
      }
      set({ error: normalizeErrorMessage(error.message || t('store.generateOutlineFailed')) });
      throw error;
    } finally {
      finishStream();
    }
  },

  // Generate outline and page description from description (sync operation)）
  generateFromDescription: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isGlobalLoading: true, error: null });
    try {
      const response = await api.generateFromDescription(currentProject.id!);
      devLog('[Generate from Description] API Response:', response);

      // Update project data to ensure access to up-to-date outlines and descriptions
      await get().syncProject();

      // Reconfirm the data as updated
      const { currentProject: updatedProject } = get();
      devLog('[Generate from Description] Refreshed Items:', updatedProject?.pages.length, 'Pages');
    } catch (error: any) {
      console.error('[Generate from Description] Error:', error);
      set({ error: error.message || t('store.generateFromDescFailed') });
      throw error;
    } finally {
      set({ isGlobalLoading: false });
    }
  },

  // Generate description (select flow or parallel mode according to settings)）
  generateDescriptions: async (detailLevel?: string) => {
    const { currentProject } = get();
    if (!currentProject || !currentProject.project_id) return;

    const pages = currentProject.pages.filter((p) => p.id);
    if (pages.length === 0) return;

    // Check the profile generation mode with priority sessionStorage Cache Read to Avoid Extra API Call
    let mode: string = 'streaming';
    try {
      const cached = sessionStorage.getItem('banana-settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.description_generation_mode) {
          mode = parsed.description_generation_mode;
        }
      }
    } catch { /* ignore */ }

    if (mode === 'streaming') {
      // Fluid Mode
      set({ isDescriptionStreaming: true, error: null });

      const updatedPages = currentProject.pages.map((page) =>
        page.id ? { ...page, status: 'GENERATING_DESCRIPTION' as const } : page
      );
      set({ currentProject: { ...currentProject, pages: updatedPages } });

      // Concurrent queue + render loop (like outline streaming)
      const descQueue: api.DescriptionStreamEvent[] = [];
      let streamDone = false;
      const streamResult: { value: { total: number; pages: any[]; warning?: string } | null } = { value: null };
      const STAGGER_MS = 100;

      const renderPromise = new Promise<void>((resolve) => {
        const tick = () => {
          if (descQueue.length > 0) {
            const desc = descQueue.shift()!;
            const { currentProject: proj } = get();
            if (proj) {
              const updatedPages = proj.pages.map((page) => {
                if (page.id === desc.page_id) {
                  return {
                    ...page,
                    status: 'DESCRIPTION_GENERATED' as const,
                    description_content: {
                      text: desc.text,
                      ...(desc.extra_fields ? { extra_fields: desc.extra_fields } : {}),
                    },
                  };
                }
                return page;
              });
              set({ currentProject: { ...proj, pages: updatedPages } });
            }
            setTimeout(tick, STAGGER_MS);
          } else if (streamDone) {
            resolve();
          } else {
            setTimeout(tick, 30);
          }
        };
        tick();
      });

      try {
        await api.generateDescriptionsStream(currentProject.project_id, {
          onDescription: (data) => { descQueue.push(data); },
          onDone: (data) => { streamResult.value = data; },
          onError: (message) => {
            console.error('[Fluid Description] Error:', message);
            set({ error: normalizeErrorMessage(message) });
            streamDone = true;
          },
        }, undefined, detailLevel);

        streamDone = true;
        await renderPromise;

        if (streamResult.value) {
          const { currentProject: proj } = get();
          if (proj) {
            const normalized = normalizeProject({ ...proj, pages: streamResult.value.pages });
            set({
              currentProject: normalized,
              isDescriptionStreaming: false,
              ...(streamResult.value.warning ? { error: streamResult.value.warning } : {}),
            });
          }
          devLog('[Fluid Description] Completed:', streamResult.value.total, 'Pages');
        } else {
          // None streamResult.value（SSE error Interrupted or connected）→ Restore real status from backend
          await get().syncProject();
          set({ isDescriptionStreaming: false });
        }
      } catch (error: any) {
        console.error('[Fluid Description] Error:', error);
        streamDone = true;
        await get().syncProject();
        set({
          error: normalizeErrorMessage(error.message || t('store.generateDescFailed')),
          isDescriptionStreaming: false,
        });
        throw error;
      }
    } else {
      // Parallel mode (old logic)）
      set({ error: null });

      const updatedPages = currentProject.pages.map((page) =>
        page.id ? { ...page, status: 'GENERATING_DESCRIPTION' as const } : page
      );
      set({ currentProject: { ...currentProject, pages: updatedPages } });

      try {
        const projectId = currentProject.project_id;
        if (!projectId) {
          throw new Error(t('store.projectIdMissing'));
        }

        const response = await api.generateDescriptions(projectId, undefined, detailLevel);
        const taskId = response.data?.task_id;

        if (!taskId) {
          throw new Error(t('store.noTaskId'));
        }

        let pollErrors = 0;
        const pollAndSync = async () => {
          try {
            const taskResponse = await api.getTaskStatus(projectId, taskId);
            const task = taskResponse.data;

            if (task) {
              if (task.progress) {
                set({ taskProgress: task.progress });
              }

              await get().syncProject();

              if (task.status === 'COMPLETED') {
                set({ taskProgress: null, activeTaskId: null });
                await get().syncProject();
              } else if (task.status === 'FAILED') {
                set({
                  taskProgress: null,
                  activeTaskId: null,
                  error: normalizeErrorMessage(task.error_message || task.error || t('store.generateDescFailed'))
                });
                await get().syncProject();
              } else if (task.status === 'PENDING' || task.status === 'PROCESSING') {
                setTimeout(pollAndSync, 2000);
              }
            }
          } catch (error: any) {
            console.error('[Generate Description] Query error:', error);
            pollErrors++;
            if (pollErrors >= 10) {
              console.error('[Generate Description] Too many bugs. Stop.');
              set({
                taskProgress: null,
                activeTaskId: null,
                error: normalizeErrorMessage(error.message || t('store.generateDescTimeout'))
              });
              await get().syncProject();
              return;
            }
            await get().syncProject();
            setTimeout(pollAndSync, 2000);
          }
        };

        setTimeout(pollAndSync, 2000);

      } catch (error: any) {
        console.error('[Generate Description] Failed to start task:', error);
        await get().syncProject();
        set({ error: normalizeErrorMessage(error.message || t('store.startGenerationFailed')) });
        throw error;
      }
    }
  },

  // Generate a single page description
  generatePageDescription: async (pageId: string, detailLevel?: string) => {
    const { currentProject } = get();
    if (!currentProject) return;

    // If this page is being generated, do not duplicate
    const targetPage = currentProject.pages.find((p) => p.id === pageId);
    if (targetPage?.status === 'GENERATING_DESCRIPTION') {
      devLog(`[Generate Description] Page ${pageId} Generating, skipping duplicate requests`);
      return;
    }

    set({ error: null });

    // Optimistic update： set the page status to GENERATING_DESCRIPTION
    const updatedPages = currentProject.pages.map((page) =>
      page.id === pageId ? { ...page, status: 'GENERATING_DESCRIPTION' as const } : page
    );
    set({ currentProject: { ...currentProject, pages: updatedPages } });

    try {
      const response = await api.generatePageDescription(currentProject.project_id, pageId, true, undefined, detailLevel);

      if (response.data) {
        const updatedPageData = response.data;
        const { currentProject: latestProject } = get();
        if (latestProject) {
          const newPages = latestProject.pages.map((page) =>
            page.id === pageId ? { ...page, ...updatedPageData } : page
          );
          set({ currentProject: { ...latestProject, pages: newPages } });
          devLog(`[Generate Description] Page ${pageId} Description updated, data from API Response`);
        }
      }
    } catch (error: any) {
      // Restore Page Status
      await get().syncProject();
      set({ error: normalizeErrorMessage(error.message || t('store.generateDescFailed')) });
      throw error;
    }
  },

  // Regenerated PPT Single page of the renovation project (resolved) PDF And extract the content.）
  regenerateRenovationPage: async (pageId: string, keepLayout: boolean = false) => {
    const { currentProject } = get();
    if (!currentProject) return;

    // If this page is being generated, do not duplicate
    const targetPage = currentProject.pages.find((p) => p.id === pageId);
    if (targetPage?.status === 'GENERATING_DESCRIPTION') {
      devLog(`[PPT Renovation] Page ${pageId} Generating, skipping duplicate requests`);
      return;
    }

    set({ error: null });

    // Optimistic update： set the page status to GENERATING_DESCRIPTION
    const updatedPages = currentProject.pages.map((page) =>
      page.id === pageId ? { ...page, status: 'GENERATING_DESCRIPTION' as const } : page
    );
    set({ currentProject: { ...currentProject, pages: updatedPages } });

    try {
      const response = await api.regenerateRenovationPage(currentProject.project_id, pageId, keepLayout);

      if (response.data) {
        const updatedPageData = response.data;
        const { currentProject: latestProject } = get();
        if (latestProject) {
          const newPages = latestProject.pages.map((page) =>
            page.id === pageId ? { ...page, ...updatedPageData } : page
          );
          set({ currentProject: { ...latestProject, pages: newPages } });
          devLog(`[PPT Renovation] Page ${pageId} Outline and description updated`);
        }
      }
    } catch (error: any) {
      await get().syncProject();
      set({ error: normalizeErrorMessage(error.message || t('store.regenerateFailed')) });
      throw error;
    }
  },

  // Generate single-page pictures (manual regeneration for preview pages)）
  generatePageImage: async (pageId: string, forceRegenerate: boolean = false) => {
    const { currentProject } = get();
    if (!currentProject) return;

    if (get().pageGeneratingTasks[pageId]) {
      devLog(`[Single Page Generation] Page ${pageId} Generating, skipping duplicate requests`);
      return;
    }

    set({ error: null, warningMessage: null });

    try {
      const response = await api.generatePageImage(currentProject.project_id, pageId, forceRegenerate);
      const taskId = response.data?.task_id;

      if (taskId) {
        devLog(`[Single Page Generation] Copy that. task_id: ${taskId}，Start Query Page ${pageId}`);
        set((state) => ({
          pageGeneratingTasks: {
            ...state.pageGeneratingTasks,
            [pageId]: taskId,
          },
        }));

        await get().syncProject();
        get().pollImageTask(taskId, [pageId]);
      } else {
        await get().syncProject();
      }
    } catch (error: any) {
      console.error('[Single Page Generation] Starting Failed:', error);
      await get().syncProject();
      throw error;
    }
  },

  // Generate pictures (without blocking, each page shows the generation status)）
  generateImages: async (pageIds?: string[]) => {
    const { currentProject, pageGeneratingTasks } = get();
    if (!currentProject) return;

    // Determines the page to be generated ID List
    const targetPageIds = pageIds || currentProject.pages.map(p => p.id).filter((id): id is string => !!id);

    // Check if pages are being generated
    const alreadyGenerating = targetPageIds.filter(id => pageGeneratingTasks[id]);
    if (alreadyGenerating.length > 0) {
      devLog(`[Batch Generation] ${alreadyGenerating.length} A page is being generated, skipping`);
      // Filters already generated pages
      const newPageIds = targetPageIds.filter(id => !pageGeneratingTasks[id]);
      if (newPageIds.length === 0) {
        devLog('[Batch Generation] All pages are being generated, skipping requests');
        return;
      }
    }

    set({ error: null, warningMessage: null });

    try {
      // Call Bulk Generation API
      const response = await api.generateImages(currentProject.project_id, undefined, pageIds);
      const taskId = response.data?.task_id;

      if (taskId) {
        devLog(`[Batch Generation] Copy that. task_id: ${taskId}，Tags ${targetPageIds.length} Pages are being generated`);

        // Set Tasks for All Destination Pages ID
        const newPageGeneratingTasks = { ...pageGeneratingTasks };
        targetPageIds.forEach(id => {
          newPageGeneratingTasks[id] = taskId;
        });
        set({ pageGeneratingTasks: newPageGeneratingTasks });

        // Synchronize the project data immediately to get the backend settings 'QUEUED' Status
        await get().syncProject();

        // Commence bulk task rotation (non-obstruction)）
        get().pollImageTask(taskId, targetPageIds);
      } else {
        // If you do not return task_id，It’s probably a sync interface. It’s just refreshing.
        await get().syncProject();
      }
    } catch (error: any) {
      console.error('[Batch Generation] Starting Failed:', error);
      throw error;
    }
  },

  // Query image generation tasks (non-stop, support single pages and batches)）
  pollImageTask: async (taskId: string, pageIds: string[]) => {
    const { currentProject } = get();
    if (!currentProject) {
      console.warn('[Batch Rotation] No current item, stop Query');
      return;
    }
    const projectId = currentProject.id!;

    const poll = async () => {
      try {
        const response = await api.getTaskStatus(projectId, taskId);
        const task = response.data;

        if (!task) {
          console.warn('[Batch Rotation] No task data in response');
          return;
        }

        devLog(`[Batch Rotation] Task ${taskId} Status: ${task.status}`, task.progress);

        // Check Task Status
        if (task.status === 'COMPLETED') {
          devLog(`[Batch Rotation] Task ${taskId} Completed, clear task logs`);
          // Clears the task log for all relevant pages
          const { pageGeneratingTasks } = get();
          const newTasks = { ...pageGeneratingTasks };
          pageIds.forEach(id => {
            if (newTasks[id] === taskId) {
              delete newTasks[id];
            }
          });

          // Extract warning messages (if any)）
          const warningMessage = task.progress?.warning_message || null;

          set({ pageGeneratingTasks: newTasks, warningMessage });

          // Refresh the project data and verify that the picture path has been updated
          // Use a re-test mechanism to ensure data synchronization
          let retryCount = 0;
          const maxRetries = 5;
          const retryDelay = 1000; // 1 sec

          const syncWithRetry = async (): Promise<void> => {
            await get().syncProject();

            // Verify that the photo path of all pages has been updated
            const { currentProject: updatedProject } = get();
            if (updatedProject) {
              const allImagesReady = pageIds.every(pageId => {
                const page = updatedProject.pages.find(p => p.id === pageId);
                return page?.generated_image_path;
              });

              if (allImagesReady) {
                devLog(`[Batch Rotation] All picture paths are synchronized`);
                return;
              }

              if (retryCount < maxRetries) {
                retryCount++;
                devLog(`[Batch Rotation] The picture path is not fully synchronized，${retryDelay}ms Try again after (${retryCount}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return syncWithRetry();
              } else {
                console.warn(`[Batch Rotation] Maximum number of retries reached, part of the picture path may not be synchronized`);
              }
            }
          };

          await syncWithRetry();
        } else if (task.status === 'FAILED') {
          console.error(`[Batch Rotation] Task ${taskId} Failed:`, task.error_message || task.error);
          // Clears the task log for all relevant pages
          const { pageGeneratingTasks } = get();
          const newTasks = { ...pageGeneratingTasks };
          pageIds.forEach(id => {
            if (newTasks[id] === taskId) {
              delete newTasks[id];
            }
          });
          set({
            pageGeneratingTasks: newTasks,
            error: normalizeErrorMessage(task.error_message || task.error || t('store.batchGenerateFailed'))
          });
          // Refresh project data to update page status
          await get().syncProject();
        } else if (task.status === 'PENDING' || task.status === 'PROCESSING') {
          // Check Warning Messages
          const newWarning = task.progress?.warning_message;
          if (newWarning && get().warningMessage !== newWarning) {
            set({ warningMessage: newWarning });
          }
          // Continue the Query and synchronize the project data to update the page status
          devLog(`[Batch Rotation] Task ${taskId} Processing, synchronization of project data...`);
          await get().syncProject();

          // Release completed pages on a case-by-case basis so that thumbnails are displayed immediately
          const { currentProject: proj, pageGeneratingTasks: pgt } = get();
          if (proj) {
            const updated = { ...pgt };
            let changed = false;
            pageIds.forEach(id => {
              if (updated[id] === taskId) {
                const page = proj.pages.find(p => p.id === id);
                // Only finished or failed pages will be released to avoid misleashing pages that have not been picked up by the thread pool
                // （Unfinished Pages DESCRIPTION_GENERATED，No early release）
                if (page && (page.status === 'COMPLETED' || page.status === 'FAILED')) {
                  delete updated[id];
                  changed = true;
                }
              }
            });
            if (changed) set({ pageGeneratingTasks: updated });
          }

          devLog(`[Batch Rotation] Task ${taskId} Processing，2 Continue the inquiry in seconds....`);
          setTimeout(poll, 2000);
        } else {
          // Unknown status, stop quizing
          console.warn(`[Batch Rotation] Task ${taskId} Unknown status: ${task.status}，Stop Query`);
          const { pageGeneratingTasks } = get();
          const newTasks = { ...pageGeneratingTasks };
          pageIds.forEach(id => {
            if (newTasks[id] === taskId) {
              delete newTasks[id];
            }
          });
          set({ pageGeneratingTasks: newTasks });
        }
      } catch (error: any) {
        console.error('[Batch Rotation] Query error:', error);
        // Clears the task log for all relevant pages
        const { pageGeneratingTasks } = get();
        const newTasks = { ...pageGeneratingTasks };
        pageIds.forEach(id => {
          if (newTasks[id] === taskId) {
            delete newTasks[id];
          }
        });
        set({ pageGeneratingTasks: newTasks });
      }
    };

    // Start a rotation (no) await，Return to Jean immediately. UI Keep responding.）
    poll();
  },

  // Edit Page Pictures (Step Out)）
  editPageImage: async (pageId, editPrompt, contextImages) => {
    const { currentProject, pageGeneratingTasks } = get();
    if (!currentProject) return;

    // If this page is being generated, do not duplicate
    if (pageGeneratingTasks[pageId]) {
      devLog(`[Edit] Page ${pageId} Generating, skipping duplicate requests`);
      return;
    }

    set({ error: null });
    try {
      const response = await api.editPageImage(currentProject.project_id, pageId, editPrompt, contextImages);
      const taskId = response.data?.task_id;

      if (taskId) {
        // Tasks to record the page ID
        set({
          pageGeneratingTasks: { ...pageGeneratingTasks, [pageId]: taskId }
        });

        // Synchronize the project data immediately to get the backend settings'GENERATING'Status
        await get().syncProject();

        // Start a rotation (use a uniform inquiry function)）
        get().pollImageTask(taskId, [pageId]);
      } else {
        // If you do not return task_id，It’s probably a sync interface. It’s just refreshing.
        await get().syncProject();
      }
    } catch (error: any) {
      // Clear Job Record for this page
      const { pageGeneratingTasks } = get();
      const newTasks = { ...pageGeneratingTasks };
      delete newTasks[pageId];
      set({ pageGeneratingTasks: newTasks, error: normalizeErrorMessage(error.response?.data?.error?.message || error.message || t('store.editImageFailed')) });
      throw error;
    }
  },

  // Export PPTX
  exportPPTX: async (pageIds?: string[]) => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isGlobalLoading: true, error: null });
    try {
      const response = await api.exportPPTX(currentProject.project_id, pageIds);
      // Prioritize relative paths, avoid Docker Port problem in the environment
      const downloadUrl =
        response.data?.download_url || response.data?.download_url_absolute;

      if (!downloadUrl) {
        throw new Error(t('store.exportLinkFailed'));
      }

      const filename = downloadUrl.split('/').pop()?.split('?')[0] || 'presentation.pptx';
      // Direct download using browser or desktop primary saving dialogue to avoid axios Bandwidth and overtime.
      triggerDownload(downloadUrl, filename);
    } catch (error: any) {
      set({ error: error.message || t('store.exportFailed') });
    } finally {
      set({ isGlobalLoading: false });
    }
  },

  // Export PDF
  exportPDF: async (pageIds?: string[]) => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isGlobalLoading: true, error: null });
    try {
      const response = await api.exportPDF(currentProject.project_id, pageIds);
      // Prioritize relative paths, avoid Docker Port problem in the environment
      const downloadUrl =
        response.data?.download_url || response.data?.download_url_absolute;

      if (!downloadUrl) {
        throw new Error(t('store.exportLinkFailed'));
      }

      const filename = downloadUrl.split('/').pop()?.split('?')[0] || 'presentation.pdf';
      // Direct download using browser or desktop primary saving dialogue to avoid axios Bandwidth and overtime.
      triggerDownload(downloadUrl, filename);
    } catch (error: any) {
      set({ error: error.message || t('store.exportFailed') });
    } finally {
      set({ isGlobalLoading: false });
    }
  },

  // Export Editable PPTX（Step-by-step mission）
  exportEditablePPTX: async (filename?: string, pageIds?: string[]) => {
    const { currentProject, startAsyncTask } = get();
    if (!currentProject) return;

    try {
      devLog('[Export Editable PPTX] Start a walk-out task...');
      // startAsyncTask Medium pollTask Automatically process downloads when the task is completed
      await startAsyncTask(() => api.exportEditablePPTX(currentProject.project_id, filename, pageIds));
      devLog('[Export Editable PPTX] The stethoscope is complete.');
    } catch (error: any) {
      console.error('[Export Editable PPTX] Export failed:', error);
      set({ error: error.message || t('store.exportEditableFailed') });
    }
  },

  // ===== Templates per Page（per-page template）=====

  loadTemplateAssets: async (projectId) => {
    const response = await api.listTemplateAssets(projectId);
    const assets = response.data?.assets || [];
    set({ templateAssets: assets });
    return assets;
  },

  uploadTemplateAsset: async (projectId, file, opts) => {
    const response = await api.uploadTemplateAsset(projectId, file, opts);
    const asset = response.data!.asset;
    const analyzeTaskId = response.data!.analyze_task_id;
    set((state) => ({ templateAssets: [...state.templateAssets, asset] }));
    // Inquiries conducted backstage, completed./Refresh the template library after failure to avoid the ”decomposing” badge remaining until manually refreshed。
    // Losing also refreshs, Jean. 'failed' Status emerges; user removes items without refreshing to avoid covering the template library of new items。
    if (analyzeTaskId) {
      const refreshIfCurrent = () => {
        const cur = get().currentProject;
        if (cur && cur.id === projectId) {
          get().loadTemplateAssets(projectId).catch(() => {});
        }
      };
      get()
        .pollTemplateTask(analyzeTaskId, projectId)
        .then(refreshIfCurrent)
        .catch(refreshIfCurrent);
    }
    // Sync Locally When Bind to Page page Field
    if (opts?.bindToPageId) {
      const { currentProject } = get();
      if (currentProject) {
        set({
          currentProject: {
            ...currentProject,
            pages: currentProject.pages.map((p) =>
              (p.id === opts.bindToPageId || p.page_id === opts.bindToPageId)
                ? {
                    ...p,
                    template_asset_id: asset.id,
                    template_selection_source: 'manual',
                    template_match_reason: null,
                    template_match_confidence: null,
                  }
                : p
            ),
          },
        });
      }
    }
    return asset;
  },

  uploadTemplatePdf: async (projectId, file) => {
    const response = await api.uploadTemplatePdf(projectId, file);
    return response.data!.task_id;
  },

  updateTemplateAsset: async (projectId, assetId, patch) => {
    const response = await api.updateTemplateAsset(projectId, assetId, patch);
    const updated = response.data!.asset;
    set((state) => ({
      templateAssets: state.templateAssets.map((a) => (a.id === assetId ? updated : a)),
    }));
    return updated;
  },

  deleteTemplateAsset: async (projectId, assetId) => {
    const response = await api.deleteTemplateAsset(projectId, assetId);
    const clearedPageIds = response.data?.cleared_page_ids || [];
    set((state) => ({
      templateAssets: state.templateAssets.filter((a) => a.id !== assetId),
    }));
    // Optimistic Update： Empty emptied page fields
    if (clearedPageIds.length > 0) {
      const { currentProject } = get();
      if (currentProject) {
        const cleared = new Set(clearedPageIds);
        set({
          currentProject: {
            ...currentProject,
            pages: currentProject.pages.map((p) => {
              const pid = p.id || p.page_id;
              return pid && cleared.has(pid)
                ? {
                    ...p,
                    template_asset_id: null,
                    template_selection_source: null,
                    template_match_reason: null,
                    template_match_confidence: null,
                  }
                : p;
            }),
          },
        });
      }
    }
    return clearedPageIds;
  },

  reanalyzeTemplateAsset: async (projectId, assetId) => {
    const response = await api.reanalyzeTemplateAsset(projectId, assetId);
    // Optimistic update： asset Status Settings pending
    set((state) => ({
      templateAssets: state.templateAssets.map((a) =>
        a.id === assetId ? { ...a, analysis_status: 'pending', analysis_error: null } : a
      ),
    }));
    return response.data!.analyze_task_id;
  },

  updatePageTemplate: async (projectId, pageId, patch) => {
    const response = await api.updatePageTemplate(projectId, pageId, patch);
    const updatedPage = response.data?.page;
    const { currentProject } = get();
    if (currentProject && updatedPage) {
      set({
        currentProject: {
          ...currentProject,
          pages: currentProject.pages.map((p) =>
            (p.id === pageId || p.page_id === pageId)
              ? { ...p, ...updatedPage, id: p.id, page_id: p.page_id }
              : p
          ),
        },
      });
    }
  },

  switchTemplateMode: async (projectId, payload) => {
    await api.switchTemplateMode(projectId, payload);
    // Mode Switches Possible Batch Rewrite All Pages to Refresh the Project
    await get().syncProject(projectId);
  },

  switchTemplateModeWithUpload: async (projectId, file, unifiedStyleText) => {
    const response = await api.switchTemplateModeSingleWithUpload(projectId, file, unifiedStyleText);
    const asset = response.data?.asset;
    if (asset) {
      set((state) => ({ templateAssets: [...state.templateAssets, asset] }));
    }
    await get().syncProject(projectId);
  },

  autoMatchAll: async (projectId, opts) => {
    const response = await api.autoMatchAllTemplates(projectId, opts);
    return response.data!.task_id;
  },

  autoMatchPage: async (projectId, pageId) => {
    const response = await api.autoMatchPageTemplate(projectId, pageId);
    return response.data!.task_id;
  },

  // Query tasks associated with the template (deparation) / PDF Open Pages / Automatically matching) when completed or failed resolve。
  // No contamination of the whole area. activeTaskId/taskProgress，It’s easy to carry out multiple tasks.。
  pollTemplateTask: async (taskId, projectId, onProgress) => {
    // Cap the loop so a stuck/dead worker can't poll forever (~15 min).
    const MAX_ATTEMPTS = 450;
    // Tolerate a few transient network errors before giving up.
    const MAX_CONSECUTIVE_ERRORS = 5;
    return new Promise<Task>((resolve, reject) => {
      let attempts = 0;
      let consecutiveErrors = 0;
      const poll = async () => {
        // Stop polling if the user navigated to a different project so we
        // don't keep firing requests for a screen that's no longer visible.
        const { currentProject } = get();
        if (!currentProject || currentProject.id !== projectId) {
          reject(new Error('Project changed, polling stopped'));
          return;
        }
        if (attempts++ >= MAX_ATTEMPTS) {
          reject(new Error(t('store.taskFailed')));
          return;
        }
        try {
          const response = await api.getTaskStatus(projectId, taskId);
          consecutiveErrors = 0;
          const task = response.data;
          if (!task) {
            setTimeout(poll, 2000);
            return;
          }
          if (onProgress) onProgress(task);
          if (task.status === 'COMPLETED') {
            resolve(task);
          } else if (task.status === 'FAILED') {
            reject(new Error(task.error_message || task.error || t('store.taskFailed')));
          } else {
            setTimeout(poll, 2000);
          }
        } catch (error: any) {
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            reject(error);
          } else {
            setTimeout(poll, 2000);
          }
        }
      };
      poll();
    });
  },
};});
