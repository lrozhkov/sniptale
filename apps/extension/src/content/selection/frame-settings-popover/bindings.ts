import { useRef } from 'react';
import type { BorderPreset } from '../../../features/highlighter/contracts';

function createFrameSettingsPopoverCloseHandler(args: {
  handleSelectPreset: (preset: BorderPreset) => Promise<void>;
  onClose: () => void;
}) {
  return async (preset: BorderPreset) => {
    await args.handleSelectPreset(preset);
    args.onClose();
  };
}

export function useFrameSettingsPopoverBindings(args: {
  handleSelectPreset: (preset: BorderPreset) => Promise<void>;
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
