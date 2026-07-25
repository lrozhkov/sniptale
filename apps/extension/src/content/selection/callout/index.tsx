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

interface CalloutProps {
  frameId: string;
  settings: CalloutSettings;
  frameRect: { x: number; y: number; width: number; height: number };
  zIndex: number;
  isEditing: boolean;
  isSettingsOpen: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onContentChange: (htmlContent: string) => void;
  onDelete: () => void;
  onSettingsClick: () => void;
  onPositionChange: (placement: NonNullable<CalloutSettings['manualPlacement']>) => void;
  onTailBaseRangeChange: (position: number, width: number) => void;
  onTailFramePositionChange: (position: number) => void;
  settingsAnchorRef: React.RefObject<HTMLButtonElement | null>;
  showSettingsHandle: boolean;
}

/**
 * Компонент Callout - облачко с текстом рядом с рамкой
 * Поддерживает inline-редактирование и Rich Text (bold, italic, underline)
 */
export const Callout: React.FC<CalloutProps> = ({
  frameId,
  settings,
  frameRect,
  zIndex,
  isEditing,
  isSettingsOpen,
  onStartEditing,
  onStopEditing,
  onContentChange,
  onDelete,
  onSettingsClick,
  onPositionChange,
  onTailBaseRangeChange,
  onTailFramePositionChange,
  settingsAnchorRef,
  showSettingsHandle,
}) => {
  useAppLocale();
  const portalTheme = useResolvedPortalTheme(resolveCalloutThemeOwner());
  const editing = useCalloutEditing({
    frameId,
    htmlContent: settings.htmlContent,
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
    frameRect,
    isEditing,
    isSettingsOpen,
    onPositionChange,
    onTailBaseRangeChange,
    onTailFramePositionChange,
    settings,
    wrapperRef,
    zIndex,
  });

  return (
    <CalloutBody
      {...createCalloutBodyProps({
        drag: interaction.drag,
        editing,
        isEditing,
        layout: interaction.layout,
        onSettingsClick,
        portalTheme,
        settings: interaction.effectiveSettings,
        settingsAnchorRef,
        showSettingsHandle,
        tailBaseEndDrag: interaction.tailBaseEndDrag,
        tailBaseStartDrag: interaction.tailBaseStartDrag,
        tailFrameDrag: interaction.tailFrameDrag,
      })}
      wrapperRef={wrapperRef}
    />
  );
};

function createCalloutBodyProps(args: {
  editing: ReturnType<typeof useCalloutEditing>;
  isEditing: boolean;
  layout: ReturnType<typeof useCalloutInteractionLayout>['layout'];
  portalTheme: ReturnType<typeof useResolvedPortalTheme>;
  settings: CalloutSettings;
  drag: ReturnType<typeof useCalloutInteractionLayout>['drag'];
  tailBaseStartDrag: ReturnType<typeof useCalloutInteractionLayout>['tailBaseStartDrag'];
  tailBaseEndDrag: ReturnType<typeof useCalloutInteractionLayout>['tailBaseEndDrag'];
  tailFrameDrag: ReturnType<typeof useCalloutInteractionLayout>['tailFrameDrag'];
  onSettingsClick: () => void;
  settingsAnchorRef: React.RefObject<HTMLButtonElement | null>;
  showSettingsHandle: boolean;
}) {
  const tailBaseStartPoint = args.layout.dynamicTail?.attachment.baseEdgeA;
  const tailBaseEndPoint = args.layout.dynamicTail?.attachment.baseEdgeB;
  const tailFramePoint = args.layout.dynamicTail?.attachment.tipPoint;
  return {
    applyFormatting: args.editing.applyFormatting,
    cloudStyle: args.layout.cloudStyle,
    containerRef: args.editing.containerRef,
    contentEditableRef: args.editing.contentEditableRef,
    editableStyle: args.layout.editableStyle,
    effectiveZIndex: args.layout.effectiveZIndex,
    floatingToolbarRect: args.editing.floatingToolbarRect,
    handleBlur: args.editing.handleBlur,
    handleClick: args.editing.handleClick,
    handleInput: args.editing.handleInput,
    handleKeyDown: args.editing.handleKeyDown,
    handlePaste: args.editing.handlePaste,
    isEditing: args.isEditing,
    portalTheme: args.portalTheme,
    settings: args.settings,
    dynamicTail: args.layout.dynamicTail,
    dragHandleStyle: {
      position: 'fixed' as const,
      left: args.layout.calloutPos.x + args.editing.dimensions.width - 9,
      top: args.layout.calloutPos.y - 9,
      zIndex: args.layout.effectiveZIndex + 1,
    },
    settingsHandleStyle: {
      position: 'fixed' as const,
      left: args.layout.calloutPos.x + args.editing.dimensions.width + 13,
      top: args.layout.calloutPos.y - 9,
      zIndex: args.layout.effectiveZIndex + 1,
    },
    settingsAnchorRef: args.settingsAnchorRef,
    showSettingsHandle: args.showSettingsHandle,
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
    handleMouseEnter: args.drag.handleMouseEnter,
    handleMouseLeave: args.drag.handleMouseLeave,
    isDragging: args.drag.isDragging,
    isHandleVisible:
      args.drag.isHandleVisible ||
      args.tailBaseStartDrag.isDragging ||
      args.tailBaseEndDrag.isDragging ||
      args.tailFrameDrag.isDragging,
    isTailDragging: args.tailBaseStartDrag.isDragging,
    isTailBaseEndDragging: args.tailBaseEndDrag.isDragging,
    isTailFrameDragging: args.tailFrameDrag.isDragging,
    tailHandleCursor: getCalloutTailDragCursor(args.layout.dynamicTail?.side ?? null),
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
    wrapperStyle: args.layout.wrapperStyle,
  };
}
