import React, { useState, useEffect, useCallback } from 'react';
import { Image as ImageIcon, RefreshCw, X, FileText } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { listMaterials, deleteMaterial, listProjectReferenceFiles, type Material, type ReferenceFile } from '@/api/endpoints';
import { getImageUrl } from '@/api/client';
import { ReferenceFileCard } from './ReferenceFileCard';

// ProjectResourcesList Component contains translation
const projectResourcesI18n = {
  zh: {
    projectResources: {
      uploadedFiles: "Uploaded Files", uploadedImages: "Uploaded Images",
      refreshList: "Refresh List", imageLoadFailed: "Image load failed", deleteThisMaterial: "Delete this material"
    },
    material: { messages: { loadMaterialFailed: "Failed to load materials", deleteSuccess: "Material deleted", deleteFailed: "Failed to delete material" } }
  },
  en: {
    projectResources: {
      uploadedFiles: "Uploaded Files", uploadedImages: "Uploaded Images",
      refreshList: "Refresh List", imageLoadFailed: "Image load failed", deleteThisMaterial: "Delete this material"
    },
    material: { messages: { loadMaterialFailed: "Failed to load materials", deleteSuccess: "Material deleted", deleteFailed: "Failed to delete material" } }
  }
};

interface ProjectResourcesListProps {
  projectId: string | null;
  className?: string;
  showFiles?: boolean; // Whether to show reference files
  showImages?: boolean; // Whether to show Image assets
  onFileClick?: (fileId: string) => void;
  onImageClick?: (material: Material) => void;
  showToast?: (props: { message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;
}

/**
 * Project Resource List Component
 * Integrated presentation of project reference documents and Image assets
 */
export const ProjectResourcesList: React.FC<ProjectResourcesListProps> = ({
  projectId,
  className = 'mb-4',
  showFiles = true,
  showImages = true,
  onFileClick,
  onImageClick,
  showToast,
}) => {
  const t = useT(projectResourcesI18n);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [files, setFiles] = useState<ReferenceFile[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [deletingMaterialIds, setDeletingMaterialIds] = useState<Set<string>>(new Set());
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(new Set());

  // Loading material list
  const loadMaterials = useCallback(async () => {
    if (!projectId || !showImages) return;

    setIsLoadingMaterials(true);
    try {
      const response = await listMaterials(projectId);
      if (response.data?.materials) {
        setMaterials(response.data.materials);
      }
    } catch (error: any) {
      console.error('Load materials failed:', error);
      showToast?.({ message: `${t('material.messages.loadMaterialFailed')}: ${error.message || t('common.unknownError')}`, type: 'error' });
    } finally {
      setIsLoadingMaterials(false);
    }
  }, [projectId, showImages]);

  // Load File List
  const loadFiles = useCallback(async () => {
    if (!projectId || !showFiles) return;

    setIsLoadingFiles(true);
    try {
      const response = await listProjectReferenceFiles(projectId);
      if (response.data?.files) {
        setFiles(response.data.files);
      }
    } catch (error: any) {
      console.error('Load files failed:', error);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [projectId, showFiles]);

  useEffect(() => {
    loadMaterials();
    loadFiles();
  }, [loadMaterials, loadFiles]);

  // Remove material
  const handleDeleteMaterial = async (
    e: React.MouseEvent<HTMLButtonElement>,
    materialId: string
  ) => {
    e.stopPropagation();

    setDeletingMaterialIds(prev => new Set(prev).add(materialId));

    try {
      await deleteMaterial(materialId);
      setMaterials(prev => prev.filter(m => m.id !== materialId));
      showToast?.({ message: t('material.messages.deleteSuccess'), type: 'success' });
    } catch (error: any) {
      console.error('Delete material failed:', error);
      showToast?.({
        message: error?.response?.data?.error?.message || error.message || t('material.messages.deleteFailed'),
        type: 'error',
      });
    } finally {
      setDeletingMaterialIds(prev => {
        const next = new Set(prev);
        next.delete(materialId);
        return next;
      });
    }
  };

  const handleFileStatusChange = (updatedFile: ReferenceFile) => {
    setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
  };

  const handleFileDelete = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const getMaterialDisplayName = (m: Material) =>
    (m.prompt && m.prompt.trim()) ||
    (m.name && m.name.trim()) ||
    (m.original_filename && m.original_filename.trim()) ||
    (m.source_filename && m.source_filename.trim()) ||
    m.filename ||
    m.url;

  // If there are no items ID，Do Not Show
  if (!projectId) {
    return null;
  }

  // If neither shows anything, do not render it.
  if ((!showFiles || files.length === 0) && (!showImages || materials.length === 0)) {
    return null;
  }

  return (
    <div className={className}>
      {/* List of reference documents */}
      {showFiles && files.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-gray-500 dark:text-foreground-tertiary" />
              <span className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">
                {t('projectResources.uploadedFiles')} ({files.length})
              </span>
            </div>
            <button
              onClick={loadFiles}
              disabled={isLoadingFiles}
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
              title={t('projectResources.refreshList')}
            >
              <RefreshCw size={14} className={isLoadingFiles ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="space-y-2">
            {files.map(file => (
              <ReferenceFileCard
                key={file.id}
                file={file}
                onDelete={handleFileDelete}
                onStatusChange={handleFileStatusChange}
                deleteMode="remove"
                onClick={() => onFileClick?.(file.id)}
                showToast={showToast}
              />
            ))}
          </div>
        </div>
      )}

      {/* Image assets List */}
      {showImages && materials.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ImageIcon size={16} className="text-gray-500 dark:text-foreground-tertiary" />
              <span className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">
                {t('projectResources.uploadedImages')} ({materials.length})
              </span>
            </div>
            <button
              onClick={loadMaterials}
              disabled={isLoadingMaterials}
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
              title={t('projectResources.refreshList')}
            >
              <RefreshCw size={14} className={isLoadingMaterials ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* A list of pictures scrolling horizontally */}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {materials.map((material) => {
              const isDeleting = deletingMaterialIds.has(material.id);
              return (
                <div
                  key={material.id}
                  className="relative flex-shrink-0 group cursor-pointer"
                  onClick={() => onImageClick?.(material)}
                >
                  {/* Picture container */}
                  <div className="relative w-32 h-32 bg-gray-100 dark:bg-background-secondary rounded-lg overflow-hidden border-2 border-gray-200 dark:border-border-primary hover:border-banana-400 transition-colors">
                    {failedImageUrls.has(material.url) ? (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs text-center p-2">
                        {t('projectResources.imageLoadFailed')}
                      </div>
                    ) : (
                      <img
                        src={getImageUrl(material.url)}
                        alt={getMaterialDisplayName(material)}
                        className="w-full h-full object-cover"
                        onError={() => setFailedImageUrls(prev => new Set(prev).add(material.url))}
                      />
                    )}

                    {/* Remove button */}
                    <button
                      onClick={(e) => handleDeleteMaterial(e, material.id)}
                      disabled={isDeleting}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 active:scale-95 disabled:opacity-60"
                      title={t('projectResources.deleteThisMaterial')}
                    >
                      {isDeleting ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <X size={14} />
                      )}
                    </button>

                    {/* Show filenames on suspension */}
                    <div className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-xs p-1 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                      {getMaterialDisplayName(material)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectResourcesList;

