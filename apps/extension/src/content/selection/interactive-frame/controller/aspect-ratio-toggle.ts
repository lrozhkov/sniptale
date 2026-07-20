import type React from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';

export function useInteractiveFrameAspectRatioToggle(params: {
  maintainAspectRatio: boolean;
  setMaintainAspectRatio: React.Dispatch<React.SetStateAction<boolean>>;
  tempFrame: FrameData;
  setAspectRatio: React.Dispatch<React.SetStateAction<number | null>>;
}) {
  return () => {
    const next = !params.maintainAspectRatio;
    params.setMaintainAspectRatio(next);
    if (next && params.tempFrame.width > 0 && params.tempFrame.height > 0) {
      params.setAspectRatio(params.tempFrame.width / params.tempFrame.height);
    }
  };
}
