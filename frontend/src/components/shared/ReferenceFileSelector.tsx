import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Upload, X, Loader2, CheckCircle2, XCircle, RefreshCw, ArrowUpDown, AlertTriangle, Lightbulb } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { Button, useToast, Modal } from '@/components/shared';

// ReferenceFileSelector Component contains translation
const referenceFileSelectorI18n = {
  zh: {
    referenceFile: {
      title: "Select Reference Files", totalFiles: "{{count}} files", noFiles: "No files",
      selectedCount: "{{count}} selected", allAttachments: "All Attachments", unclassified: "Unclassified",
      currentProjectAttachments: "Current Project Attachments", uploadedFiles: "Uploaded Files",
      refreshList: "Refresh List", imageLoadFailed: "Image load failed",
      parseStatus: { pending: "Pending", parsing: "Parsing...", completed: "Completed", failed: "Failed" },
      reparse: "Reparse", removeFromProject: "Remove from Project", deleteFile: "Delete File",
      uploading: "Uploading...", uploadFile: "Upload File", clearSelection: "Clear Selection",
      loading: "Loading...", noRefFiles: "No reference files", noRefFilesHint: "Click \"Upload File\" to add files",
      parseOnConfirm: "(parse on confirm)", imageCaptionFailed: "{{count}} image(s) failed to generate captions",
      autoParseHint: "Selecting unparsed files will automatically start parsing",
      cancel: "Cancel", confirm: "Confirm",
      sortBy: "Sort", sortNewest: "Newest First", sortOldest: "Oldest First", sortNameAsc: "Name A-Z", sortNameDesc: "Name Z-A",
      messages: {
        loadFailed: "Failed to load reference file list", uploadSuccess: "Successfully uploaded {{count}} file(s)", uploadFailed: "Failed to upload file",
        cannotDelete: "Cannot delete: Missing file ID", deleteSuccess: "File deleted successfully", deleteFailed: "Failed to delete file",
        selectAtLeastOne: "Please select at least one file", selectValid: "Please select valid files",
        maxSelection: "Maximum {{count}} files can be selected",
        parseTriggered: "Triggered parsing for {{count}} file(s), will process in background", parseFailed: "Failed to trigger file parsing"
      }
    },
    shared: { pptTip: "Tip: Convert PPT to PDF for better parsing results" }
  },
  en: {
    referenceFile: {
      title: "Select Reference Files", totalFiles: "{{count}} files", noFiles: "No files",
      selectedCount: "{{count}} selected", allAttachments: "All Attachments", unclassified: "Unclassified",
      currentProjectAttachments: "Current Project Attachments", uploadedFiles: "Uploaded Files",
      refreshList: "Refresh List", imageLoadFailed: "Image load failed",
      parseStatus: { pending: "Pending", parsing: "Parsing...", completed: "Completed", failed: "Failed" },
      reparse: "Reparse", removeFromProject: "Remove from Project", deleteFile: "Delete File",
      uploading: "Uploading...", uploadFile: "Upload File", clearSelection: "Clear Selection",
      loading: "Loading...", noRefFiles: "No reference files", noRefFilesHint: "Click \"Upload File\" to add files",
      parseOnConfirm: "(parse on confirm)", imageCaptionFailed: "{{count}} image(s) failed to generate captions",
      autoParseHint: "Selecting unparsed files will automatically start parsing",
      cancel: "Cancel", confirm: "Confirm",
      sortBy: "Sort", sortNewest: "Newest First", sortOldest: "Oldest First", sortNameAsc: "Name A-Z", sortNameDesc: "Name Z-A",
      messages: {
        loadFailed: "Failed to load reference file list", uploadSuccess: "Successfully uploaded {{count}} file(s)", uploadFailed: "Failed to upload file",
        cannotDelete: "Cannot delete: Missing file ID", deleteSuccess: "File deleted successfully", deleteFailed: "Failed to delete file",
        selectAtLeastOne: "Please select at least one file", selectValid: "Please select valid files",
        maxSelection: "Maximum {{count}} files can be selected",
        parseTriggered: "Triggered parsing for {{count}} file(s), will process in background", parseFailed: "Failed to trigger file parsing"
      }
    },
    shared: { pptTip: "Tip: Convert PPT to PDF for better parsing results" }
  }
};
import {
  listProjectReferenceFiles,
  uploadReferenceFile,
  deleteReferenceFile,
  getReferenceFile,
  triggerFileParse,
  listProjects,
  type ReferenceFile,
} from '@/api/endpoints';
import type { Project } from '@/types';

