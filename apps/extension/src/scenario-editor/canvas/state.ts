import { useState } from 'react';
import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';
import type {
  ScenarioCanvasDragSession,
  ScenarioCanvasEndpointSession,
  ScenarioCanvasImageContentSession,
  ScenarioCanvasResizeSession,
  ScenarioCanvasTransactionKind,
} from './types';

export function useInteractionState() {
  const [dragSession, setDragSession] = useState<ScenarioCanvasDragSession | null>(null);
  const [resizeSession, setResizeSession] = useState<ScenarioCanvasResizeSession | null>(null);
  const [endpointSession, setEndpointSession] = useState<ScenarioCanvasEndpointSession | null>(
    null
  );
  const [imageContentSession, setImageContentSession] =
    useState<ScenarioCanvasImageContentSession | null>(null);
  const [transactionKind, setTransactionKind] = useState<ScenarioCanvasTransactionKind | null>(
    null
  );
  const [previewFrame, setPreviewFrame] = useState<ScenarioElementFrame | null>(null);

  function resetInteractionState() {
    setDragSession(null);
    setResizeSession(null);
    setEndpointSession(null);
    setImageContentSession(null);
    setTransactionKind(null);
    setPreviewFrame(null);
  }

  return {
    dragSession,
    endpointSession,
    imageContentSession,
    previewFrame,
    resizeSession,
    resetInteractionState,
    setDragSession,
    setEndpointSession,
    setImageContentSession,
    setPreviewFrame,
    setResizeSession,
    setTransactionKind,
    transactionKind,
  };
}
