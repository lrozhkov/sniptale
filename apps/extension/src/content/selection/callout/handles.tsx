import { Move, Plus, Settings2 } from 'lucide-react';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';
import { translate } from '../../../platform/i18n';
import type { AppTheme } from '../../../ui/theme';
import { mergeThemeScopedStyle } from '@sniptale/ui/theme/safe-portal';
import type { CalloutHandleKeyboardEvent } from './keyboard';

export type CalloutInteractionHandleProps = {
  dragHandleStyle: CSSProperties;
  curveStartHandleStyle?: CSSProperties | null;
  curveEndHandleStyle?: CSSProperties | null;
  handleCurveStartPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleCurveStartKeyDown?: (event: CalloutHandleKeyboardEvent) => void;
  handleCurveEndPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleCurveEndKeyDown?: (event: CalloutHandleKeyboardEvent) => void;
  handleDragPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleDragKeyDown: (event: CalloutHandleKeyboardEvent) => void;
  handleHandleBlur: () => void;
  handleHandleFocus: () => void;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
  handleResizeLeftPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleResizeLeftKeyDown: (event: CalloutHandleKeyboardEvent) => void;
  handleResizeRightPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleResizeRightKeyDown: (event: CalloutHandleKeyboardEvent) => void;
  handleSettingsClick: () => void;
  handleTailPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleTailKeyDown: (event: CalloutHandleKeyboardEvent) => void;
  handleTailBaseEndPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleTailBaseEndKeyDown: (event: CalloutHandleKeyboardEvent) => void;
  handleTailFramePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleTailFrameKeyDown: (event: CalloutHandleKeyboardEvent) => void;
  handleWaypointPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleWaypointKeyDown: (event: CalloutHandleKeyboardEvent) => void;
  handleWaypointDoubleClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  hasWaypoint: boolean;
  isDragging: boolean;
  isCurveStartDragging?: boolean;
  isCurveEndDragging?: boolean;
  isEditing: boolean;
  isGeometryHandleHidden: boolean;
  isWidthResizeHandleHidden: boolean;
  isHandleVisible: boolean;
  isResizingLeft: boolean;
  isResizingRight: boolean;
  isTailDragging: boolean;
  isTailBaseEndDragging: boolean;
  isTailFrameDragging: boolean;
  isWaypointDragging: boolean;
  isPolylineWaypoint: boolean;
  portalTheme: AppTheme | null;
  settingsAnchorRef: RefObject<HTMLButtonElement | null>;
  settingsHandleStyle: CSSProperties;
  resizeLeftHandleStyle: CSSProperties;
  resizeRightHandleStyle: CSSProperties;
  showSettingsHandle: boolean;
  tailHandleCursor: CSSProperties['cursor'];
  tailHandleStyle: CSSProperties | null;
  tailBaseEndHandleStyle: CSSProperties | null;
  tailFrameHandleStyle: CSSProperties | null;
  waypointHandleStyle: CSSProperties | null;
  waypointAngle: number | null;
  waypointAngleStyle: CSSProperties | null;
};

function renderCalloutWidthHandle(
  props: CalloutInteractionHandleProps,
  control: {
    isResizing: boolean;
    labelKey: 'resizeCommentLeft' | 'resizeCommentRight';
    onKeyDown: (event: CalloutHandleKeyboardEvent) => void;
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    side: 'left' | 'right';
    style: CSSProperties;
  }
) {
  if (props.isEditing || props.isGeometryHandleHidden || props.isWidthResizeHandleHidden)
    return null;
  const label = translate(`content.interactiveFrame.${control.labelKey}`);
  return (
    <button
      type="button"
      className={[
        'sniptale-callout-tail-handle',
        'sniptale-callout-resize-handle',
        `sniptale-callout-resize-handle--${control.side}`,
      ].join(' ')}
      data-theme={props.portalTheme ?? undefined}
      aria-label={label}
      aria-keyshortcuts="ArrowLeft ArrowRight"
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
        cursor: 'ew-resize',
        opacity: props.isHandleVisible ? 1 : 0,
        pointerEvents: props.isHandleVisible ? 'auto' : 'none',
        boxShadow: control.isResizing
          ? '0 0 0 3px color-mix(in srgb, var(--sniptale-color-accent) 20%, transparent)'
          : '0 1px 5px color-mix(in srgb, var(--sniptale-color-shadow-strong) 24%, transparent)',
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
        width: 26,
        height: 26,
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
      <Settings2 size={15} aria-hidden="true" />
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
        width: 26,
        height: 26,
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
      <Move size={14} aria-hidden="true" style={{ display: 'block' }} />
    </button>
  );
}

