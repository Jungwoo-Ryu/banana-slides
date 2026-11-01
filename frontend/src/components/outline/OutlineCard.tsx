import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GripVertical, Edit2, Trash2, Check, X } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { useImagePaste, buildMaterialsMarkdown } from '@/hooks/useImagePaste';
import { Card, useConfirm, Markdown, ShimmerOverlay, MaterialSelector } from '@/components/shared';
import { MarkdownTextarea, type MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';
import type { Page, Material } from '@/types';

// OutlineCard Component contains translation
const outlineCardI18n = {
  zh: {
    outlineCard: {
      page: "Page {{num}}", chapter: "Chapter", titleLabel: "Title",
      keyPointsPlaceholder: "Key points (one per line, paste images supported)", confirmDeletePage: "Are you sure you want to delete this page?",
      confirmDeleteTitle: "Confirm Delete",
      uploadingImage: "Uploading image...",
      coverPage: "Cover",
      coverPageTooltip: "This is the cover page, usually containing the title and subtitle"
    }
  },
  en: {
    outlineCard: {
      page: "Page {{num}}", chapter: "Chapter", titleLabel: "Title",
      keyPointsPlaceholder: "Key points (one per line, paste images supported)", confirmDeletePage: "Are you sure you want to delete this page?",
      confirmDeleteTitle: "Confirm Delete",
      uploadingImage: "Uploading image...",
      coverPage: "Cover",
      coverPageTooltip: "This is the cover page, usually containing the title and subtitle"
    }
  }
};

interface OutlineCardProps {
  page: Page;
  index: number;
  projectId?: string;
  showToast: (props: { message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;
  onUpdate: (data: Partial<Page>) => void;
  onDelete: () => void;
  onClick: () => void;
  isSelected: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isAiRefining?: boolean;
}

export const OutlineCard: React.FC<OutlineCardProps> = ({
  page,
  index,
  projectId,
  showToast,
  onUpdate,
  onDelete,
  onClick,
  isSelected,
  dragHandleProps,
  isAiRefining = false,
}) => {
  const t = useT(outlineCardI18n);
  const { confirm, ConfirmDialog } = useConfirm();
  const outlineRaw = page.outline_content ?? { title: '', points: [] as string[] };
  const outline = { ...outlineRaw, points: outlineRaw.points ?? [] };
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(outline.title);
  const [editPoints, setEditPoints] = useState(outline.points.join('\n'));
  const [editPart, setEditPart] = useState(page.part || '');
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  const textareaRef = useRef<MarkdownTextareaRef>(null);

  // Callback to insert at cursor position in the textarea
  const insertAtCursor = useCallback((markdown: string) => {
    textareaRef.current?.insertAtCursor(markdown);
  }, []);

  const { handlePaste, handleFiles, isUploading } = useImagePaste({
    projectId,
    setContent: setEditPoints,
    showToast: showToast,
    insertAtCursor,
  });

  const handleMaterialSelect = useCallback((materials: Material[]) => {
    const markdown = buildMaterialsMarkdown(materials, setEditPoints);
    textareaRef.current?.insertAtCursor(markdown + '\n');
  }, []);

  // Sync local state when the page prop changes, unless the user is editing.
  useEffect(() => {
    if (!isEditing) {
      setEditTitle(outline.title);
      setEditPoints(outline.points.join('\n'));
      setEditPart(page.part || '');
    }
  }, [outline.title, outline.points, page.part, isEditing]);

  const handleSave = () => {
    onUpdate({
      outline_content: {
        title: editTitle,
        points: editPoints.split('\n').filter((p) => p.trim()),
      },
      part: editPart.trim() || undefined,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(outline.title);
    setEditPoints(outline.points.join('\n'));
    setEditPart(page.part || '');
    setIsEditing(false);
  };

  return (
    <Card
      className={`p-4 relative ${
        isSelected ? 'border-2 border-banana-500 shadow-yellow' : ''
      }`}
      onClick={!isEditing ? onClick : undefined}
    >
      <ShimmerOverlay show={isAiRefining} />

      <div className="flex items-start gap-3 relative z-10">
        {/* Drag handles. */}
        <div
          {...dragHandleProps}
          className="flex-shrink-0 cursor-move text-gray-400 hover:text-gray-600 pt-1"
        >
          <GripVertical size={20} />
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {/* Page numbers and chapters */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-foreground-primary">
              {t('outlineCard.page', { num: index + 1 })}
            </span>
            {index === 0 && !isEditing && (
              <span
                className="text-xs px-1.5 py-0.5 bg-banana-100 dark:bg-banana-900/30 text-banana-700 dark:text-banana-400 rounded"
                title={t('outlineCard.coverPageTooltip')}
              >
                {t('outlineCard.coverPage')}
              </span>
            )}
            {isEditing ? (
              <input
                type="text"
                value={editPart}
                onChange={(e) => setEditPart(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="text-xs px-2 py-0.5 w-24 border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={t('outlineCard.chapter')}
              />
            ) : (
              page.part && (
                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                  {page.part}
                </span>
              )
            )}
          </div>

          {isEditing ? (
            /* Edit Mode */
            <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-border-primary bg-white dark:bg-background-secondary text-gray-900 dark:text-foreground-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-banana-500"
                placeholder={t('outlineCard.titleLabel')}
              />
              <div>
                <MarkdownTextarea
                  ref={textareaRef}
                  value={editPoints}
                  onChange={setEditPoints}
                  onPaste={handlePaste}
                  onFiles={handleFiles}
                  onSelectFromLibrary={() => setIsMaterialSelectorOpen(true)}
                  rows={5}
                  placeholder={t('outlineCard.keyPointsPlaceholder')}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-sm text-gray-700 dark:text-foreground-secondary hover:bg-gray-100 dark:hover:bg-background-hover rounded-lg transition-colors"
                >
                  <X size={16} className="inline mr-1" />
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isUploading}
                  className="px-3 py-1.5 text-sm bg-banana-500 text-black dark:text-white rounded-lg hover:bg-banana-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check size={16} className="inline mr-1" />
                  {t('common.save')}
                </button>
              </div>
            </div>
          ) : (
            /* View Mode */
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-foreground-primary mb-2">
                {outline.title}
              </h4>
              <div className="text-gray-600 dark:text-foreground-tertiary">
                <Markdown>{outline.points.join('\n')}</Markdown>
              </div>
            </div>
          )}
        </div>

        {/* Operation button */}
        {!isEditing && (
          <div className="flex-shrink-0 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="p-1.5 text-gray-500 dark:text-foreground-tertiary hover:text-banana-600 hover:bg-banana-50 dark:hover:bg-background-hover rounded transition-colors"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                confirm(
                  t('outlineCard.confirmDeletePage'),
                  onDelete,
                  { title: t('outlineCard.confirmDeleteTitle'), variant: 'danger' }
                );
              }}
              className="p-1.5 text-gray-500 dark:text-foreground-tertiary hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
      {ConfirmDialog}
      <MaterialSelector
        projectId={projectId}
        isOpen={isMaterialSelectorOpen}
        onClose={() => setIsMaterialSelectorOpen(false)}
        onSelect={handleMaterialSelect}
        multiple
      />
    </Card>
  );
};
