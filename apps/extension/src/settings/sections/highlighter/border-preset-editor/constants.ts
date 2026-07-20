export const editorInputClassName =
  'w-full rounded-lg border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_86%,var(--sniptale-color-surface-panel)_14%)] ' +
  'px-3 py-2 ' +
  'text-sm text-[var(--sniptale-color-text-primary)] ' +
  'shadow-[inset_0_1px_0_color-mix(in_srgb,white_8%,transparent)] ' +
  'focus:border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_28%,var(--sniptale-color-border-soft)_72%)] ' +
  'focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]';

export const editorPreviewFrameClassName = [
  'flex h-32 w-32 items-center justify-center rounded-lg transition-colors',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_82%,var(--sniptale-color-surface-panel)_18%)]',
].join(' ');

export const editorActiveOptionClassName = [
  'border border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,var(--sniptale-color-border-soft)_82%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_16%,transparent)]',
  'text-[var(--sniptale-color-accent-emphasis)]',
].join(' ');

export const editorIdleOptionClassName = [
  'border border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_80%,var(--sniptale-color-surface-panel)_20%)]',
  'text-[var(--sniptale-color-text-muted)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_72%,transparent)]',
].join(' ');

export const editorTextareaClassName = [
  editorInputClassName,
  'resize-none font-mono placeholder:text-[var(--sniptale-color-text-dim)]',
  'focus:ring-1 focus:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]',
].join(' ');

export const editorResizeHandleClassName = [
  'absolute bottom-0 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-t transition-colors',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-text-dim)_38%,transparent)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-text-muted)_44%,transparent)]',
].join(' ');
