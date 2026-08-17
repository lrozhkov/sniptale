import React from 'react';
import type { FrameAnnotationCoordinateSpace } from '../coordinate-space';
import { useCalloutEditingHandlers } from './editing-handlers';
import {
  useCalloutEditingFocusEffect,
  useCalloutEscapeCaptureEffect,
  useCalloutMeasureEffect,
  useCalloutSelectionChangeEffect,
  useCalloutSyncContentEffect,
} from './editing-effects';

export function useFrameCalloutEditing(args: {
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  contentEditableRef?: React.RefObject<HTMLDivElement | null>;
  frameId: string;
  htmlContent: string;
  isEditing: boolean;
  onContentChange: (htmlContent: string) => void;
  onDelete: () => void;
  onStartEditing: () => void;
  onStopEditing: () => void;
  stopVoiceInput?: () => void;
  settingsKey: string;
  titleText?: string;
  voiceActive?: boolean;
}) {
  const ownedContentEditableRef = React.useRef<HTMLDivElement | null>(null);
  const contentEditableRef = args.contentEditableRef ?? ownedContentEditableRef;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });
  const [floatingToolbarRect, setFloatingToolbarRect] = React.useState<DOMRect | null>(null);
  const handlers = useCalloutEditingHandlers({
    contentEditableRef,
    frameId: args.frameId,
    isEditing: args.isEditing,
    onContentChange: args.onContentChange,
    onDelete: args.onDelete,
    onManualInput: args.stopVoiceInput ?? (() => {}),
    onStartEditing: args.onStartEditing,
    onStopEditing: args.onStopEditing,
    ...(args.titleText === undefined ? {} : { titleText: args.titleText }),
  });

  useCalloutSyncContentEffect({
    contentEditableRef,
    htmlContent: args.htmlContent,
    isEditing: args.isEditing,
  });
  useCalloutMeasureEffect({
    containerRef,
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
    setDimensions,
    settingsKey: args.settingsKey,
  });
  useCalloutEditingFocusEffect({
    contentEditableRef,
    htmlContent: args.htmlContent,
    isEditing: args.isEditing,
  });
  useCalloutEscapeCaptureEffect({
    contentEditableRef,
    finishEditing: handlers.finishEditing,
    isEditing: args.isEditing,
    stopVoiceInput: args.stopVoiceInput ?? (() => {}),
    voiceActive: args.voiceActive === true,
  });
  useCalloutSelectionChangeEffect({ isEditing: args.isEditing, setFloatingToolbarRect });

  return {
    layout: { dimensions, floatingToolbarRect },
    refs: { container: containerRef, contentEditable: contentEditableRef },
    events: {
      applyFormatting: handlers.applyFormatting,
      blur: handlers.handleBlur,
      click: handlers.handleClick,
      finish: handlers.finishEditing,
      input: handlers.handleInput,
      keyDown: handlers.handleKeyDown,
      paste: handlers.handlePaste,
    },
  };
}
