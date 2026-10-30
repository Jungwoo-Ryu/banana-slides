import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { isUploadingUrl, getUploadingPreviewUrl } from '@/hooks/useImagePaste';

// ImagePreviewList Component contains translation
const imagePreviewI18n = {
  zh: {
    imagePreview: { title: "Image Preview", removeImage: "Remove Image", imageLoadFailed: "Image load failed" }
  },
  en: {
    imagePreview: { title: "Image Preview", removeImage: "Remove Image", imageLoadFailed: "Image load failed" }
  }
};

interface ImagePreviewListProps {
  content: string;
  onRemoveImage?: (imageUrl: string) => void;
  className?: string;
}

/**
 * Parsing markdown Photo links in text
 * Support format: ![alt](url) or ![](url)
 */
const parseMarkdownImages = (text: string): Array<{ url: string; alt: string; fullMatch: string }> => {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images: Array<{ url: string; alt: string; fullMatch: string }> = [];
  let match;

  while ((match = imageRegex.exec(text)) !== null) {
    images.push({
      alt: match[1] || 'image',
      url: match[2],
      fullMatch: match[0]
    });
  }

  return images;
};

/**
 * Picture Preview List Component - Scroll Horizontally
 * Parsing and showing all in the edit box markdown Image
 */
export const ImagePreviewList: React.FC<ImagePreviewListProps> = ({
  content,
  onRemoveImage,
  className = ''
}) => {
  const t = useT(imagePreviewI18n);
  // Parsing Picture List
  const images = useMemo(() => parseMarkdownImages(content), [content]);

  // Do not show components if no pictures
  if (images.length === 0) {
    return null;
  }

  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">
          {t('imagePreview.title')} ({images.length})
        </span>
      </div>

      {/* Scrolling containers horizontally */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {images.map((image, index) => {
          const uploading = isUploadingUrl(image.url);
          const imgSrc = uploading ? getUploadingPreviewUrl(image.url) : image.url;

          return (
            <div
              key={`${image.url}-${index}`}
              className="relative flex-shrink-0 group"
            >
              {/* Picture container */}
              <div className="relative w-32 h-32 bg-gray-100 dark:bg-background-secondary rounded-lg overflow-hidden border-2 border-gray-200 dark:border-border-primary hover:border-banana-400 transition-colors">
                <img
                  src={imgSrc}
                  alt={image.alt}
                  className={`w-full h-full object-cover ${uploading ? 'opacity-50' : ''}`}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.error-placeholder')) {
                      const placeholder = document.createElement('div');
                      placeholder.className = 'error-placeholder w-full h-full flex items-center justify-center text-gray-400 text-xs text-center p-2';
                      placeholder.textContent = t('imagePreview.imageLoadFailed');
                      parent.appendChild(placeholder);
                    }
                  }}
                />

                {/* Upload Mask */}
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-banana-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {/* Remove button */}
                {onRemoveImage && !uploading && (
                  <button
                    onClick={() => onRemoveImage(image.url)}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 active:scale-95"
                    title={t('imagePreview.removeImage')}
                  >
                    <X size={14} />
                  </button>
                )}

                {/* Show picture description on suspension */}
                <div className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-xs p-1 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                  {image.alt !== 'image' ? image.alt : decodeURIComponent(imgSrc.split('/').pop()?.replace(/_\d+\./, '.') || '')}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ImagePreviewList;
