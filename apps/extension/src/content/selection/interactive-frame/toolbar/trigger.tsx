import React from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { translate, useAppLocale } from '../../../../platform/i18n';
import { isHighlighterEnabled } from '../../highlighter';
import { queryAllContentUiElements } from '../../../platform/dom-host';
import { collectFrameFloatingExclusions } from '../layout/floating-placement';
import {
  getThemedPortalStyle,
  resolveContentPortalTarget,
  useContentPortalTheme,
  Z_INDEX_FLOATING_UI,
} from '../layout/portal';

const TRIGGER_SIZE = 26;
const BRIDGE_PADDING = 3;
const VIEWPORT_MARGIN = 8;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getTriggerPosition(frame: FrameData) {
  const candidates = [0.3, 0.7].flatMap((ratio) => [
    {
      x: frame.x + frame.width * ratio - TRIGGER_SIZE / 2,
      y: frame.y - TRIGGER_SIZE / 2,
    },
    {
      x: frame.x + frame.width * ratio - TRIGGER_SIZE / 2,
      y: frame.y + frame.height - TRIGGER_SIZE / 2,
    },
    {
      x: frame.x - TRIGGER_SIZE / 2,
      y: frame.y + frame.height * ratio - TRIGGER_SIZE / 2,
    },
    {
      x: frame.x + frame.width - TRIGGER_SIZE / 2,
      y: frame.y + frame.height * ratio - TRIGGER_SIZE / 2,
    },
  ]);
  const otherFrameExclusions = collectFrameFloatingExclusions(frame.id).strictRects.map((rect) => ({
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
    bottom: rect.y + rect.height,
  }));
  const ownHandleExclusions = queryAllContentUiElements('.sniptale-resize-handle')
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => element.dataset['frameId'] === frame.id)
    .map((element) => element.getBoundingClientRect());
  const occupied = [...otherFrameExclusions, ...ownHandleExclusions];
  const preferred = candidates.find((candidate) => {
    const right = candidate.x + TRIGGER_SIZE;
    const bottom = candidate.y + TRIGGER_SIZE;
    return occupied.every(
      (rect) =>
        right < rect.left - 2 ||
        candidate.x > rect.right + 2 ||
        bottom < rect.top - 2 ||
        candidate.y > rect.bottom + 2
    );
  });
  const position = preferred ?? candidates[0] ?? { x: frame.x, y: frame.y };
  return {
    x: clamp(position.x, VIEWPORT_MARGIN, window.innerWidth - TRIGGER_SIZE - VIEWPORT_MARGIN),
    y: clamp(position.y, VIEWPORT_MARGIN, window.innerHeight - TRIGGER_SIZE - VIEWPORT_MARGIN),
  };
}

export function InteractiveFrameToolbarTrigger(props: {
  frame: FrameData;
  isVisible: boolean;
  hoverFrame: (frameId: string) => void;
  scheduleHoverFrameHide: (frameId: string) => void;
  selectFrame: (frameId: string, anchorOffset?: { x: number; y: number }) => void;
}) {
  useAppLocale();
  const portalTheme = useContentPortalTheme();
  const [, refreshPosition] = React.useReducer((value) => value + 1, 0);

  React.useEffect(() => {
    if (!props.isVisible) return;
    const refresh = () => refreshPosition();
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [props.isVisible]);

  if (!props.isVisible || !isHighlighterEnabled()) return null;
  const position = getTriggerPosition(props.frame);
  const label = translate('content.interactiveFrame.openToolbar');

  return createPortal(
    <div
      className="sniptale-frame-toolbar-bridge"
      data-frame-id={props.frame.id}
      data-frame-control="trigger"
      data-theme={portalTheme ?? undefined}
      style={getThemedPortalStyle(portalTheme, {
        position: 'fixed',
        left: position.x - BRIDGE_PADDING,
        top: position.y - BRIDGE_PADDING,
        padding: BRIDGE_PADDING,
        pointerEvents: 'auto',
        zIndex: Z_INDEX_FLOATING_UI,
      })}
      onPointerEnter={() => props.hoverFrame(props.frame.id)}
      onPointerLeave={() => props.scheduleHoverFrameHide(props.frame.id)}
    >
      <button
        type="button"
        className="sniptale-frame-toolbar-trigger"
        data-frame-id={props.frame.id}
        data-frame-control="trigger"
        title={label}
        aria-label={label}
        onFocus={() => props.hoverFrame(props.frame.id)}
        onBlur={() => props.scheduleHoverFrameHide(props.frame.id)}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const hasPointerCoordinates =
            event.detail > 0 || event.clientX !== 0 || event.clientY !== 0;
          if (hasPointerCoordinates) {
            props.selectFrame(props.frame.id, {
              x: event.clientX - props.frame.x,
              y: event.clientY - props.frame.y,
            });
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          props.selectFrame(
            props.frame.id,
            rect.width > 0 && rect.height > 0
              ? {
                  x: rect.left + rect.width / 2 - props.frame.x,
                  y: rect.top + rect.height / 2 - props.frame.y,
                }
              : undefined
          );
        }}
        style={{
          width: TRIGGER_SIZE,
          height: TRIGGER_SIZE,
          display: 'grid',
          placeItems: 'center',
          padding: 0,
          border: '1px solid var(--sniptale-color-border-soft)',
          borderRadius: 999,
          background: 'var(--sniptale-color-surface-panel)',
          color: 'var(--sniptale-color-text-primary)',
          boxShadow:
            '0 4px 12px color-mix(in srgb, var(--sniptale-color-shadow-strong) 22%, transparent)',
          cursor: 'pointer',
        }}
      >
        <MoreHorizontal size={17} aria-hidden="true" />
      </button>
    </div>,
    resolveContentPortalTarget()
  );
}
