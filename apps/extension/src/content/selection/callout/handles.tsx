import { GripVertical, Settings2 } from 'lucide-react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { translate } from '../../../platform/i18n';
import type { AppTheme } from '../../../ui/theme';
import { mergeThemeScopedStyle } from '@sniptale/ui/theme/safe-portal';
import type { CalloutHandleKeyboardEvent } from './keyboard';

export type CalloutInteractionHandleProps = {
  dragHandleStyle: CSSProperties;
  handleDragPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleDragKeyDown: (event: CalloutHandleKeyboardEvent) => void;
  handleHandleBlur: () => void;
  handleHandleFocus: () => void;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
  handleSettingsClick: () => void;
  handleTailPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleTailKeyDown: (event: CalloutHandleKeyboardEvent) => void;
  handleTailBaseEndPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleTailBaseEndKeyDown: (event: CalloutHandleKeyboardEvent) => void;
  handleTailFramePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleTailFrameKeyDown: (event: CalloutHandleKeyboardEvent) => void;
  isDragging: boolean;
  isEditing: boolean;
  isHandleVisible: boolean;
  isTailDragging: boolean;
  isTailBaseEndDragging: boolean;
  isTailFrameDragging: boolean;
  portalTheme: AppTheme | null;
  settingsAnchorRef: RefObject<HTMLButtonElement | null>;
  settingsHandleStyle: CSSProperties;
  showSettingsHandle: boolean;
  tailHandleCursor: CSSProperties['cursor'];
  tailHandleStyle: CSSProperties | null;
  tailBaseEndHandleStyle: CSSProperties | null;
  tailFrameHandleStyle: CSSProperties | null;
};

function renderCalloutSettingsHandle(props: CalloutInteractionHandleProps) {
  if (props.isEditing || !props.showSettingsHandle) return null;
  const label = translate('content.interactiveFrame.calloutSettings');
  return (
    <button
      ref={props.settingsAnchorRef}
      type="button"
      className="sniptale-callout-settings-handle"
      data-theme={props.portalTheme ?? undefined}
      aria-label={label}
      title={label}
      style={mergeThemeScopedStyle(props.portalTheme, {
        ...props.settingsHandleStyle,
        width: 20,
        height: 20,
        padding: 0,
        borderRadius: '50%',
        border: '1px solid var(--sniptale-color-border-soft)',
        background: 'var(--sniptale-color-surface-panel)',
        color: 'var(--sniptale-color-text-secondary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        opacity: props.isHandleVisible ? 1 : 0,
        pointerEvents: props.isHandleVisible ? 'auto' : 'none',
        boxShadow:
          '0 2px 8px color-mix(in srgb, var(--sniptale-color-shadow-strong) 24%, transparent)',
        transition: 'opacity 120ms ease, color 120ms ease, border-color 120ms ease',
      })}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        props.handleSettingsClick();
      }}
      onFocus={props.handleHandleFocus}
      onBlur={props.handleHandleBlur}
      onMouseEnter={props.handleMouseEnter}
      onMouseLeave={props.handleMouseLeave}
    >
      <Settings2 size={13} aria-hidden="true" />
    </button>
  );
}

