import type { RefObject } from 'react';

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
  allowAlpha?: boolean;
  allowTransparent?: boolean;
  className?: string;
  disabled?: boolean;
  floatingBoundaryRef?: RefObject<HTMLElement | null>;
  floatingPlacement?: 'auto' | 'side';
  label: string;
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  onPreviewChange?: (value: string) => void;
  onPreviewReset?: (value: string) => void;
  palette?: readonly string[];
  /** Show palette swatches above picker controls for compact drawing tool palettes. */
  paletteInPicker?: boolean;
  pickerOnly?: boolean;
  recentColors?: readonly string[];
  title: string;
  /** Swatch presentation shows the editable formatted value beside the picker swatch. */
  triggerVariant?: 'value' | 'swatch';
  value: string;
}
