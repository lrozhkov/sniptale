import { useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import { getFrameSettingsPopoverStyle } from './helpers';

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
  anchorEl: HTMLElement | null;
  handleSelectPreset: (preset: BorderPreset) => Promise<void>;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  const getPopoverStyle = useCallback(
    (): CSSProperties => getFrameSettingsPopoverStyle(args.anchorEl),
    [args.anchorEl]
  );

  const handleSelectPresetAndClose = createFrameSettingsPopoverCloseHandler({
    handleSelectPreset: args.handleSelectPreset,
    onClose: args.onClose,
  });

  return {
    getPopoverStyle,
    handleSelectPresetAndClose,
    popoverRef,
  };
}
