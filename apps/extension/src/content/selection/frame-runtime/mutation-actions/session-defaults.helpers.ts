import type {
  BlurSettings,
  EffectMode,
  FocusSettings,
  FrameData,
} from '../../../../features/highlighter/contracts';
import { useFrameUIStore } from '../state/frame-ui.store';

export function resolveSessionFrameDefaults(args: {
  existingFrames: FrameData[];
  fallbackEffectMode: EffectMode;
  fallbackBlurSettings: BlurSettings;
  fallbackFocusSettings: FocusSettings;
}) {
  const { activeFrameId, popoverFrameId } = useFrameUIStore.getState();
  const sourceFrameId = popoverFrameId ?? activeFrameId;
  const sourceFrame =
    (sourceFrameId ? args.existingFrames.find((frame) => frame.id === sourceFrameId) : undefined) ??
    args.existingFrames.at(-1);
  const sourceEffectMode = sourceFrame?.effectMode ?? args.fallbackEffectMode;

  if (!sourceFrame || args.fallbackEffectMode !== 'border' || sourceEffectMode === 'border') {
    return {
      effectMode: args.fallbackEffectMode,
      blurSettings: { ...args.fallbackBlurSettings },
      focusSettings: { ...args.fallbackFocusSettings },
    };
  }

  return {
    effectMode: sourceEffectMode,
    blurSettings: sourceFrame.blurSettings
      ? { ...sourceFrame.blurSettings }
      : { ...args.fallbackBlurSettings },
    focusSettings: sourceFrame.focusSettings
      ? { ...sourceFrame.focusSettings }
      : { ...args.fallbackFocusSettings },
  };
}
