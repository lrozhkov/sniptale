import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

function readWorkspaceSource(specifier: string) {
  return readFileSync(new URL(import.meta.resolve(specifier)), 'utf8');
}

const toolbarStylesheetRoot = readWorkspaceSource('@sniptale/ui/styles/toolbar');
const toolbarShellStylesheet = readWorkspaceSource('@sniptale/ui/styles/toolbar/shell');
const toolbarShellVariablesStylesheet = readWorkspaceSource(
  '@sniptale/ui/styles/toolbar-shell/variables'
);
const toolbarShellLayoutStylesheet = readWorkspaceSource(
  '@sniptale/ui/styles/toolbar-shell/layout'
);
const toolbarShellButtonStylesheet = readWorkspaceSource(
  '@sniptale/ui/styles/toolbar-shell/button'
);
const toolbarShellVerticalStylesheet = readWorkspaceSource(
  '@sniptale/ui/styles/toolbar-shell/vertical'
);
const toolbarMenuSurfaceStylesheet = readWorkspaceSource(
  '@sniptale/ui/styles/toolbar/menu-surface'
);
const toolbarMenuItemsStylesheet = readWorkspaceSource('@sniptale/ui/styles/toolbar/menu-items');
const toolbarMenuStatusStylesheet = readWorkspaceSource('@sniptale/ui/styles/toolbar/menu-status');
const toolbarShellOwnerStylesheet = [
  toolbarShellVariablesStylesheet,
  toolbarShellLayoutStylesheet,
  toolbarShellButtonStylesheet,
  toolbarShellVerticalStylesheet,
].join('\n');
const toolbarStylesheet = [
  toolbarStylesheetRoot,
  toolbarShellOwnerStylesheet,
  toolbarMenuSurfaceStylesheet,
  toolbarMenuItemsStylesheet,
  toolbarMenuStatusStylesheet,
].join('\n');
const sharedStylesheet = readWorkspaceSource('@sniptale/ui/styles');
const contentRuntimeEffectsStylesheet = readFileSync(
  new URL('../../public/preparation-surface/effects.css', import.meta.url),
  'utf8'
);
const quickEditCursorSource = readFileSync(
  new URL('../../selection/quick-edit-runtime/cursor.ts', import.meta.url),
  'utf8'
);
const glassToolbarLayoutStylesheet = readWorkspaceSource(
  '@sniptale/ui/styles/glass/toolbar-form-layout'
);
const glassInputControlsStylesheet = readWorkspaceSource(
  '@sniptale/ui/styles/glass/input-controls'
);
const glassColorControlsStylesheet = readWorkspaceSource(
  '@sniptale/ui/styles/glass/color-controls'
);
const glassToolbarCompositeStylesheet = [
  glassToolbarLayoutStylesheet,
  glassInputControlsStylesheet,
  glassColorControlsStylesheet,
].join('\n');
const contentToolbarSource = readWorkspaceSource('@sniptale/ui/content-toolbar');
const toolbarModeButtonsSource = readFileSync(
  new URL('./controls/modes.tsx', import.meta.url),
  'utf8'
);
const toolbarSecondaryControlsSource = readFileSync(
  new URL('./controls/secondary.tsx', import.meta.url),
  'utf8'
);
const interactiveFrameToolbarSectionsSource = readFileSync(
  new URL('../../selection/interactive-frame/toolbar/sections.tsx', import.meta.url),
  'utf8'
);

function expectActiveAccentContract(): void {
  expect(toolbarStylesheet).toContain('color: var(--sniptale-color-accent);');
  expect(toolbarStylesheet).not.toContain(
    'inset 0 0 18px color-mix(in srgb, var(--sniptale-color-accent) 14%, transparent)'
  );
  expect(toolbarStylesheet).not.toContain(
    '0 0 14px color-mix(in srgb, var(--sniptale-color-accent) 14%, transparent);'
  );
  expect(toolbarStylesheet).toContain(".sniptale-toggle[data-active='true']:hover:not(:disabled)");
  expect(toolbarStylesheet).toContain('color: var(--sniptale-color-accent-emphasis);');
  expect(toolbarStylesheet).toContain(
    'background: color-mix(in srgb, var(--sniptale-color-accent) 10%, transparent);'
  );
  expect(toolbarStylesheet).toContain(
    'box-shadow: 0 0 0 1px color-mix(in srgb, var(--sniptale-color-accent) 8%, transparent);'
  );
  expect(toolbarStylesheet).toContain('.sniptale-toolbar .sniptale-btn::after {');
  expect(toolbarStylesheet).toContain('content: none !important;');
  expect(toolbarStylesheet).toContain('display: none !important;');
}

