import React, { useState, useEffect, useRef } from 'react';
import { ReferenceFileCard } from '@/components/shared';
import { useT } from '@/hooks/useT';
import { listProjectReferenceFiles, type ReferenceFile } from '@/api/endpoints';

// ReferenceFileList Component contains translation
const referenceFileListI18n = {
  zh: { referenceFile: { uploadedFiles: "Uploaded Files", messages: { loadFailed: "Failed to load reference file list" } } },
  en: { referenceFile: { uploadedFiles: "Uploaded Files", messages: { loadFailed: "Failed to load reference file list" } } }
};

interface ReferenceFileListProps {
  // Two models.：1. From API Load (input) projectId） 2. Show directly (input) files）
  projectId?: string | null;
  files?: ReferenceFile[]; // If it comes in, files，Show directly, not from API Load
  onFileClick?: (fileId: string) => void;
  onFileStatusChange?: (file: ReferenceFile) => void;
  onFileDelete?: (fileId: string) => void; // If in, use external delete logic
  deleteMode?: 'delete' | 'remove';
  title?: string; // Custom Title
  className?: string; // Custom Styles
  showToast?: (props: { message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;
}

export const ReferenceFileList: React.FC<ReferenceFileListProps> = ({
  projectId,
  files: externalFiles,
  onFileClick,
  onFileStatusChange,
  onFileDelete,
  deleteMode = 'remove',
  title,
  className = 'mb-6',
  showToast,
}) => {
  const t = useT(referenceFileListI18n);
  const [internalFiles, setInternalFiles] = useState<ReferenceFile[]>([]);
  const showRef = useRef(showToast);

  const displayTitle = title ?? t('referenceFile.uploadedFiles');

  // If it comes in, files，using the list of external files; otherwise from API Load
  const isExternalMode = externalFiles !== undefined;
  const files = isExternalMode ? externalFiles : internalFiles;

  useEffect(() => {
    showRef.current = showToast;
  }, [showToast]);

  // From non-external mode only API Load
  useEffect(() => {
    if (isExternalMode || !projectId) {
      if (!isExternalMode) {
        setInternalFiles([]);
      }
      return;
    }

    const loadFiles = async () => {
      try {
        const response = await listProjectReferenceFiles(projectId);
        if (response.data?.files) {
          setInternalFiles(response.data.files);
        }
      } catch (error: any) {
        console.error('Load file list failed:', error);
        showRef.current?.({
          message: error?.response?.data?.error?.message || error.message || t('referenceFile.messages.loadFailed'),
          type: 'error',
        });
      }
    };

    loadFiles();
  }, [projectId, isExternalMode]);

  const handleFileStatusChange = (updatedFile: ReferenceFile) => {
    if (!isExternalMode) {
      setInternalFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
    }
    onFileStatusChange?.(updatedFile);
  };

  const handleFileDelete = (fileId: string) => {
    if (onFileDelete) {
      // Use external delete logic
      onFileDelete(fileId);
    } else if (!isExternalMode) {
      // Internal delete logic
      setInternalFiles(prev => prev.filter(f => f.id !== fileId));
    }
  };

  if (files.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-foreground-secondary mb-3">{displayTitle}</h3>
      <div className="flex flex-wrap gap-2">
        {files.map(file => (
          <ReferenceFileCard
            key={file.id}
            file={file}
            onDelete={handleFileDelete}
            onStatusChange={handleFileStatusChange}
            deleteMode={deleteMode}
            onClick={() => onFileClick?.(file.id)}
            showToast={showToast}
          />
        ))}
      </div>
    </div>
  );
};

