import React from 'react';
import { useAppLocale } from '../../../platform/i18n';
import { useResolvedPortalTheme } from '@sniptale/ui/theme/safe-portal';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
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
  onTailBaseRangeChange: (position: number, width: number) => void;
  onTailFramePositionChange: (position: number) => void;
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
    onWaypointChange,
    onWidthChange,
    settings,
    wrapperRef,
    zIndex,
  });

  return (
    <CalloutBody
      {...createCalloutBodyProps({
        drag: interaction.drag,
        editing,
        frameId,
        isEditing,
        isFrameEditing,
        isSettingsOpen,
        layout: interaction.layout,
        onSettingsClick,
        onTitleChange,
        portalTheme,
        settings: interaction.effectiveSettings,
        settingsAnchorRef,
        showSettingsHandle,
        tailBaseEndDrag: interaction.tailBaseEndDrag,
        tailBaseStartDrag: interaction.tailBaseStartDrag,
        tailFrameDrag: interaction.tailFrameDrag,
        waypointDrag: interaction.waypointDrag,
        widthResize: interaction.widthResize,
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
  layout: ReturnType<typeof useCalloutInteractionLayout>['layout'];
  portalTheme: ReturnType<typeof useResolvedPortalTheme>;
  settings: CalloutSettings;
  drag: ReturnType<typeof useCalloutInteractionLayout>['drag'];
  tailBaseStartDrag: ReturnType<typeof useCalloutInteractionLayout>['tailBaseStartDrag'];
  tailBaseEndDrag: ReturnType<typeof useCalloutInteractionLayout>['tailBaseEndDrag'];
  tailFrameDrag: ReturnType<typeof useCalloutInteractionLayout>['tailFrameDrag'];
  waypointDrag: ReturnType<typeof useCalloutInteractionLayout>['waypointDrag'];
  widthResize: ReturnType<typeof useCalloutInteractionLayout>['widthResize'];
  onSettingsClick: () => void;
  onTitleChange: (titleText: string) => void;
  settingsAnchorRef: React.RefObject<HTMLButtonElement | null>;
  showSettingsHandle: boolean;
};

function createCalloutHandleStyles(args: CalloutBodyPropsArgs) {
  const tailBaseStartPoint =
    args.layout.dynamicTail?.kind === 'line'
      ? args.layout.dynamicTail.attachment.bubbleEdgePoint
      : args.layout.dynamicTail?.attachment.baseEdgeA;
  const tailBaseEndPoint =
    args.layout.dynamicTail?.kind === 'wedge'
      ? args.layout.dynamicTail.attachment.baseEdgeB
      : undefined;
  const tailFramePoint = args.layout.dynamicTail?.attachment.tipPoint;
  return {
    dragHandleStyle: {
      position: 'fixed' as const,
      left: args.layout.calloutPos.x + args.editing.dimensions.width + 6,
      top: args.layout.calloutPos.y - 30,
      zIndex: args.layout.effectiveZIndex + 1,
    },
    settingsHandleStyle: {
      position: 'fixed' as const,
      left: args.layout.calloutPos.x + args.editing.dimensions.width + 36,
      top: args.layout.calloutPos.y - 30,
      zIndex: args.layout.effectiveZIndex + 1,
    },
    tailHandleCursor:
      args.layout.dynamicTail?.kind === 'line'
        ? 'grab'
        : getCalloutTailDragCursor(args.layout.dynamicTail?.side ?? null),
    tailHandleStyle: tailBaseStartPoint
      ? {
          position: 'fixed' as const,
          left: tailBaseStartPoint.x - 6,
          top: tailBaseStartPoint.y - 6,
          zIndex: args.layout.effectiveZIndex + 1,
        }
      : null,
    tailBaseEndHandleStyle: tailBaseEndPoint
      ? {
          position: 'fixed' as const,
          left: tailBaseEndPoint.x - 6,
          top: tailBaseEndPoint.y - 6,
          zIndex: args.layout.effectiveZIndex + 1,
        }
      : null,
    tailFrameHandleStyle: tailFramePoint
      ? {
          position: 'fixed' as const,
          left: tailFramePoint.x - 6,
          top: tailFramePoint.y - 6,
          zIndex: args.layout.effectiveZIndex + 1,
        }
      : null,
    waypointHandleStyle:
      args.layout.dynamicTail?.kind === 'line' && args.layout.dynamicTail.routeControlPoint
        ? {
            position: 'fixed' as const,
            left: args.layout.dynamicTail.routeControlPoint.x - 6,
            top: args.layout.dynamicTail.routeControlPoint.y - 6,
            zIndex: args.layout.effectiveZIndex + 1,
          }
        : null,
    resizeLeftHandleStyle: {
      position: 'fixed' as const,
      left: args.layout.calloutPos.x - 6,
      top: args.layout.calloutPos.y + args.layout.calloutDimensions.height / 2 - 6,
      zIndex: args.layout.effectiveZIndex + 1,
    },
    resizeRightHandleStyle: {
      position: 'fixed' as const,
      left: args.layout.calloutPos.x + args.layout.calloutDimensions.width - 6,
      top: args.layout.calloutPos.y + args.layout.calloutDimensions.height / 2 - 6,
      zIndex: args.layout.effectiveZIndex + 1,
    },
  };
}

function createCalloutHandleCallbacks(args: CalloutBodyPropsArgs) {
  return {
    handleSettingsClick: args.onSettingsClick,
    handleDragPointerDown: args.drag.handlePointerDown,
    handleDragKeyDown: args.drag.handleKeyDown,
    handleHandleBlur: args.drag.handleBlur,
    handleHandleFocus: args.drag.handleFocus,
    handleTailPointerDown: args.tailBaseStartDrag.handlePointerDown,
    handleTailKeyDown: args.tailBaseStartDrag.handleKeyDown,
    handleTailBaseEndPointerDown: args.tailBaseEndDrag.handlePointerDown,
    handleTailBaseEndKeyDown: args.tailBaseEndDrag.handleKeyDown,
    handleTailFramePointerDown: args.tailFrameDrag.handlePointerDown,
    handleTailFrameKeyDown: args.tailFrameDrag.handleKeyDown,
    handleWaypointPointerDown: args.waypointDrag.handlePointerDown,
    handleWaypointKeyDown: args.waypointDrag.handleKeyDown,
    handleWaypointDoubleClick: args.waypointDrag.handleDoubleClick,
    handleMouseEnter: args.drag.handleMouseEnter,
    handleMouseLeave: args.drag.handleMouseLeave,
    handleResizeLeftPointerDown: (event: React.PointerEvent<HTMLButtonElement>) =>
      args.widthResize.handlePointerDown('left', event),
    handleResizeLeftKeyDown: (event: CalloutHandleKeyboardEvent) =>
      args.widthResize.handleKeyDown('left', event),
    handleResizeRightPointerDown: (event: React.PointerEvent<HTMLButtonElement>) =>
      args.widthResize.handlePointerDown('right', event),
    handleResizeRightKeyDown: (event: CalloutHandleKeyboardEvent) =>
      args.widthResize.handleKeyDown('right', event),
  };
}

function createCalloutHandleState(args: CalloutBodyPropsArgs) {
  return {
    isDragging: args.drag.isDragging,
    isHandleVisible:
      args.drag.isHandleVisible ||
      args.tailBaseStartDrag.isDragging ||
      args.tailBaseEndDrag.isDragging ||
      args.tailFrameDrag.isDragging ||
      args.waypointDrag.isDragging ||
      args.widthResize.isResizing,
    isResizingLeft: args.widthResize.activeSide === 'left',
    isResizingRight: args.widthResize.activeSide === 'right',
    isTailDragging: args.tailBaseStartDrag.isDragging,
    isTailBaseEndDragging: args.tailBaseEndDrag.isDragging,
    isTailFrameDragging: args.tailFrameDrag.isDragging,
    isWaypointDragging: args.waypointDrag.isDragging,
    hasWaypoint: args.settings.placement.connectorWaypoint !== undefined,
  };
}

function createCalloutBodyProps(args: CalloutBodyPropsArgs) {
  return {
    applyFormatting: args.editing.applyFormatting,
    cloudStyle: args.layout.cloudStyle,
    containerRef: args.editing.containerRef,
    contentEditableRef: args.editing.contentEditableRef,
    editableStyle: args.layout.editableStyle,
    effectiveZIndex: args.layout.effectiveZIndex,
    floatingToolbarRect: args.editing.floatingToolbarRect,
    frameId: args.frameId,
    handleBlur: args.editing.handleBlur,
    handleClick: args.editing.handleClick,
    handleInput: args.editing.handleInput,
    handleKeyDown: args.editing.handleKeyDown,
    handlePaste: args.editing.handlePaste,
    voice: args.editing.voice,
    voiceButtonLeftOffset: resolveCalloutVoiceButtonLeftOffset({
      calloutLeft: args.layout.calloutPos.x,
      calloutWidth: args.layout.calloutDimensions.width,
      viewportWidth: window.innerWidth,
    }),
    isEditing: args.isEditing,
    isGeometryHandleHidden: args.isSettingsOpen,
    isWidthResizeHandleHidden: args.isFrameEditing,
    portalTheme: args.portalTheme,
    settings: args.settings,
    onTitleChange: args.onTitleChange,
    dynamicTail: args.layout.dynamicTail,
    settingsAnchorRef: args.settingsAnchorRef,
    showSettingsHandle: args.showSettingsHandle,
    ...createCalloutHandleCallbacks(args),
    ...createCalloutHandleState(args),
    ...createCalloutHandleStyles(args),
    wrapperStyle: args.layout.wrapperStyle,
  };
}
