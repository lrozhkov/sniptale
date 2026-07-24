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
  onStartEditing: () => void;
  onStopEditing: () => void;
  onContentChange: (htmlContent: string) => void;
  onDelete: () => void;
  onPositionChange: (placement: NonNullable<CalloutSettings['manualPlacement']>) => void;
  onTailBaseRangeChange: (position: number, width: number) => void;
  onTailFramePositionChange: (position: number) => void;
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
  onStartEditing,
  onStopEditing,
  onContentChange,
  onDelete,
  onPositionChange,
  onTailBaseRangeChange,
  onTailFramePositionChange,
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
    onPositionChange,
    onTailBaseRangeChange,
    onTailFramePositionChange,
    settings,
    wrapperRef,
    zIndex,
  });

  return (
    <CalloutBody
      {...createCalloutBodyProps(
        editing,
        isEditing,
        interaction.layout,
        portalTheme,
        interaction.effectiveSettings,
        interaction.drag,
        interaction.tailBaseStartDrag,
        interaction.tailBaseEndDrag,
        interaction.tailFrameDrag
      )}
      wrapperRef={wrapperRef}
    />
  );
};

function createCalloutBodyProps(
  editing: ReturnType<typeof useCalloutEditing>,
  isEditing: boolean,
  layout: ReturnType<typeof useCalloutInteractionLayout>['layout'],
  portalTheme: ReturnType<typeof useResolvedPortalTheme>,
  settings: CalloutSettings,
  drag: ReturnType<typeof useCalloutInteractionLayout>['drag'],
  tailBaseStartDrag: ReturnType<typeof useCalloutInteractionLayout>['tailBaseStartDrag'],
  tailBaseEndDrag: ReturnType<typeof useCalloutInteractionLayout>['tailBaseEndDrag'],
  tailFrameDrag: ReturnType<typeof useCalloutInteractionLayout>['tailFrameDrag']
) {
  const tailBaseStartPoint = layout.dynamicTail?.attachment.baseEdgeA;
  const tailBaseEndPoint = layout.dynamicTail?.attachment.baseEdgeB;
  const tailFramePoint = layout.dynamicTail?.attachment.tipPoint;
  return {
    applyFormatting: editing.applyFormatting,
    cloudStyle: layout.cloudStyle,
    containerRef: editing.containerRef,
    contentEditableRef: editing.contentEditableRef,
    editableStyle: layout.editableStyle,
    effectiveZIndex: layout.effectiveZIndex,
    floatingToolbarRect: editing.floatingToolbarRect,
    handleBlur: editing.handleBlur,
    handleClick: editing.handleClick,
    handleInput: editing.handleInput,
    handleKeyDown: editing.handleKeyDown,
    handlePaste: editing.handlePaste,
    isEditing,
    portalTheme,
    settings,
    dynamicTail: layout.dynamicTail,
    dragHandleStyle: {
      position: 'fixed' as const,
      left: layout.calloutPos.x + editing.dimensions.width - 9,
      top: layout.calloutPos.y - 9,
      zIndex: layout.effectiveZIndex + 1,
    },
    handleDragPointerDown: drag.handlePointerDown,
    handleDragKeyDown: drag.handleKeyDown,
    handleHandleBlur: drag.handleBlur,
    handleHandleFocus: drag.handleFocus,
    handleTailPointerDown: tailBaseStartDrag.handlePointerDown,
    handleTailKeyDown: tailBaseStartDrag.handleKeyDown,
    handleTailBaseEndPointerDown: tailBaseEndDrag.handlePointerDown,
    handleTailBaseEndKeyDown: tailBaseEndDrag.handleKeyDown,
    handleTailFramePointerDown: tailFrameDrag.handlePointerDown,
    handleTailFrameKeyDown: tailFrameDrag.handleKeyDown,
    handleMouseEnter: drag.handleMouseEnter,
    handleMouseLeave: drag.handleMouseLeave,
    isDragging: drag.isDragging,
    isHandleVisible:
      drag.isHandleVisible ||
      tailBaseStartDrag.isDragging ||
      tailBaseEndDrag.isDragging ||
      tailFrameDrag.isDragging,
    isTailDragging: tailBaseStartDrag.isDragging,
    isTailBaseEndDragging: tailBaseEndDrag.isDragging,
    isTailFrameDragging: tailFrameDrag.isDragging,
    tailHandleCursor: getCalloutTailDragCursor(layout.dynamicTail?.side ?? null),
    tailHandleStyle: tailBaseStartPoint
      ? {
          position: 'fixed' as const,
          left: tailBaseStartPoint.x - 6,
          top: tailBaseStartPoint.y - 6,
          zIndex: layout.effectiveZIndex + 1,
        }
      : null,
    tailBaseEndHandleStyle: tailBaseEndPoint
      ? {
          position: 'fixed' as const,
          left: tailBaseEndPoint.x - 6,
          top: tailBaseEndPoint.y - 6,
          zIndex: layout.effectiveZIndex + 1,
        }
      : null,
    tailFrameHandleStyle: tailFramePoint
      ? {
          position: 'fixed' as const,
          left: tailFramePoint.x - 6,
          top: tailFramePoint.y - 6,
          zIndex: layout.effectiveZIndex + 1,
        }
      : null,
    wrapperStyle: layout.wrapperStyle,
  };
}
