const COLOR_SELECTOR_FORMAT_MODES = ['hex', 'rgb', 'hsl'] as const;
export type ColorSelectorFormatMode = (typeof COLOR_SELECTOR_FORMAT_MODES)[number];

export function getNextColorSelectorFormatMode(
  currentMode: ColorSelectorFormatMode
): ColorSelectorFormatMode {
  const nextIndex =
    (COLOR_SELECTOR_FORMAT_MODES.indexOf(currentMode) + 1) % COLOR_SELECTOR_FORMAT_MODES.length;
  return COLOR_SELECTOR_FORMAT_MODES[nextIndex] as ColorSelectorFormatMode;
}

export interface CompactColorSelectorProps {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  onPreviewChange?: (value: string) => void;
  onPreviewReset?: (value: string) => void;
  palette?: readonly string[];
  recentColors?: readonly string[];
  title: string;
  value: string;
}
