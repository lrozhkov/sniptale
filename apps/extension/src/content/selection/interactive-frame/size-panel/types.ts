import type { Dispatch, SetStateAction } from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';

export interface SizePanelProps {
  state: FrameState;
  sizePanelCoords: { x: number; y: number };
  tempFrame: FrameData;
  setTempFrame: Dispatch<SetStateAction<FrameData>>;
  maintainAspectRatio: boolean;
  setMaintainAspectRatio: Dispatch<SetStateAction<boolean>>;
  aspectRatio: number | null;
  setAspectRatio: Dispatch<SetStateAction<number | null>>;
  effectMode: EffectMode;
  frameId: string;
  handleSave: () => void;
  handleCancel: () => void;
}
