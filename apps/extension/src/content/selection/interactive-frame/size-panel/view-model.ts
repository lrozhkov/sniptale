import type { SizePanelProps } from './types';
import { useInteractiveFrameAspectRatioToggle } from '../controller/aspect-ratio-toggle';
import { useInteractiveFrameSizePanelControls } from './controls';

export function useInteractiveFrameSizePanelViewModel(props: SizePanelProps) {
  return {
    controls: useInteractiveFrameSizePanelControls(props),
    handleAspectRatioToggle: useInteractiveFrameAspectRatioToggle({
      maintainAspectRatio: props.maintainAspectRatio,
      setMaintainAspectRatio: props.setMaintainAspectRatio,
      tempFrame: props.tempFrame,
      setAspectRatio: props.setAspectRatio,
    }),
  };
}
