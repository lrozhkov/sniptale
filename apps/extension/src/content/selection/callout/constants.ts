import {
  DEFAULT_COLOR_ACCENT,
  DEFAULT_COLOR_DANGER,
  DEFAULT_COLOR_INFO,
  DEFAULT_COLOR_SUCCESS,
  DEFAULT_COLOR_TEXT_INVERSE,
  DEFAULT_COLOR_TEXT_PANEL,
  DEFAULT_COLOR_WARNING,
} from '@sniptale/ui/default-colors/constants';

export const CALLOUT_GAP = 8;
export const MIN_TAIL_EDGE_MARGIN = 10;

export const FONT_FAMILY_MAP: Record<string, string> = {
  sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

export const CALLOUT_BACKGROUND_PRESETS = [
  DEFAULT_COLOR_TEXT_PANEL,
  '#ffffff',
  DEFAULT_COLOR_DANGER,
  DEFAULT_COLOR_ACCENT,
  DEFAULT_COLOR_WARNING,
  DEFAULT_COLOR_SUCCESS,
  DEFAULT_COLOR_INFO,
];

export const CALLOUT_TEXT_PRESETS = [
  DEFAULT_COLOR_TEXT_INVERSE,
  '#111827',
  DEFAULT_COLOR_DANGER,
  DEFAULT_COLOR_ACCENT,
  DEFAULT_COLOR_SUCCESS,
  DEFAULT_COLOR_INFO,
];
