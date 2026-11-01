import type { Page } from '@/types';

/**
 * Determines whether the page description is generated
 * Pass. page.status === 'GENERATING_DESCRIPTION' Drive, with pictures generated 'GENERATING' We don’t interfere with each other.
 */
export const useDescriptionGeneratingState = (
  page: Page,
  isAiRefining: boolean
): boolean => {
  return page.status === 'GENERATING_DESCRIPTION' || isAiRefining;
};

/**
 * Determines whether the page picture is in production
 * Check status related to image generation：
 * 1. Picture Generation Job（isGenerating）
 * 2. Page GENERATING Status (set during image generation)）
 */
export const useImageGeneratingState = (
  page: Page,
  isGenerating: boolean
): boolean => {
  return isGenerating || page.status === 'QUEUED' || page.status === 'GENERATING';
};

/**
 * @deprecated Usage useDescriptionGeneratingState or useImageGeneratingState Alternative
 * Original generic version： Merge all generation status
 * Problem： Unable to distinguish between the production of a description and the generation of a picture, resulting in a picture generation status on the description page
 */
export const useGeneratingState = (
  page: Page,
  isGenerating: boolean,
  isAiRefining: boolean
): boolean => {
  return isGenerating || page.status === 'QUEUED' || page.status === 'GENERATING' || isAiRefining;
};

/**
 * Simple version： judge only the generation status of the page itself
 */
export const usePageGeneratingState = (
  page: Page,
  isGenerating: boolean
): boolean => {
  return isGenerating || page.status === 'QUEUED' || page.status === 'GENERATING';
};


