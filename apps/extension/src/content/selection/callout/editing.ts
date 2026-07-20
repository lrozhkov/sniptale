import { useEffect, useRef, useState } from 'react';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import {
  useCalloutBlurRequestEffect,
  useCalloutEditingFocusEffect,
  useCalloutEscapeCaptureEffect,
  useCalloutMeasureEffect,
  useCalloutSelectionChangeEffect,
  useCalloutSyncContentEffect,
} from './editing.effects';
import { useCalloutEditingHandlers } from './editing.handlers';

type UseCalloutEditingArgs = {
  frameId: string;
  htmlContent: string;
  isEditing: boolean;
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
}) {
  return {
    applyFormatting: args.handlers.applyFormatting,
    containerRef: args.containerRef,
    contentEditableRef: args.contentEditableRef,
    dimensions: args.dimensions,
    floatingToolbarRect: args.floatingToolbarRect,
    handleBlur: args.handlers.handleBlur,
    handleClick: args.handlers.handleClick,
    handleInput: args.handlers.handleInput,
    handleKeyDown: args.handlers.handleKeyDown,
    handlePaste: args.handlers.handlePaste,
  };
}

function useCalloutEditingEffects(args: {
  calloutArgs: UseCalloutEditingArgs;
  containerRef: React.RefObject<HTMLDivElement | null>;
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  handlers: ReturnType<typeof useCalloutEditingHandlers>;
  setDimensions: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setFloatingToolbarRect: React.Dispatch<React.SetStateAction<DOMRect | null>>;
}) {
  const { calloutArgs, containerRef, contentEditableRef, handlers } = args;
  useCalloutMeasureEffect({
    containerRef,
    setDimensions: args.setDimensions,
    settingsKey: calloutArgs.settingsKey,
  });
  useCalloutSyncContentEffect({
    contentEditableRef,
    htmlContent: calloutArgs.htmlContent,
    isEditing: calloutArgs.isEditing,
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
  });
  useCalloutSelectionChangeEffect({
    isEditing: calloutArgs.isEditing,
    setFloatingToolbarRect: args.setFloatingToolbarRect,
  });
  useCalloutBlurRequestEffect({
    contentEditableRef,
    finishEditing: handlers.finishEditing,
    frameId: calloutArgs.frameId,
  });
}

export function useCalloutEditing(args: UseCalloutEditingArgs) {
  const contentEditableRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [floatingToolbarRect, setFloatingToolbarRect] = useState<DOMRect | null>(null);
  useCalloutEditingHistoryTransaction(args.frameId, args.isEditing);

  const handlers = useCalloutEditingHandlers({
    contentEditableRef,
    frameId: args.frameId,
    isEditing: args.isEditing,
    onContentChange: args.onContentChange,
    onDelete: args.onDelete,
    onStartEditing: args.onStartEditing,
    onStopEditing: args.onStopEditing,
  });

  useCalloutEditingEffects({
    calloutArgs: args,
    containerRef,
    contentEditableRef,
    handlers,
    setDimensions,
    setFloatingToolbarRect,
  });

  return createCalloutEditingResult({
    containerRef,
    contentEditableRef,
    dimensions,
    floatingToolbarRect,
    handlers,
  });
}
