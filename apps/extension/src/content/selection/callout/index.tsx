import React from 'react';
import { useAppLocale } from '../../../platform/i18n';
import { useResolvedPortalTheme } from '@sniptale/ui/theme/safe-portal';
import type {
  CalloutAttachment,
  CalloutCurveSettings,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { CalloutBody } from './body';
import { resolveCalloutThemeOwner } from './dom';
import { useCalloutEditing } from './editing';
import { createCalloutSettingsKey } from './settings-key';
import { getCalloutTailDragCursor } from './tail-drag';
import { useCalloutInteractionLayout } from './interaction-layout';
import type { CalloutHandleKeyboardEvent } from './keyboard';
import { resolveCalloutVoiceButtonLeftOffset } from './voice-button';
import type { CalloutDragBehavior } from './drag';

interface CalloutProps {
  frameId: string;
  frameBorderWidth: number;
  settings: CalloutSettings;
  frameRect: { x: number; y: number; width: number; height: number };
  zIndex: number;
  isEditing: boolean;
  isFrameEditing: boolean;
  isSettingsOpen: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onContentChange: (htmlContent: string) => void;
  onTitleChange: (titleText: string) => void;
  onDelete: () => void;
  onSettingsClick: () => void;
  onPositionChange: (
    placement: NonNullable<CalloutSettings['placement']['manualPlacement']>,
    behavior: CalloutDragBehavior
  ) => void;
  onTailBaseRangeChange: (position: number, width: number, attachment?: CalloutAttachment) => void;
  onTailFramePositionChange: (position: number, attachment?: CalloutAttachment) => void;
  onCurveChange: (curve: CalloutCurveSettings) => void;
  onWaypointChange: (waypoint: CalloutSettings['placement']['connectorWaypoint']) => void;
  onWidthChange: (
    maxWidth: number,
    placement: NonNullable<CalloutSettings['placement']['manualPlacement']>
  ) => void;
  settingsAnchorRef: React.RefObject<HTMLButtonElement | null>;
  showSettingsHandle: boolean;
}

/**
 * Компонент Callout - облачко с текстом рядом с рамкой
 * Поддерживает inline-редактирование и Rich Text (bold, italic, underline)
 */
export const Callout: React.FC<CalloutProps> = ({
  frameId,
  frameBorderWidth,
  settings,
  frameRect,
  zIndex,
  isEditing,
  isFrameEditing,
  isSettingsOpen,
  onStartEditing,
  onStopEditing,
  onContentChange,
  onTitleChange,
  onDelete,
  onSettingsClick,
  onPositionChange,
  onTailBaseRangeChange,
  onTailFramePositionChange,
  onCurveChange,
  onWaypointChange,
  onWidthChange,
  settingsAnchorRef,
  showSettingsHandle,
}) => {
  useAppLocale();
  const portalTheme = useResolvedPortalTheme(resolveCalloutThemeOwner());
  const editing = useCalloutEditing({
    frameId,
    htmlContent: settings.content.bodyHtml,
    titleText: settings.content.titleText,
    isEditing,
    onContentChange,
    onDelete,
    onStartEditing,
    onStopEditing,
    settingsKey: createCalloutSettingsKey(settings),
  });
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const interaction = useCalloutInteractionLayout({
    dimensions: editing.dimensions,
    frameBorderWidth,
    frameRect,
    isEditing,
    isSettingsOpen,
    onPositionChange,
    onTailBaseRangeChange,
    onTailFramePositionChange,
    onCurveChange,
    onWaypointChange,
    onWidthChange,
    settings,
    wrapperRef,
    zIndex,
  });

  return (
    <CalloutBody
      {...createCalloutBodyProps({
        editing,
        frameId,
        interaction,
        isEditing,
        isFrameEditing,
        isSettingsOpen,
        onSettingsClick,
        onTitleChange,
        portalTheme,
        settings: interaction.effectiveSettings,
        settingsAnchorRef,
        showSettingsHandle,
      })}
      wrapperRef={wrapperRef}
    />
  );
};

type CalloutBodyPropsArgs = {
  editing: ReturnType<typeof useCalloutEditing>;
  frameId: string;
  isEditing: boolean;
  isFrameEditing: boolean;
  isSettingsOpen: boolean;
  interaction: ReturnType<typeof useCalloutInteractionLayout>;
  portalTheme: ReturnType<typeof useResolvedPortalTheme>;
  settings: CalloutSettings;
  onSettingsClick: () => void;
  onTitleChange: (titleText: string) => void;
  settingsAnchorRef: React.RefObject<HTMLButtonElement | null>;
  showSettingsHandle: boolean;
};

function createCalloutHandleStyles(args: CalloutBodyPropsArgs) {
  const tailBaseStartPoint =
    args.interaction.layout.dynamicTail?.kind === 'line'
      ? args.interaction.layout.dynamicTail.attachment.bubbleEdgePoint
      : args.interaction.layout.dynamicTail?.attachment.baseEdgeA;
  const tailBaseEndPoint =
    args.interaction.layout.dynamicTail?.kind === 'wedge'
      ? args.interaction.layout.dynamicTail.attachment.baseEdgeB
      : undefined;
  const tailFramePoint = args.interaction.layout.dynamicTail?.attachment.tipPoint;
  return {
    curveStartHandleStyle:
      args.interaction.layout.dynamicTail?.kind === 'line' &&
      args.interaction.layout.dynamicTail.curveHandles
        ? {
            position: 'fixed' as const,
            left: args.interaction.layout.dynamicTail.curveHandles.start.x - 6,
            top: args.interaction.layout.dynamicTail.curveHandles.start.y - 6,
            zIndex: args.interaction.layout.effectiveZIndex + 1,
          }
        : null,
    curveEndHandleStyle:
      args.interaction.layout.dynamicTail?.kind === 'line' &&
      args.interaction.layout.dynamicTail.curveHandles
        ? {
            position: 'fixed' as const,
            left: args.interaction.layout.dynamicTail.curveHandles.end.x - 6,
            top: args.interaction.layout.dynamicTail.curveHandles.end.y - 6,
            zIndex: args.interaction.layout.effectiveZIndex + 1,
          }
        : null,
    dragHandleStyle: {
      position: 'fixed' as const,
      left: args.interaction.layout.calloutPos.x + args.editing.dimensions.width + 6,
      top: args.interaction.layout.calloutPos.y - 30,
      zIndex: args.interaction.layout.effectiveZIndex + 1,
    },
    settingsHandleStyle: {
      position: 'fixed' as const,
      left: args.interaction.layout.calloutPos.x + args.editing.dimensions.width + 36,
      top: args.interaction.layout.calloutPos.y - 30,
      zIndex: args.interaction.layout.effectiveZIndex + 1,
    },
    tailHandleCursor:
      args.interaction.layout.dynamicTail?.kind === 'line'
        ? 'grab'
        : getCalloutTailDragCursor(args.interaction.layout.dynamicTail?.side ?? null),
    tailHandleStyle: tailBaseStartPoint
      ? {
          position: 'fixed' as const,
          left: tailBaseStartPoint.x - 6,
          top: tailBaseStartPoint.y - 6,
          zIndex: args.interaction.layout.effectiveZIndex + 1,
        }
      : null,
    tailBaseEndHandleStyle: tailBaseEndPoint
      ? {
          position: 'fixed' as const,
          left: tailBaseEndPoint.x - 6,
          top: tailBaseEndPoint.y - 6,
          zIndex: args.interaction.layout.effectiveZIndex + 1,
        }
      : null,
    tailFrameHandleStyle: tailFramePoint
      ? {
          position: 'fixed' as const,
          left: tailFramePoint.x - 6,
          top: tailFramePoint.y - 6,
          zIndex: args.interaction.layout.effectiveZIndex + 1,
        }
      : null,
    waypointHandleStyle:
      args.interaction.layout.dynamicTail?.kind === 'line' &&
      args.interaction.layout.dynamicTail.routeControlPoint
        ? {
            position: 'fixed' as const,
            left: args.interaction.layout.dynamicTail.routeControlPoint.x - 6,
            top: args.interaction.layout.dynamicTail.routeControlPoint.y - 6,
            zIndex: args.interaction.layout.effectiveZIndex + 1,
          }
        : null,
    waypointAngleStyle:
      args.interaction.layout.dynamicTail?.kind === 'line' &&
      args.interaction.layout.dynamicTail.routeControlPoint
        ? {
            position: 'fixed' as const,
            left: args.interaction.layout.dynamicTail.routeControlPoint.x + 12,
            top: args.interaction.layout.dynamicTail.routeControlPoint.y - 28,
            zIndex: args.interaction.layout.effectiveZIndex + 2,
          }
        : null,
    resizeLeftHandleStyle: {
      position: 'fixed' as const,
      left: args.interaction.layout.calloutPos.x - 6,
      top:
        args.interaction.layout.calloutPos.y +
        args.interaction.layout.calloutDimensions.height / 2 -
        6,
      zIndex: args.interaction.layout.effectiveZIndex + 1,
    },
    resizeRightHandleStyle: {
      position: 'fixed' as const,
      left:
        args.interaction.layout.calloutPos.x + args.interaction.layout.calloutDimensions.width - 6,
      top:
        args.interaction.layout.calloutPos.y +
        args.interaction.layout.calloutDimensions.height / 2 -
        6,
      zIndex: args.interaction.layout.effectiveZIndex + 1,
    },
  };
}

function createCalloutHandleCallbacks(args: CalloutBodyPropsArgs) {
  return {
    handleSettingsClick: args.onSettingsClick,
    handleDragPointerDown: args.interaction.handles.drag.handlePointerDown,
    handleDragKeyDown: args.interaction.handles.drag.handleKeyDown,
    handleHandleBlur: args.interaction.handles.drag.handleBlur,
    handleHandleFocus: args.interaction.handles.drag.handleFocus,
    handleTailPointerDown: args.interaction.handles.tailBaseStartDrag.handlePointerDown,
    handleTailKeyDown: args.interaction.handles.tailBaseStartDrag.handleKeyDown,
    handleTailBaseEndPointerDown: args.interaction.handles.tailBaseEndDrag.handlePointerDown,
    handleTailBaseEndKeyDown: args.interaction.handles.tailBaseEndDrag.handleKeyDown,
    handleTailFramePointerDown: args.interaction.handles.tailFrameDrag.handlePointerDown,
    handleTailFrameKeyDown: args.interaction.handles.tailFrameDrag.handleKeyDown,
    handleWaypointPointerDown: args.interaction.handles.waypointDrag.handlePointerDown,
    handleWaypointKeyDown: args.interaction.handles.waypointDrag.handleKeyDown,
    handleWaypointDoubleClick: args.interaction.handles.waypointDrag.handleDoubleClick,
    handleCurveStartPointerDown: args.interaction.handles.curveStartDrag.handlePointerDown,
    handleCurveStartKeyDown: args.interaction.handles.curveStartDrag.handleKeyDown,
    handleCurveEndPointerDown: args.interaction.handles.curveEndDrag.handlePointerDown,
    handleCurveEndKeyDown: args.interaction.handles.curveEndDrag.handleKeyDown,
    handleMouseEnter: args.interaction.handles.drag.handleMouseEnter,
    handleMouseLeave: args.interaction.handles.drag.handleMouseLeave,
    handleResizeLeftPointerDown: (event: React.PointerEvent<HTMLButtonElement>) =>
      args.interaction.handles.widthResize.handlePointerDown('left', event),
    handleResizeLeftKeyDown: (event: CalloutHandleKeyboardEvent) =>
      args.interaction.handles.widthResize.handleKeyDown('left', event),
    handleResizeRightPointerDown: (event: React.PointerEvent<HTMLButtonElement>) =>
      args.interaction.handles.widthResize.handlePointerDown('right', event),
    handleResizeRightKeyDown: (event: CalloutHandleKeyboardEvent) =>
      args.interaction.handles.widthResize.handleKeyDown('right', event),
  };
}

function createCalloutHandleState(args: CalloutBodyPropsArgs) {
  return {
    isDragging: args.interaction.handles.drag.isDragging,
    isHandleVisible:
      args.interaction.handles.drag.isHandleVisible ||
      args.interaction.handles.tailBaseStartDrag.isDragging ||
      args.interaction.handles.tailBaseEndDrag.isDragging ||
      args.interaction.handles.tailFrameDrag.isDragging ||
      args.interaction.handles.curveStartDrag.isDragging ||
      args.interaction.handles.curveEndDrag.isDragging ||
      args.interaction.handles.waypointDrag.isDragging ||
      args.interaction.handles.widthResize.isResizing,
    isResizingLeft: args.interaction.handles.widthResize.activeSide === 'left',
    isResizingRight: args.interaction.handles.widthResize.activeSide === 'right',
    isTailDragging: args.interaction.handles.tailBaseStartDrag.isDragging,
    isTailBaseEndDragging: args.interaction.handles.tailBaseEndDrag.isDragging,
    isTailFrameDragging: args.interaction.handles.tailFrameDrag.isDragging,
    isWaypointDragging: args.interaction.handles.waypointDrag.isDragging,
    isCurveStartDragging: args.interaction.handles.curveStartDrag.isDragging,
    isCurveEndDragging: args.interaction.handles.curveEndDrag.isDragging,
    isPolylineWaypoint:
      args.settings.style.connector.kind === 'line' &&
      args.settings.style.connector.routing === 'polyline',
    waypointAngle:
      args.interaction.layout.dynamicTail?.kind === 'line'
        ? args.interaction.layout.dynamicTail.routeControlAngle
        : null,
    hasWaypoint: args.settings.placement.connectorWaypoint !== undefined,
  };
}

function createCalloutBodyProps(args: CalloutBodyPropsArgs) {
  return {
    applyFormatting: args.editing.applyFormatting,
    calloutDimensions: args.interaction.layout.calloutDimensions,
    cloudStyle: args.interaction.layout.cloudStyle,
    containerRef: args.editing.containerRef,
    contentEditableRef: args.editing.contentEditableRef,
    editableStyle: args.interaction.layout.editableStyle,
    effectiveZIndex: args.interaction.layout.effectiveZIndex,
    floatingToolbarRect: args.editing.floatingToolbarRect,
    frameId: args.frameId,
    handleBlur: args.editing.handleBlur,
    handleClick: args.editing.handleClick,
    handleInput: args.editing.handleInput,
    handleKeyDown: args.editing.handleKeyDown,
    handlePaste: args.editing.handlePaste,
    voice: args.editing.voice,
    voiceButtonLeftOffset: resolveCalloutVoiceButtonLeftOffset({
      calloutLeft: args.interaction.layout.calloutPos.x,
      calloutWidth: args.interaction.layout.calloutDimensions.width,
      viewportWidth: window.innerWidth,
    }),
    isEditing: args.isEditing,
    isGeometryHandleHidden: args.isSettingsOpen || args.isFrameEditing,
    isWidthResizeHandleHidden: args.isFrameEditing,
    portalTheme: args.portalTheme,
    settings: args.settings,
    onTitleChange: args.onTitleChange,
    dynamicTail: args.interaction.layout.dynamicTail,
    settingsAnchorRef: args.settingsAnchorRef,
    showSettingsHandle: args.showSettingsHandle,
    ...createCalloutHandleCallbacks(args),
    ...createCalloutHandleState(args),
    ...createCalloutHandleStyles(args),
    wrapperStyle: args.interaction.layout.wrapperStyle,
  };
}