function expectToolbarSizeContract(): void {
  expect(toolbarShellStylesheet.trim()).toBe(
    [
      "@import '../toolbar-shell/variables.css';",
      "@import '../toolbar-shell/layout.css';",
      "@import '../toolbar-shell/button.css';",
      "@import '../toolbar-shell/vertical.css';",
    ].join('\n')
  );
  expect(toolbarShellVariablesStylesheet).toContain('--sniptale-toolbar-shell-height: 50px;');
  expect(toolbarShellVariablesStylesheet).toContain('--sniptale-toolbar-button-size: 36px;');
  expect(toolbarShellVariablesStylesheet).toContain(
    '--sniptale-toolbar-vertical-inline-size: var(--sniptale-toolbar-shell-height);'
  );
  expect(toolbarShellVariablesStylesheet).toContain(
    '--sniptale-radius: var(--sniptale-radius-md);'
  );
  expect(toolbarShellVariablesStylesheet).toContain(
    '--sniptale-border: var(--sniptale-color-border-soft);'
  );
  expect(toolbarShellVariablesStylesheet).toContain('--sniptale-shadow:');
  expect(toolbarShellVariablesStylesheet).toContain('0 14px 28px -22px');
  expect(toolbarShellVariablesStylesheet).toContain('0 6px 14px -12px');
  expect(toolbarShellLayoutStylesheet).toContain('height: auto;');
  expect(toolbarShellLayoutStylesheet).toContain('padding: var(--sniptale-toolbar-shell-padding);');
  expect(toolbarShellLayoutStylesheet).toContain('margin: var(--sniptale-toolbar-divider-margin);');
  expect(toolbarShellLayoutStylesheet).toContain('0 18px 34px -22px');
  expect(toolbarShellLayoutStylesheet).toContain('0 8px 18px -12px');
  expect(contentToolbarSource).toContain("'sniptale-glass-toolbar'");
  expect(contentToolbarSource).toContain("'sniptale-glass-toolbar-divider'");
  expect(contentToolbarSource).toContain("'sniptale-glass-toolbar-button'");
  expect(contentToolbarSource).toContain("active && 'sniptale-glass-toolbar-button--active'");
  expect(contentToolbarSource).toContain("tone === 'close' && 'sniptale-btn-close'");
  expect(contentToolbarSource).not.toContain('sniptale-btn-sm sniptale-btn-close');
  expect(toolbarStylesheet).toContain('interpolate-size: allow-keywords;');
  expectVerticalToolbarContract();
  expectToolbarModeIconContract();
  expectToolbarSecondaryControlsContract();
  expect(toolbarShellButtonStylesheet).toContain(
    'box-shadow: 0 0 0 1px color-mix(in srgb, var(--sniptale-color-danger) 8%, transparent);'
  );
  expect(interactiveFrameToolbarSectionsSource).toContain('<Pencil size={18} />');
  expect(interactiveFrameToolbarSectionsSource).toContain('<Trash2 size={18} />');
}

function expectVerticalToolbarContract(): void {
  expect(toolbarShellVerticalStylesheet).toContain(
    ".sniptale-toolbar[data-display-mode='vertical'] {"
  );
  expect(toolbarShellVerticalStylesheet).toContain(
    'inline-size: var(--sniptale-toolbar-vertical-inline-size);'
  );
  expect(toolbarShellVerticalStylesheet).toContain(
    ".sniptale-toolbar[data-display-mode='vertical'] .sniptale-group {"
  );
  expect(toolbarShellVerticalStylesheet).toContain('width: 100%;');
  expect(toolbarShellVerticalStylesheet).toContain('flex-direction: column;');
  expect(toolbarShellVerticalStylesheet).toContain('flex-wrap: nowrap;');
  expect(toolbarShellVerticalStylesheet).toContain(
    ".sniptale-toolbar[data-display-mode='vertical'] .sniptale-btn,"
  );
  expect(toolbarShellVerticalStylesheet).toContain(
    ".sniptale-toolbar[data-display-mode='vertical'] .sniptale-mode-wrapper,"
  );
  expect(toolbarShellVerticalStylesheet).toContain('.sniptale-mode-wrapper,');
  expect(toolbarShellVerticalStylesheet).toContain('.sniptale-settings-wrapper,');
}