function renderCalloutMoveHandle(props: CalloutInteractionHandleProps) {
  if (props.isEditing) return null;
  return (
    <button
      type="button"
      className="sniptale-callout-drag-handle"
      data-theme={props.portalTheme ?? undefined}
      aria-label={translate('content.interactiveFrame.moveComment')}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
      title={translate('content.interactiveFrame.moveComment')}
      style={mergeThemeScopedStyle(props.portalTheme, {
        ...props.dragHandleStyle,
        width: 20,
        height: 20,
        padding: 0,
        borderRadius: '50%',
        border: '1px solid var(--sniptale-color-border-soft)',
        background: 'var(--sniptale-color-surface-panel)',
        color: 'var(--sniptale-color-text-secondary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: props.isDragging ? 'grabbing' : 'grab',
        opacity: props.isHandleVisible ? 1 : 0,
        pointerEvents: props.isHandleVisible ? 'auto' : 'none',
        boxShadow:
          '0 2px 8px color-mix(in srgb, var(--sniptale-color-shadow-strong) 24%, transparent)',
        transition: 'opacity 120ms ease, color 120ms ease, border-color 120ms ease',
      })}
      onPointerDown={props.handleDragPointerDown}
      onKeyDown={props.handleDragKeyDown}
      onFocus={props.handleHandleFocus}
      onBlur={props.handleHandleBlur}
      onMouseEnter={props.handleMouseEnter}
      onMouseLeave={props.handleMouseLeave}
    >
      <GripVertical size={13} aria-hidden="true" />
    </button>
  );
}

function renderCalloutTailHandle(
  props: CalloutInteractionHandleProps,
  control: {
    className: string;
    isDragging: boolean;
    labelKey: 'moveCommentTail' | 'moveCommentTailBaseEnd' | 'moveCommentTailEnd';
    onKeyDown: (event: CalloutHandleKeyboardEvent) => void;
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    style: CSSProperties | null;
  }
) {
  if (props.isEditing || !control.style) return null;
  const label = translate(`content.interactiveFrame.${control.labelKey}`);
  return (
    <button
      type="button"
      className={`sniptale-callout-tail-handle ${control.className}`}
      data-theme={props.portalTheme ?? undefined}
      aria-label={label}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
      title={label}
      style={mergeThemeScopedStyle(props.portalTheme, {
        ...control.style,
        width: 12,
        height: 12,
        padding: 0,
        boxSizing: 'border-box',
        borderRadius: '50%',
        border: '2px solid var(--sniptale-color-border-soft)',
        background: '#ffffff',
        cursor: control.isDragging ? 'grabbing' : props.tailHandleCursor,
        opacity: props.isHandleVisible ? 1 : 0,
        pointerEvents: props.isHandleVisible ? 'auto' : 'none',
        boxShadow:
          '0 1px 5px color-mix(in srgb, var(--sniptale-color-shadow-strong) 24%, transparent)',
        transition: 'opacity 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
      })}
      onPointerDown={control.onPointerDown}
      onKeyDown={control.onKeyDown}
      onFocus={props.handleHandleFocus}
      onBlur={props.handleHandleBlur}
      onMouseEnter={props.handleMouseEnter}
      onMouseLeave={props.handleMouseLeave}
    />
  );
}

export function renderCalloutInteractionHandles(props: CalloutInteractionHandleProps) {
  return (
    <>
      {renderCalloutMoveHandle(props)}
      {renderCalloutSettingsHandle(props)}
      {renderCalloutTailHandle(props, {
        className: 'sniptale-callout-tail-base-start-handle',
        isDragging: props.isTailDragging,
        labelKey: 'moveCommentTail',
        onKeyDown: props.handleTailKeyDown,
        onPointerDown: props.handleTailPointerDown,
        style: props.tailHandleStyle,
      })}
      {renderCalloutTailHandle(props, {
        className: 'sniptale-callout-tail-base-end-handle',
        isDragging: props.isTailBaseEndDragging,
        labelKey: 'moveCommentTailBaseEnd',
        onKeyDown: props.handleTailBaseEndKeyDown,
        onPointerDown: props.handleTailBaseEndPointerDown,
        style: props.tailBaseEndHandleStyle,
      })}
      {renderCalloutTailHandle(props, {
        className: 'sniptale-callout-tail-frame-handle',
        isDragging: props.isTailFrameDragging,
        labelKey: 'moveCommentTailEnd',
        onKeyDown: props.handleTailFrameKeyDown,
        onPointerDown: props.handleTailFramePointerDown,
        style: props.tailFrameHandleStyle,
      })}
    </>
  );
}
