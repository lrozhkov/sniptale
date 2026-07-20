import type { ComponentType } from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';

export interface InteractiveFrameProps {
  defaultEffectMode?: EffectMode;
  frame: FrameData;
  onCancel?: () => void;
  onDelete: () => void;
  onEffectChange?: (frameId: string, mode: EffectMode) => void;
  onStateChange?: (newState: FrameState) => void;
  onUpdate: (newFrame: FrameData) => void;
  zIndex: number;
}

export type InteractiveFrameComponent = ComponentType<InteractiveFrameProps>;
