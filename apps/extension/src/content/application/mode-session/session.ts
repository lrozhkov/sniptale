type ContentMode = 'highlighter' | 'quick-edit' | 'ai-pick' | 'selection-mode';

type DisableHandler = () => void;

const modeState: Record<ContentMode, boolean> = {
  highlighter: false,
  'quick-edit': false,
  'ai-pick': false,
  'selection-mode': false,
};

const disableHandlers: Partial<Record<ContentMode, DisableHandler>> = {};

export function registerContentMode(mode: ContentMode, disable: DisableHandler): void {
  disableHandlers[mode] = disable;
}

export function setContentModeEnabled(mode: ContentMode, enabled: boolean): void {
  modeState[mode] = enabled;
}

export function isContentModeEnabled(mode: ContentMode): boolean {
  return modeState[mode];
}

export function deactivateOtherContentModes(activeMode: ContentMode): void {
  (Object.keys(modeState) as ContentMode[]).forEach((mode) => {
    if (mode === activeMode || !modeState[mode]) {
      return;
    }

    disableHandlers[mode]?.();
  });
}
