import { useRef } from 'react';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import type { FrameSettingsPresetCommitOutcome } from './state/helpers';

function createFrameSettingsPopoverCloseHandler(args: {
  handleSelectPreset: (preset: BorderPreset) => Promise<FrameSettingsPresetCommitOutcome>;
  onClose: () => void;
}) {
  return async (preset: BorderPreset) => {
    const outcome = await args.handleSelectPreset(preset);
    if (outcome === 'accepted') {
      args.onClose();
    }
  };
}

export function useFrameSettingsPopoverBindings(args: {
  handleSelectPreset: (preset: BorderPreset) => Promise<FrameSettingsPresetCommitOutcome>;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleSelectPresetAndClose = createFrameSettingsPopoverCloseHandler({
    handleSelectPreset: args.handleSelectPreset,
    onClose: args.onClose,
  });

  return {
    handleSelectPresetAndClose,
    popoverRef,
  };
}
