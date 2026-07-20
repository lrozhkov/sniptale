import { useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import { getFrameSettingsPopoverStyle } from './helpers';
import { createFrameSettingsPopoverCloseHandler } from './handlers';

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
