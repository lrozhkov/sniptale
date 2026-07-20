import { resumeHighlighter } from '../../highlighter';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import type { EffectMode, FrameData } from '../../../../features/highlighter/contracts';

function mergeFrameEffectSettings(frame: FrameData, effectMode: EffectMode): FrameData {
  return {
    ...frame,
    effectMode,
    ...(frame.blurSettings === undefined ? {} : { blurSettings: frame.blurSettings }),
    ...(frame.focusSettings === undefined ? {} : { focusSettings: frame.focusSettings }),
  };
}

export function saveInteractiveFrame(params: {
  tempFrame: FrameData;
  effectMode: EffectMode;
  frame: FrameData;
  onUpdate: (frame: FrameData) => void;
  setState: React.Dispatch<React.SetStateAction<'idle' | 'hover' | 'editing'>>;
}) {
  resumeHighlighter();
  params.onUpdate(mergeFrameEffectSettings(params.tempFrame, params.effectMode));
  params.setState('idle');
}

export function cancelInteractiveFrameEditing(params: {
  startFrameRef: React.MutableRefObject<FrameData>;
  startEffectModeRef: React.MutableRefObject<EffectMode>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  setEffectMode: React.Dispatch<React.SetStateAction<EffectMode>>;
  onUpdate: (frame: FrameData) => void;
  onCancel?: () => void;
  setState: React.Dispatch<React.SetStateAction<'idle' | 'hover' | 'editing'>>;
}) {
  resumeHighlighter();
  const savedFrame = params.startFrameRef.current;
  const savedEffectMode = params.startEffectModeRef.current;
  params.setTempFrame(savedFrame);
  params.setEffectMode(savedEffectMode);
  params.onUpdate(mergeFrameEffectSettings(savedFrame, savedEffectMode));
  params.onCancel?.();
  params.setState('idle');
}

export function deleteInteractiveFrame(params: {
  onDelete: () => void;
  setState: React.Dispatch<React.SetStateAction<'idle' | 'hover' | 'editing'>>;
}) {
  resumeHighlighter();
  params.onDelete();
  params.setState('idle');
}

export function toggleInteractiveFrameEffectMode(params: {
  mode: EffectMode;
  frameId: string;
  effectMode: EffectMode;
  closePopover: () => void;
  openPopover: (frameId: string) => void;
  setEffectMode: React.Dispatch<React.SetStateAction<EffectMode>>;
  onEffectChange?: (frameId: string, mode: EffectMode) => void;
}) {
  const currentPopoverFrameId = useFrameUIStore.getState().popoverFrameId;
  const isCurrentlyOpen = currentPopoverFrameId === params.frameId;

  if (params.effectMode === params.mode) {
    if (isCurrentlyOpen) {
      params.closePopover();
    } else {
      params.openPopover(params.frameId);
    }
    return;
  }

  if (isCurrentlyOpen) {
    params.closePopover();
  }
  params.setEffectMode(params.mode);
  params.onEffectChange?.(params.frameId, params.mode);
}
