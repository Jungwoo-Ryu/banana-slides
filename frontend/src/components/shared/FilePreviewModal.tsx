import React, { useState, useEffect, useRef } from 'react';
import { Modal, Markdown, Loading, useToast } from '@/components/shared';
import { useT } from '@/hooks/useT';
import { getReferenceFile, type ReferenceFile } from '@/api/endpoints';

// FilePreviewModal Component contains translation
const filePreviewI18n = {
  zh: {
    filePreview: {
      title: "File Preview", loading: "Loading file content...",
      notParsed: "File not yet parsed, cannot preview", loadFailed: "Failed to load file content"
    }
  },
  en: {
    filePreview: {
      title: "File Preview", loading: "Loading file content...",
      notParsed: "File not yet parsed, cannot preview", loadFailed: "Failed to load file content"
    }
  }
};

interface FilePreviewModalProps {
  fileId: string | null;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  fileId,
  onClose,
}) => {
  const t = useT(filePreviewI18n);
  const [file, setFile] = useState<ReferenceFile | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { show } = useToast();

  // Usage ref Save function references to avoid relying on changes in entries leading to unlimited cycles
  const onCloseRef = useRef(onClose);
  const showRef = useRef(show);

  useEffect(() => {
    onCloseRef.current = onClose;
    showRef.current = show;
  }, [onClose, show]);

  useEffect(() => {
    if (!fileId) {
      setFile(null);
      setContent(null);
      setIsLoading(false);
      return;
    }

    const loadFile = async () => {
      setIsLoading(true);
      try {
        const response = await getReferenceFile(fileId);
        if (response.data?.file) {
          const fileData = response.data.file;

          // Check if the file has been parsed
          if (fileData.parse_status !== 'completed') {
            showRef.current({
              message: t('filePreview.notParsed'),
              type: 'info',
            });
            onCloseRef.current();
            return;
          }

          setFile(fileData);
          setContent(fileData.markdown_content || t('common.noData'));
        }
      } catch (error: any) {
        console.error('Load file content failed:', error);
        showRef.current({
          message: error?.response?.data?.error?.message || error.message || t('filePreview.loadFailed'),
          type: 'error',
        });
        setFile(null);
        setContent(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadFile();
  }, [fileId]); // Just rely on it. fileId

  return (
    <Modal
      isOpen={fileId !== null}
      onClose={onClose}
      title={file?.filename || t('filePreview.title')}
      size="xl"
    >
      {isLoading ? (
        <div className="text-center py-8">
          <Loading message={t('filePreview.loading')} />
        </div>
      ) : content ? (
        <div className="prose max-w-none overflow-x-hidden">
          <Markdown>{content}</Markdown>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-foreground-tertiary">
          <p>{t('common.noData')}</p>
        </div>
      )}
    </Modal>
  );
};