function expectToolbarMenuContract(): void {
  expect(toolbarMenuSurfaceStylesheet).toContain('.sniptale-popover-menu {');
  expect(toolbarMenuSurfaceStylesheet).toContain('.sniptale-toolbar-menu-title {');
  expect(toolbarMenuItemsStylesheet).toContain('.sniptale-popover-item {');
  expect(toolbarMenuItemsStylesheet).toContain('.sniptale-popover-item-selected {');
  expect(toolbarMenuItemsStylesheet).toContain('.sniptale-toolbar-menu-item-badge {');
  expect(toolbarMenuStatusStylesheet).toContain('.sniptale-timer-badge,');
  expect(toolbarMenuStatusStylesheet).toContain('.sniptale-viewport-badge {');
}

function expectToolbarModeIconContract(): void {
  expect(toolbarStylesheet).toContain('.sniptale-toolbar-menu-item > svg,');
  expect(toolbarStylesheet).toContain(
    '.sniptale-toolbar-menu-item > .sniptale-toolbar-mode-icon {'
  );
  expect(toolbarModeButtonsSource).toContain(
    "const MODE_ICON_CLASS_NAME = 'sniptale-toolbar-mode-icon"
  );
  expect(toolbarModeButtonsSource).toContain('h-[18px] w-[18px]');
  expect(toolbarModeButtonsSource).toContain('size={18}');
}

function expectToolbarSecondaryControlsContract(): void {
  expect(toolbarSecondaryControlsSource).toContain(
    'displayMode={args.viewModel.derivedState.displayMode}'
  );
  expect(toolbarSecondaryControlsSource).toContain('<ToolbarScenarioControls');
  expect(toolbarSecondaryControlsSource).not.toContain('<ContentToolbarDivider />');
  expect(toolbarSecondaryControlsSource).toContain(
    'onDisplayModeChange: args.viewModel.derivedState.setDisplayMode'
  );
}

it('keeps accent-colored active icons without restoring hover tint tooltips', () => {
  expectActiveAccentContract();
});

it('keeps the frame tooltip active-hover effect in sync with the floating toolbar', () => {
  const activeHoverBlock = glassToolbarCompositeStylesheet.match(
    /\.sniptale-glass-toolbar-button--active:hover\s*\{[^}]+\}/
  )?.[0];

  expect(activeHoverBlock).toBeTruthy();
  expect(activeHoverBlock).toContain('color: var(--sniptale-color-accent-emphasis);');
  expect(activeHoverBlock).toContain(
    'background: color-mix(in srgb, var(--sniptale-color-accent) 9%, transparent);'
  );
  expect(activeHoverBlock).toContain('box-shadow: none;');
  expect(activeHoverBlock).not.toContain('0 0 14px');
});

it('keeps the main screenshot toolbar size contract aligned with the frame tooltip', () => {
  expectToolbarSizeContract();
});

it('keeps toolbar menu surfaces, items, and status badges on canonical owners', () => {
  expectToolbarMenuContract();
});

it('disables the legacy quick-edit outline once the active frame owns the border', () => {
  expect(sharedStylesheet).not.toContain('.sniptale-editing {');
  expect(sharedStylesheet).not.toContain('.sniptale-editing:focus {');
  expect(contentRuntimeEffectsStylesheet).toContain('.sniptale-editing {');
  expect(contentRuntimeEffectsStylesheet).toContain('outline: none !important;');
  expect(contentRuntimeEffectsStylesheet).toContain('.sniptale-editing:focus {');
  expect(contentRuntimeEffectsStylesheet).toContain('box-shadow: none !important;');
  expect(quickEditCursorSource).toContain("[contenteditable='true']:focus");
  expect(quickEditCursorSource).toContain('outline: none !important;');
  expect(quickEditCursorSource).toContain('box-shadow: none !important;');
});
