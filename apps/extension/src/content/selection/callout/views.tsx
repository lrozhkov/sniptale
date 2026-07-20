import React from 'react';
import { createPortal } from 'react-dom';
import { translate } from '../../../platform/i18n';
import type { AppTheme } from '../../../ui/theme';
import { mergeThemeScopedStyle } from '@sniptale/ui/theme/safe-portal';
import { ProductGlassToolbar, ProductGlassToolbarButton } from '@sniptale/ui/product-glass-toolbar';
import { resolveContentPortalTarget } from '../interactive-frame/layout/portal';
import { getTailSvgState } from './utils';

function getCalloutToolbarWrapperStyle(rect: DOMRect, zIndex: number): React.CSSProperties {
  return {
    position: 'fixed',
    top: rect.top - 46,
    left: rect.left + rect.width / 2 - 62,
    zIndex,
  };
}

export function renderCalloutFloatingToolbar(props: {
  applyFormatting: (command: string, event: React.MouseEvent) => void;
  effectiveZIndex: number;
  floatingToolbarRect: DOMRect | null;
  isEditing: boolean;
  portalTheme: AppTheme | null;
  resolveThemeOwner: () => HTMLElement | null;
}) {
  if (!props.floatingToolbarRect || !props.isEditing) {
    return null;
  }

  return createPortal(
    <div
      data-theme={props.portalTheme ?? undefined}
      style={mergeThemeScopedStyle(
        props.portalTheme,
        getCalloutToolbarWrapperStyle(props.floatingToolbarRect, props.effectiveZIndex)
      )}
    >
      <ProductGlassToolbar
        className="sniptale-callout-format-toolbar"
        onMouseDown={(event) => event.preventDefault()}
      >
        <ProductGlassToolbarButton
          onMouseDown={(event) => props.applyFormatting('bold', event)}
          style={{ fontSize: 14, fontWeight: 700 }}
          title={translate('content.interactiveFrame.formatBold')}
        >
          B
        </ProductGlassToolbarButton>
        <ProductGlassToolbarButton
          onMouseDown={(event) => props.applyFormatting('italic', event)}
          style={{ fontSize: 14, fontStyle: 'italic' }}
          title={translate('content.interactiveFrame.formatItalic')}
        >
          I
        </ProductGlassToolbarButton>
        <ProductGlassToolbarButton
          onMouseDown={(event) => props.applyFormatting('underline', event)}
          style={{ fontSize: 14, textDecoration: 'underline' }}
          title={translate('content.interactiveFrame.formatUnderline')}
        >
          U
        </ProductGlassToolbarButton>
      </ProductGlassToolbar>
    </div>,
    resolveContentPortalTarget(props.resolveThemeOwner())
  );
}

export function renderCalloutTail(props: {
  bgColor: string;
  resolvedSide: 'top' | 'right' | 'bottom' | 'left';
  tailOffset: number;
  tailSize: number;
  variant: string;
}) {
  if (props.variant !== 'bubble') {
    return null;
  }

  const tailState = getTailSvgState(props.resolvedSide, props.tailSize, props.tailOffset);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
      style={tailState.style}
      viewBox={tailState.viewBox}
    >
      <path d={tailState.path} fill={props.bgColor} />
    </svg>
  );
}