interface ReferenceFileSelectorProps {
  projectId?: string | null; // Optional, use global files if not available
  isOpen: boolean;
  onClose: () => void;
  onSelect: (files: ReferenceFile[]) => void;
  multiple?: boolean; // Whether to support multiple selection
  maxSelection?: number; // Maximum number of options
  initialSelectedIds?: string[]; // Initial Selected Files ID List
}

/**
 * Reference File Selector Component
 * - Browse all reference documents under the item
 * - Support singles/Multiple Selections
 * - Support for uploading local files
 * - Support selection from the file library (resolved direct, unsolved selected on-site)）
 * - Supports the deletion of files
 */
export const ReferenceFileSelector: React.FC<ReferenceFileSelectorProps> = React.memo(({
  projectId: _projectId,
  isOpen,
  onClose,
  onSelect,
  multiple = true,
  maxSelection,
  initialSelectedIds = [],
}) => {
  const t = useT(referenceFileSelectorI18n);
  const { show } = useToast();
  const [files, setFiles] = useState<ReferenceFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsingIds, setParsingIds] = useState<Set<string>>(new Set());
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name-asc' | 'name-desc'>('newest');
  const [projects, setProjects] = useState<Project[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialSelectedIdsRef = useRef(initialSelectedIds);
  const showRef = useRef(show);

  // Update ref to keep up-to-date values and avoid adding them to dependent arrays leading to unlimited cycles
  useEffect(() => {
    initialSelectedIdsRef.current = initialSelectedIds;
    showRef.current = show;
  }, [initialSelectedIds, show]);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      // Based on filterProjectId Decide which documents to search for.
      // 'all' - All files (global) + Item）
      // 'none' - Query only unclassified files (global files)，project_id=None）
      // Item ID - Query only files for the item
      const targetProjectId = filterProjectId === 'all' ? 'all' : filterProjectId === 'none' ? 'none' : filterProjectId;
      const response = await listProjectReferenceFiles(targetProjectId);

      if (response.data?.files) {
        // Merge the list of old and new files to avoid the loss of the parsing file
        setFiles(prev => {
          const fileMap = new Map<string, ReferenceFile>();
          const serverFiles = response.data!.files; // It’s been checked. response.data?.files

          // Add files returned by the server first (these are authoritative data)）
          serverFiles.forEach((f: ReferenceFile) => {
            fileMap.set(f.id, f);
          });

          // Then add the parsed file (probably the server has not updated the status)）
          prev.forEach(f => {
            if (parsingIds.has(f.id) && !fileMap.has(f.id)) {
              fileMap.set(f.id, f);
            }
          });

          return Array.from(fileMap.values());
        });
      }
    } catch (error: any) {
      console.error('Failed to load list of reference files:', error);
      showRef.current({
        message: error?.response?.data?.error?.message || error.message || t('referenceFile.messages.loadFailed'),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [filterProjectId, parsingIds]);

  // Load projects list
  useEffect(() => {
    if (isOpen) {
      listProjects().then(response => {
        if (response.data?.projects) {
          setProjects(response.data.projects);
        }
      }).catch(error => {
        console.error('Failed to load projects:', error);
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
      setSelectedFiles(new Set(initialSelectedIdsRef.current));
    }
  }, [isOpen, filterProjectId, loadFiles]);

  // Query Resolution Status
  useEffect(() => {
    if (!isOpen || parsingIds.size === 0) return;

    const intervalId = setInterval(async () => {
      const idsToCheck = Array.from(parsingIds);
      const updatedFiles: ReferenceFile[] = [];
      const completedIds: string[] = [];

      for (const fileId of idsToCheck) {
        try {
          const response = await getReferenceFile(fileId);
          if (response.data?.file) {
            const updatedFile = response.data.file;
            updatedFiles.push(updatedFile);

            // Mark as completed if parsing complete or failed
            if (updatedFile.parse_status === 'completed' || updatedFile.parse_status === 'failed') {
              completedIds.push(fileId);
            }
          }
        } catch (error) {
          console.error(`Failed to poll file ${fileId}:`, error);
        }
      }

      // Batch update file list
      if (updatedFiles.length > 0) {
        setFiles(prev => {
          const fileMap = new Map(prev.map(f => [f.id, f]));
          updatedFiles.forEach(uf => fileMap.set(uf.id, uf));
          return Array.from(fileMap.values());
        });
      }

      // Remove completed files from the Query List
      if (completedIds.length > 0) {
        setParsingIds(prev => {
          const newSet = new Set(prev);
          completedIds.forEach(id => newSet.delete(id));
          return newSet;
        });
      }
    }, 2000); // Every 2 I’ll do it in a second.

    return () => clearInterval(intervalId);
  }, [isOpen, parsingIds]);

  const handleSelectFile = (file: ReferenceFile) => {
    // Allow selection of files for all states (includes) pending and parsing）
    // pending The file triggers the resolution when it’s determined.
    // parsing The files will be ready for resolution.

    if (multiple) {
      const newSelected = new Set(selectedFiles);
      if (newSelected.has(file.id)) {
        newSelected.delete(file.id);
      } else {
        if (maxSelection && newSelected.size >= maxSelection) {
          show({
            message: t('referenceFile.messages.maxSelection', { count: maxSelection }),
            type: 'info',
          });
          return;
        }
        newSelected.add(file.id);
      }
      setSelectedFiles(newSelected);
    } else {
      setSelectedFiles(new Set([file.id]));
    }
  };

  const handleConfirm = async () => {
    const selected = files.filter((f) => selectedFiles.has(f.id));

    if (selected.length === 0) {
      show({ message: t('referenceFile.messages.selectAtLeastOne'), type: 'info' });
      return;
    }

    // Check if unsolved files need to trigger resolution
    const unparsedFiles = selected.filter(f => f.parse_status === 'pending' || f.parse_status === 'failed');

    if (unparsedFiles.length > 0) {
      // Trigger the resolution of unsolved files, but return immediately (no waiting)）
      try {
        show({
          message: t('referenceFile.messages.parseTriggered', { count: unparsedFiles.length }),
          type: 'success',
        });

        // Trigger the resolution of all unsolved files (without waiting for completion)）
        unparsedFiles.forEach(file => {
          triggerFileParse(file.id).catch(error => {
            console.error(`Trigger File ${file.filename} Parsing failed:`, error);
          });
        });

        // Return all selected files immediately (including pending Status）
        onSelect(selected);
        onClose();
      } catch (error: any) {
        console.error('Trigger file resolution failed:', error);
        show({
        message: error?.response?.data?.error?.message || error.message || t('referenceFile.messages.parseFailed'),
          type: 'error',
        });
      }
    } else {
      // All files have been or are in the process of being deciphered, with direct confirmation
      // Allows the selection of all status files（completed, parsing）
      const validFiles = selected.filter(f =>
        f.parse_status === 'completed' || f.parse_status === 'parsing'
      );

      if (validFiles.length === 0) {
        show({ message: t('referenceFile.messages.selectValid'), type: 'info' });
        return;
      }

      onSelect(validFiles);
      onClose();
    }
  };

  const handleClear = () => {
    setSelectedFiles(new Set());
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Check if there’s any. PPT File, hint to use PDF
    const hasPptFiles = Array.from(files).some(file => {
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      return fileExt === 'ppt' || fileExt === 'pptx';
    });

    if (hasPptFiles) show({ message: t('shared.pptTip'), type: 'info' });


    setIsUploading(true);
    try {
      // Determines the attribution of upload files based on the current filter condition
      // If Filter is 'all' or 'none'，Upload as global file (unconnected items)）
      // If Filter as Item ID，Upload to Project
      const targetProjectId = (filterProjectId === 'all' || filterProjectId === 'none')
        ? null
        : filterProjectId;

      // Upload all selected files
      const uploadPromises = Array.from(files).map(file =>
        uploadReferenceFile(file, targetProjectId)
      );

      const results = await Promise.all(uploadPromises);
      const uploadedFiles = results
        .map(r => r.data?.file)
        .filter((f): f is ReferenceFile => f !== undefined);

      if (uploadedFiles.length > 0) {
        show({ message: t('referenceFile.messages.uploadSuccess', { count: uploadedFiles.length }), type: 'success' });

        // Only parsing files will be added to the questionlist（pending Status file will not be asked）
        const needsParsing = uploadedFiles.filter(f =>
          f.parse_status === 'parsing'
        );
        if (needsParsing.length > 0) {
          setParsingIds(prev => {
            const newSet = new Set(prev);
            needsParsing.forEach(f => newSet.add(f.id));
            return newSet;
          });
        }

        // Merge newly uploaded files to the current list instead of replacing them completely
        setFiles(prev => {
          const fileMap = new Map(prev.map(f => [f.id, f]));
          uploadedFiles.forEach(uf => fileMap.set(uf.id, uf));
          return Array.from(fileMap.values());
        });

        // Delay reloading the file list to ensure that server-end data are updated
        setTimeout(() => {
          loadFiles();
        }, 500);
      }
    } catch (error: any) {
      console.error('Failed to upload file:', error);
      show({
        message: error?.response?.data?.error?.message || error.message || t('referenceFile.messages.uploadFailed'),
        type: 'error',
      });
    } finally {
      setIsUploading(false);
      // Clear input value so that you can double select the same file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteFile = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    file: ReferenceFile
  ) => {
    e.stopPropagation();
    const fileId = file.id;

    if (!fileId) {
      show({ message: t('referenceFile.messages.cannotDelete'), type: 'error' });
      return;
    }

    setDeletingIds((prev) => {
      const newSet = new Set(prev);
      newSet.add(fileId);
      return newSet;
    });

    try {
      await deleteReferenceFile(fileId);
      show({ message: t('referenceFile.messages.deleteSuccess'), type: 'success' });

      // Remove from Selection
      setSelectedFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });

      // Remove From Query List
      setParsingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });

      loadFiles(); // Reload File List
    } catch (error: any) {
      console.error('Failed to delete file:', error);
      show({
        message: error?.response?.data?.error?.message || error.message || t('referenceFile.messages.deleteFailed'),
        type: 'error',
      });
    } finally {
      setDeletingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusIcon = (file: ReferenceFile) => {
    if (parsingIds.has(file.id) || file.parse_status === 'parsing') {
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    }
    switch (file.parse_status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = (file: ReferenceFile) => {
    if (parsingIds.has(file.id) || file.parse_status === 'parsing') {
      return t('referenceFile.parseStatus.parsing');
    }
    switch (file.parse_status) {
      case 'pending':
        return t('referenceFile.parseStatus.pending');
      case 'completed':
        return t('referenceFile.parseStatus.completed');
      case 'failed':
        return t('referenceFile.parseStatus.failed');
      default:
        return '';
    }
  };

  const sortedFiles = [...files].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'oldest':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'name-asc':
        return a.filename.localeCompare(b.filename);
      case 'name-desc':
        return b.filename.localeCompare(a.filename);
      default:
        return 0;
    }
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('referenceFile.title')} size="lg">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-foreground-tertiary">
            <span>{files.length > 0 ? t('referenceFile.totalFiles', { count: files.length }) : t('referenceFile.noFiles')}</span>
            {selectedFiles.size > 0 && (
              <span className="ml-2 text-banana-600">
                {t('referenceFile.selectedCount', { count: selectedFiles.size })}
              </span>
            )}
            {isLoading && files.length > 0 && (
              <RefreshCw size={14} className="animate-spin text-gray-400" />
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Zoom Under Project Filter */}
            <select
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
              className="px-3 py-1.5 text-sm text-gray-700 dark:text-foreground-secondary bg-transparent hover:bg-gray-100 dark:hover:bg-background-hover rounded-md focus:outline-none transition-colors cursor-pointer"
            >
              <option value="all">{t('referenceFile.allAttachments')}</option>
              <option value="none">{t('referenceFile.unclassified')}</option>
              {projects.map(project => (
                <option key={project.project_id} value={project.project_id}>{project.idea_prompt}</option>
              ))}
            </select>

            {/* Sort Cycle Buttons */}
            <button
              onClick={() => {
                const order: Array<typeof sortBy> = ['newest', 'oldest', 'name-asc', 'name-desc'];
                const currentIndex = order.indexOf(sortBy);
                const nextIndex = (currentIndex + 1) % order.length;
                setSortBy(order[nextIndex]);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-foreground-secondary hover:bg-gray-100 dark:hover:bg-background-hover rounded-md transition-colors"
            >
              <ArrowUpDown size={14} />
              <span>
                {sortBy === 'newest' && t('referenceFile.sortNewest')}
                {sortBy === 'oldest' && t('referenceFile.sortOldest')}
                {sortBy === 'name-asc' && 'A-Z'}
                {sortBy === 'name-desc' && 'Z-A'}
              </span>
            </button>

            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={16} />}
              onClick={loadFiles}
              disabled={isLoading}
            >
              {t('referenceFile.refreshList')}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              icon={<Upload size={16} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? t('referenceFile.uploading') : t('referenceFile.uploadFile')}
            </Button>

            {selectedFiles.size > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClear}>
                {t('referenceFile.clearSelection')}
              </Button>
            )}
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md"
          onChange={handleUpload}
          className="hidden"
        />

        {/* File List */}
        <div className="border border-gray-200 dark:border-border-primary rounded-lg max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              <span className="ml-2 text-gray-500 dark:text-foreground-tertiary">{t('referenceFile.loading')}</span>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <FileText className="w-12 h-12 mb-2" />
              <p>{t('referenceFile.noRefFiles')}</p>
              <p className="text-sm mt-1">{t('referenceFile.noRefFilesHint')}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-border-primary">
              {sortedFiles.map((file) => {
                const isSelected = selectedFiles.has(file.id);
                const isDeleting = deletingIds.has(file.id);
                const isPending = file.parse_status === 'pending';

                return (
                  <div
                    key={file.id}
                    onClick={() => handleSelectFile(file)}
                    className={`
                      p-4 cursor-pointer transition-colors
                      ${isSelected ? 'bg-banana-50 dark:bg-background-secondary border-l-4 border-l-banana-500' : 'hover:bg-gray-50 dark:hover:bg-background-hover'}
                      ${file.parse_status === 'failed' ? 'opacity-60' : ''}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      {/* Selection Box */}
                      <div className="flex-shrink-0 mt-1">
                        <div
                          className={`
                            w-5 h-5 rounded border-2 flex items-center justify-center
                            ${isSelected
                              ? 'bg-banana-500 border-banana-500'
                              : 'border-gray-300 dark:border-border-primary'
                            }
                            ${file.parse_status === 'failed' ? 'opacity-50' : ''}
                          `}
                        >
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-white" />
                          )}
                        </div>
                      </div>

                      {/* File Icon */}
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                      </div>

                      {/* File Information */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-foreground-primary truncate">
                            {file.filename}
                          </p>
                          <span className="text-xs text-gray-500 dark:text-foreground-tertiary flex-shrink-0">
                            {formatFileSize(file.file_size)}
                          </span>
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-1.5 mt-1">
                          {getStatusIcon(file)}
                          <p className="text-xs text-gray-600 dark:text-foreground-tertiary">
                            {getStatusText(file)}
                            {isPending && (
                              <span className="ml-1 text-orange-500">{t('referenceFile.parseOnConfirm')}</span>
                            )}
                          </p>
                        </div>

                        {/* Cannot initialise Evolution’s mail component. */}
                        {file.parse_status === 'failed' && file.error_message && (
                          <p className="text-xs text-red-500 mt-1 line-clamp-1">
                            {file.error_message}
                          </p>
                        )}

                        {/* Image Recognition Failed Warning */}
                        {file.parse_status === 'completed' &&
                         typeof file.image_caption_failed_count === 'number' &&
                         file.image_caption_failed_count > 0 && (
                          <p className="text-xs text-orange-500 mt-1 flex items-center gap-1">
                            <AlertTriangle size={12} className="flex-shrink-0" />
                            {t('referenceFile.imageCaptionFailed', { count: file.image_caption_failed_count })}
                          </p>
                        )}
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={(e) => handleDeleteFile(e, file)}
                        disabled={isDeleting}
                        className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title={t('referenceFile.deleteFile')}
                      >
                        {isDeleting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Operator Bar */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-border-primary">
          <p className="text-xs text-gray-500 dark:text-foreground-tertiary flex items-center gap-1.5">
            <Lightbulb size={13} className="flex-shrink-0" />
            {t('referenceFile.autoParseHint')}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('referenceFile.cancel')}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedFiles.size === 0}
            >
              {t('referenceFile.confirm')} ({selectedFiles.size})
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
});

