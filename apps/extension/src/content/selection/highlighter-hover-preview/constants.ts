export const HIGHLIGHTER_EXTENSION_UI_CLASSES = [
  'sniptale-highlight',
  'sniptale-highlight-hover',
  'sniptale-highlight-container',
  'sniptale-frames-container',
  'sniptale-interactive-frame',
  'sniptale-action-toolbar',
  'sniptale-effect-toggle',
  'sniptale-resize-handle',
  'sniptale-focus-overlay',
  'sniptale-frame-settings-popover',
  'sniptale-step-badge-popover',
  'sniptale-callout-settings-popover',
  'sniptale-step-badge',
  'sniptale-callout',
  'sniptale-callout-format-toolbar',
] as const;

export const HIGHLIGHTER_EXTENSION_UI_SELECTOR = [
  '.sniptale-action-toolbar',
  '.sniptale-effect-toggle',
  '.sniptale-resize-handle',
  '.sniptale-frame-settings-popover',
  '.sniptale-step-badge-popover',
  '.sniptale-callout-settings-popover',
  '.sniptale-step-badge',
  '.sniptale-callout',
  '.sniptale-callout-format-toolbar',
].join(', ');
