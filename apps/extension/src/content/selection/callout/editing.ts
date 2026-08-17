import { useCallback, useEffect, useRef, useState } from 'react';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import {
  useCalloutEditingFocusEffect,
  useCalloutEscapeCaptureEffect,
  useCalloutMeasureEffect,
  useCalloutSelectionChangeEffect,
  useCalloutSyncContentEffect,
} from '../../../features/highlighter/frame-annotation/callout/editing-effects';
import { useCalloutEditingHandlers } from '../../../features/highlighter/frame-annotation/callout/editing-handlers';
import { useCalloutBlurRequestEffect } from './editing-blur-request-effect';
import { useCalloutVoiceInput } from './voice-input';

type UseCalloutEditingArgs = {
  frameId: string;
  htmlContent: string;
  titleText?: string;
  isEditing: boolean;
  measurementScale?: number;
  onContentChange: (htmlContent: string) => void;
  onDelete: () => void;
  onStartEditing: () => void;
  onStopEditing: () => void;
  settingsKey: string;
};

function useCalloutEditingHistoryTransaction(frameId: string, isEditing: boolean) {
  const wasEditingRef = useRef(false);

  useEffect(() => {
    const transactionKey = `callout-editing:${frameId}`;

    if (isEditing && !wasEditingRef.current) {
      pagePreparationHistory.beginTransaction(transactionKey);
    } else if (!isEditing && wasEditingRef.current) {
      pagePreparationHistory.commitTransaction(transactionKey);
    }

    wasEditingRef.current = isEditing;
  }, [frameId, isEditing]);

  useEffect(() => {
    return () => {
      if (wasEditingRef.current) {
        pagePreparationHistory.cancelTransaction(`callout-editing:${frameId}`);
      }
    };
  }, [frameId]);
}

function createCalloutEditingResult(args: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  dimensions: { width: number; height: number };
  floatingToolbarRect: DOMRect | null;
  handlers: ReturnType<typeof useCalloutEditingHandlers>;
  voice: ReturnType<typeof useCalloutVoiceInput>;
}) {
  return {
    applyFormatting: args.handlers.applyFormatting,
    containerRef: args.containerRef,
    contentEditableRef: args.contentEditableRef,
    dimensions: args.dimensions,
    floatingToolbarRect: args.floatingToolbarRect,
    handleBlur: args.handlers.handleBlur,
    handleClick: args.handlers.handleClick,
    finishEditing: args.handlers.finishEditing,
    handleInput: args.handlers.handleInput,
    handleKeyDown: args.handlers.handleKeyDown,
    handlePaste: args.handlers.handlePaste,
    voice: args.voice,
  };
}

function useCalloutEditingEffects(args: {
  calloutArgs: UseCalloutEditingArgs;
  containerRef: React.RefObject<HTMLDivElement | null>;
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  handlers: ReturnType<typeof useCalloutEditingHandlers>;
  pendingHtmlContentRef: React.MutableRefObject<string | null>;
  voice: ReturnType<typeof useCalloutVoiceInput>;
  setDimensions: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setFloatingToolbarRect: React.Dispatch<React.SetStateAction<DOMRect | null>>;
}) {
  const { calloutArgs, containerRef, contentEditableRef, handlers } = args;
  useCalloutSyncContentEffect({
    contentEditableRef,
    htmlContent: calloutArgs.htmlContent,
    isEditing: calloutArgs.isEditing,
    pendingHtmlContentRef: args.pendingHtmlContentRef,
  });
  useCalloutMeasureEffect({
    containerRef,
    ...(calloutArgs.measurementScale === undefined
      ? {}
      : { measurementScale: calloutArgs.measurementScale }),
    setDimensions: args.setDimensions,
    settingsKey: calloutArgs.settingsKey,
  });
  useCalloutEditingFocusEffect({
    contentEditableRef,
    htmlContent: calloutArgs.htmlContent,
    isEditing: calloutArgs.isEditing,
  });
  useCalloutEscapeCaptureEffect({
    contentEditableRef,
    finishEditing: handlers.finishEditing,
    isEditing: calloutArgs.isEditing,
    stopVoiceInput: args.voice.actions.stop,
    voiceActive: args.voice.state.active,
  });
  useCalloutSelectionChangeEffect({
    isEditing: calloutArgs.isEditing,
    setFloatingToolbarRect: args.setFloatingToolbarRect,
  });
  useCalloutBlurRequestEffect({
    contentEditableRef,
    finishEditing: handlers.finishEditing,
    frameId: calloutArgs.frameId,
    isEditing: calloutArgs.isEditing,
  });
}

export function useCalloutEditing(args: UseCalloutEditingArgs) {
  const { onContentChange } = args;
  const contentEditableRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [floatingToolbarRect, setFloatingToolbarRect] = useState<DOMRect | null>(null);
  const pendingHtmlContentRef = useRef<string | null>(null);
  const handleContentChange = useCallback(
    (htmlContent: string) => {
      pendingHtmlContentRef.current = htmlContent;
      onContentChange(htmlContent);
    },
    [onContentChange]
  );
  useCalloutEditingHistoryTransaction(args.frameId, args.isEditing);
  const voice = useCalloutVoiceInput({
    contentEditableRef,
    isEditing: args.isEditing,
    onContentChange: handleContentChange,
  });

  const handlers = useCalloutEditingHandlers({
    contentEditableRef,
    frameId: args.frameId,
    isEditing: args.isEditing,
    onManualInput: voice.actions.stop,
    onContentChange: handleContentChange,
    onDelete: args.onDelete,
    ...(args.titleText === undefined ? {} : { titleText: args.titleText }),
    onStartEditing: args.onStartEditing,
    onStopEditing: args.onStopEditing,
  });

  useCalloutEditingEffects({
    calloutArgs: args,
    containerRef,
    contentEditableRef,
    handlers,
    pendingHtmlContentRef,
    voice,
    setDimensions,
    setFloatingToolbarRect,
  });

  return createCalloutEditingResult({
    containerRef,
    contentEditableRef,
    dimensions,
    floatingToolbarRect,
    handlers,
    voice,
  });
}
