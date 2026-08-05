import React from 'react';
import { createPortal } from 'react-dom';
import { Move, Settings2 } from 'lucide-react';
import { mergeThemeScopedStyle } from '@sniptale/ui/theme/safe-portal';
import { translate } from '../../../platform/i18n';
import {
  resolveContentPortalTarget,
  useContentPortalTheme,
  Z_INDEX_FLOATING_UI,
} from '../interactive-frame/layout/portal';
import type { useTransientControlVisibility } from '../interactive-frame/overlays/transient-control-visibility';
import type { useStepBadgeBoundaryDrag } from './drag';

export function useStepBadgeControlPosition(args: {
  badgeRef: React.RefObject<HTMLDivElement | null>;
  isEnabled: boolean;
  placementKey: string;
}) {
  const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!args.isEnabled) return;
    const refresh = () => {
      const rect = args.badgeRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        x: Math.max(8, Math.min(window.innerWidth - 64, rect.right + 6)),
        y: Math.max(8, Math.min(window.innerHeight - 34, rect.top - 30)),
      });
    };
    refresh();
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [args.badgeRef, args.isEnabled, args.placementKey]);
  return position;
}

export function StepBadgeControls(props: {
  drag: ReturnType<typeof useStepBadgeBoundaryDrag>;
  visibility: ReturnType<typeof useTransientControlVisibility>;
  onSettingsClick?: () => void;
  position: { x: number; y: number } | null;
  settingsAnchorRef?: React.RefObject<HTMLButtonElement | null>;
  showSettingsHandle: boolean;
}) {
  const portalTheme = useContentPortalTheme();
  if (!props.position) return null;
  const buttonStyle: React.CSSProperties = {
    width: 26,
    height: 26,
    padding: 0,
    borderRadius: '50%',
    border: '1px solid var(--sniptale-color-border-soft)',
    background: 'var(--sniptale-color-surface-panel)',
    color: 'var(--sniptale-color-text-primary)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px color-mix(in srgb, var(--sniptale-color-shadow-strong) 24%, transparent)',
    transition: 'opacity 120ms ease, color 120ms ease, border-color 120ms ease',
  };

  return createPortal(
    <div
      className="sniptale-step-badge-controls"
      data-theme={portalTheme ?? undefined}
      style={mergeThemeScopedStyle(portalTheme, {
        position: 'fixed',
        left: props.position.x,
        top: props.position.y,
        display: 'flex',
        gap: 4,
        zIndex: Z_INDEX_FLOATING_UI,
        opacity: props.visibility.isVisible ? 1 : 0,
        pointerEvents: props.visibility.isVisible ? 'auto' : 'none',
      })}
      onMouseEnter={props.visibility.handleMouseEnter}
      onMouseLeave={props.visibility.handleMouseLeave}
    >
      <button
        type="button"
        className="sniptale-step-badge-move-handle"
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
        aria-label={translate('content.interactiveFrame.moveStepBadge')}
        title={translate('content.interactiveFrame.moveStepBadge')}
        style={{ ...buttonStyle, cursor: props.drag.isDragging ? 'grabbing' : 'grab' }}
        onPointerDown={props.drag.handlePointerDown}
        onKeyDown={props.drag.handleKeyDown}
        onFocus={props.visibility.handleFocus}
        onBlur={props.visibility.handleBlur}
      >
        <Move size={14} aria-hidden="true" style={{ display: 'block' }} />
      </button>
      {props.showSettingsHandle ? (
        <button
          {...(props.settingsAnchorRef ? { ref: props.settingsAnchorRef } : {})}
          type="button"
          className="sniptale-step-badge-settings-handle"
          aria-label={translate('content.interactiveFrame.stepBadgeSettings')}
          title={translate('content.interactiveFrame.stepBadgeSettings')}
          style={{ ...buttonStyle, cursor: 'pointer' }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.nativeEvent.stopImmediatePropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.nativeEvent.stopImmediatePropagation();
            props.onSettingsClick?.();
          }}
          onFocus={props.visibility.handleFocus}
          onBlur={props.visibility.handleBlur}
        >
          <Settings2 size={15} aria-hidden="true" />
        </button>
      ) : null}
    </div>,
    resolveContentPortalTarget()
  );
}