function renderCalloutTailHandle(
  props: CalloutInteractionHandleProps,
  control: {
    className: string;
    isDragging: boolean;
    labelKey:
      | 'moveCommentCurveStart'
      | 'moveCommentCurveEnd'
      | 'moveCommentTail'
      | 'moveCommentTailBaseEnd'
      | 'moveCommentTailEnd';
    onKeyDown: (event: CalloutHandleKeyboardEvent) => void;
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    style: CSSProperties | null;
  }
) {
  if (props.isEditing || props.isGeometryHandleHidden || !control.style) return null;
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

function renderCalloutWaypointHandle(props: CalloutInteractionHandleProps) {
  if (props.isEditing || props.isGeometryHandleHidden || !props.waypointHandleStyle) return null;
  const label = translate('content.interactiveFrame.moveCommentRoutePoint');
  return (
    <>
      <button
        type="button"
        className="sniptale-callout-tail-handle sniptale-callout-waypoint-handle"
        data-theme={props.portalTheme ?? undefined}
        aria-label={label}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Delete"
        title={label}
        style={mergeThemeScopedStyle(props.portalTheme, {
          ...props.waypointHandleStyle,
          width: 12,
          height: 12,
          padding: 0,
          boxSizing: 'border-box',
          borderRadius: props.isPolylineWaypoint ? 2 : '50%',
          border: '2px solid var(--sniptale-color-accent)',
          background: props.hasWaypoint ? 'var(--sniptale-color-accent)' : '#ffffff',
          color: 'var(--sniptale-color-accent)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: props.isWaypointDragging ? 'grabbing' : 'grab',
          opacity: props.isHandleVisible ? 1 : 0,
          pointerEvents: props.isHandleVisible ? 'auto' : 'none',
          boxShadow:
            '0 1px 5px color-mix(in srgb, var(--sniptale-color-shadow-strong) 24%, transparent)',
          transform: props.isPolylineWaypoint ? 'rotate(45deg)' : undefined,
        })}
        onPointerDown={props.handleWaypointPointerDown}
        onDoubleClick={props.handleWaypointDoubleClick}
        onKeyDown={props.handleWaypointKeyDown}
        onFocus={props.handleHandleFocus}
        onBlur={props.handleHandleBlur}
        onMouseEnter={props.handleMouseEnter}
        onMouseLeave={props.handleMouseLeave}
      >
        {props.hasWaypoint || props.isPolylineWaypoint ? null : (
          <Plus aria-hidden="true" size={8} strokeWidth={3} />
        )}
      </button>
      {props.isPolylineWaypoint &&
      props.isWaypointDragging &&
      props.waypointAngle !== null &&
      props.waypointAngleStyle ? (
        <span
          aria-hidden="true"
          data-theme={props.portalTheme ?? undefined}
          style={mergeThemeScopedStyle(props.portalTheme, {
            ...props.waypointAngleStyle,
            minWidth: 34,
            padding: '3px 6px',
            border: '1px solid var(--sniptale-color-border-soft)',
            borderRadius: 6,
            background: 'var(--sniptale-color-surface-panel)',
            color: 'var(--sniptale-color-text-primary)',
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1.2,
            textAlign: 'center',
            boxShadow:
              '0 2px 8px color-mix(in srgb, var(--sniptale-color-shadow-strong) 20%, transparent)',
            pointerEvents: 'none',
          })}
        >
          {props.waypointAngle}°
        </span>
      ) : null}
    </>
  );
}

export function renderCalloutInteractionHandles(props: CalloutInteractionHandleProps) {
  return (
    <>
      {renderCalloutMoveHandle(props)}
      {renderCalloutSettingsHandle(props)}
      {renderCalloutWidthHandle(props, {
        isResizing: props.isResizingLeft,
        labelKey: 'resizeCommentLeft',
        onKeyDown: props.handleResizeLeftKeyDown,
        onPointerDown: props.handleResizeLeftPointerDown,
        side: 'left',
        style: props.resizeLeftHandleStyle,
      })}
      {renderCalloutWidthHandle(props, {
        isResizing: props.isResizingRight,
        labelKey: 'resizeCommentRight',
        onKeyDown: props.handleResizeRightKeyDown,
        onPointerDown: props.handleResizeRightPointerDown,
        side: 'right',
        style: props.resizeRightHandleStyle,
      })}
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
      {renderCalloutWaypointHandle(props)}
      {renderCalloutTailHandle(props, {
        className: 'sniptale-callout-curve-start-handle',
        isDragging: Boolean(props.isCurveStartDragging),
        labelKey: 'moveCommentCurveStart',
        onKeyDown: props.handleCurveStartKeyDown ?? (() => undefined),
        onPointerDown: props.handleCurveStartPointerDown ?? (() => undefined),
        style: props.curveStartHandleStyle ?? null,
      })}
      {renderCalloutTailHandle(props, {
        className: 'sniptale-callout-curve-end-handle',
        isDragging: Boolean(props.isCurveEndDragging),
        labelKey: 'moveCommentCurveEnd',
        onKeyDown: props.handleCurveEndKeyDown ?? (() => undefined),
        onPointerDown: props.handleCurveEndPointerDown ?? (() => undefined),
        style: props.curveEndHandleStyle ?? null,
      })}
    </>
  );
}
