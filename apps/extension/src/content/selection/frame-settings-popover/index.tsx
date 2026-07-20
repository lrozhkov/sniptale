import { FrameSettingsPopoverBody } from './body';
import type { FrameSettingsPopoverBodyProps } from './types';

export function FrameSettingsPopover({
  isOpen,
  onClose,
  effectMode,
  frameId,
  borderSettings,
  blurSettings,
  focusSettings,
  onApplyToFrame,
  anchorEl,
}: FrameSettingsPopoverBodyProps) {
  const bodyProps = {
    anchorEl,
    effectMode,
    frameId,
    isOpen,
    onApplyToFrame,
    onClose,
    ...(blurSettings === undefined ? {} : { blurSettings }),
    ...(borderSettings === undefined ? {} : { borderSettings }),
    ...(focusSettings === undefined ? {} : { focusSettings }),
  };

  return <FrameSettingsPopoverBody {...bodyProps} />;
}
