import React from 'react';

interface ShimmerOverlayProps {
  /** Whether to show gradient effects */
  show: boolean;
  /** Transparency, Default 0.4 */
  opacity?: number;
  /** round corner type, default 'card' */
  rounded?: 'card' | 'lg' | 'md' | 'sm' | 'none';
}

/**
 * Generic Gradient Scroll Cover Component
 * For displaying on cards"Generating"or"Processing"Visual feedback
 * It’s back. Skeleton Gradient effect style for components
 */
export const ShimmerOverlay: React.FC<ShimmerOverlayProps> = ({
  show,
  opacity = 0.4,
  rounded = 'card',
}) => {
  if (!show) return null;

  const roundedClass = {
    card: 'rounded-card',
    lg: 'rounded-lg',
    md: 'rounded-md',
    sm: 'rounded-sm',
    none: '',
  }[rounded];

  return (
    <div className={`absolute inset-0 ${roundedClass} overflow-hidden pointer-events-none z-10`}>
      <div
        className="absolute inset-0 bg-gradient-to-r from-gray-200 via-banana-50 to-gray-200 animate-shimmer"
        style={{
          backgroundSize: '200% 100%',
          opacity
        }}
      />
    </div>
  );
};

