import type { BorderPreset } from '../../../features/highlighter/contracts';

export function createFrameSettingsPopoverCloseHandler(args: {
  handleSelectPreset: (preset: BorderPreset) => Promise<void>;
  onClose: () => void;
}) {
  return async (preset: BorderPreset) => {
    await args.handleSelectPreset(preset);
    args.onClose();
  };
}
