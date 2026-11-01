import React from 'react';
import { cn } from '@/utils';
import { useT } from '@/hooks/useT';
import type { PageStatus } from '@/types';

// Status Component contains translation
const statusI18n = {
  zh: {
    status: {
      draft: "Draft", generatingDescription: "Generating Description", descriptionGenerated: "Description Generated", queued: "Queued", generating: "Generating",
      completed: "Completed", failed: "Failed", unknown: "Unknown",
      notGeneratedDesc: "Description Not Generated", noDescription: "No description generated yet",
      descGenerated: "Description Generated", notGeneratedImage: "Image Not Generated",
      waitingForImage: "Description generated, waiting for image", generatingImage: "Generating image",
      imageFailed: "Image generation failed", imageCompleted: "Image generated",
      draftStage: "Draft Stage", allCompleted: "All Completed", statusUnknown: "Status Unknown"
    }
  },
  en: {
    status: {
      draft: "Draft", generatingDescription: "Generating Description", descriptionGenerated: "Description Generated", queued: "Queued", generating: "Generating",
      completed: "Completed", failed: "Failed", unknown: "Unknown",
      notGeneratedDesc: "Description Not Generated", noDescription: "No description generated yet",
      descGenerated: "Description Generated", notGeneratedImage: "Image Not Generated",
      waitingForImage: "Description generated, waiting for image", generatingImage: "Generating image",
      imageFailed: "Image generation failed", imageCompleted: "Image generated",
      draftStage: "Draft Stage", allCompleted: "All Completed", statusUnknown: "Status Unknown"
    }
  }
};

interface StatusBadgeProps {
  status: PageStatus;
}

const statusClassNames: Record<PageStatus, string> = {
  DRAFT: 'bg-gray-100 dark:bg-background-secondary text-gray-600 dark:text-foreground-tertiary',
  GENERATING_DESCRIPTION: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 animate-pulse',
  DESCRIPTION_GENERATED: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  QUEUED: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 animate-pulse',
  GENERATING: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 animate-pulse',
  COMPLETED: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
};

const statusLabelKeys: Record<PageStatus, string> = {
  DRAFT: 'status.draft',
  GENERATING_DESCRIPTION: 'status.generatingDescription',
  DESCRIPTION_GENERATED: 'status.descriptionGenerated',
  QUEUED: 'status.queued',
  GENERATING: 'status.generating',
  COMPLETED: 'status.completed',
  FAILED: 'status.failed',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const t = useT(statusI18n);
  const className = statusClassNames[status];
  const labelKey = statusLabelKeys[status];

  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium',
        className
      )}
    >
      {t(labelKey)}
    </span>
  );
};
