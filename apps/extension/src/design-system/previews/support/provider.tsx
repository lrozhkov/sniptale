import type { CSSProperties, ReactNode } from 'react';

export interface DesignSystemVariantPreview {
  previewId: string;
  componentId: string;
  variantId: string;
  preview: ReactNode;
}

export const FLOATING_PREVIEW_STYLE = {
  position: 'relative',
  top: 'auto',
  right: 'auto',
  bottom: 'auto',
  left: 'auto',
  inset: 'auto',
  transform: 'none',
  zIndex: 1,
} as const;

interface DesignSystemFloatingPreviewFrameProps {
  children: ReactNode;
  minHeight?: CSSProperties['minHeight'];
  className?: string;
}

/**
 * Preview-only containment frame that keeps floating product surfaces inside
 * a catalog card without changing their runtime positioning contract.
 */
export function DesignSystemFloatingPreviewFrame({
  children,
  minHeight = 240,
  className = '',
}: DesignSystemFloatingPreviewFrameProps) {
  const resolvedClassName = [
    'sniptale-ai-modal-root',
    'sniptale-design-system-floating-preview',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div data-ui="design-system.preview-frame" className={resolvedClassName} style={{ minHeight }}>
      {children}
    </div>
  );
}

export function designSystemPreview(
  componentId: string,
  variantId: string,
  preview: ReactNode
): DesignSystemVariantPreview {
  return { previewId: `${componentId}.${variantId}`, componentId, variantId, preview };
}
