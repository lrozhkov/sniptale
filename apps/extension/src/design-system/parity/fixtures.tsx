import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DesignSystemThemeSurface, useDesignSystemThemeSurface } from '../theme';

interface PreviewThemeHarnessResult {
  cleanup: () => void;
  container: HTMLDivElement;
  root: Root;
}

interface ThemeScopedPreviewCase {
  previewKey: string;
  selector: string;
}

export const HIGH_RISK_FLOATING_PREVIEW_KEYS = [
  'product.ui.toast.success',
  'product.ui.toast.error',
  'shared.ui.glass-popover.default',
  'shared.ui.glass-popover.wide',
  'product.ui.toast.countdown',
  'product.ui.modal-shell.default',
  'product.ui.modal-shell.compact',
  'product.ui.modal-actions.toggle',
  'product.ui.toolbar-menu.default',
  'product.ui.toolbar-menu.compact',
  'product.ui.toolbar-menu.selected',
  'product.ui.glass-toolbar.default',
  'product.ui.glass-controls.color-trigger',
  'product.ui.glass-controls.destructive',
  'product.ui.glass-controls.preset-list',
  'product.ui.dropdown-menu.default',
  'product.ui.dropdown-menu.template',
  'product.ui.confirm-dialog.default',
  'product.ui.confirm-dialog.danger',
] as const;

export const THEME_SCOPED_PREVIEW_CASES: ThemeScopedPreviewCase[] = [
  { previewKey: 'product.ui.toast.success', selector: '.sniptale-toast' },
  { previewKey: 'shared.ui.glass-popover.wide', selector: '.sniptale-glass-popover' },
  { previewKey: 'product.ui.toast.countdown', selector: '.sniptale-countdown-toast-container' },
  { previewKey: 'product.ui.modal-shell.compact', selector: '.sniptale-modal' },
  { previewKey: 'product.ui.toolbar-menu.selected', selector: '.sniptale-toolbar-menu' },
  { previewKey: 'product.ui.glass-toolbar.active', selector: '.sniptale-glass-toolbar' },
  { previewKey: 'product.ui.form-controls.range', selector: '.sniptale-range' },
  { previewKey: 'product.ui.glass-controls.range', selector: '.sniptale-glass-range' },
  { previewKey: 'product.ui.glass-controls.destructive', selector: '.sniptale-glass-destructive' },
  { previewKey: 'shared.ui.compact-inspector-controls.range', selector: '.sniptale-range' },
  { previewKey: 'product.ui.dropdown-menu.template', selector: '.sniptale-dropdown-menu' },
  { previewKey: 'product.ui.confirm-dialog.danger', selector: '.sniptale-confirm-dialog' },
];

export function renderThemeSurface(node: ReactNode): PreviewThemeHarnessResult {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(node);
  });

  return {
    container,
    root,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export async function renderPreviewHarness(previewKey: string): Promise<PreviewThemeHarnessResult> {
  const { buildDesignSystemVariantPreviewMap } = await import('../previews');
  const preview = buildDesignSystemVariantPreviewMap('ru').get(previewKey);

  if (!preview) {
    throw new Error(`${previewKey} should exist`);
  }

  function PreviewHarness() {
    const { setPreviewTheme } = useDesignSystemThemeSurface();

    return (
      <>
        <button type="button" data-ui="theme-switch.light" onClick={() => setPreviewTheme('light')}>
          light
        </button>
        <button type="button" data-ui="theme-switch.dark" onClick={() => setPreviewTheme('dark')}>
          dark
        </button>
        {preview}
      </>
    );
  }

  return renderThemeSurface(
    <DesignSystemThemeSurface>
      <PreviewHarness />
    </DesignSystemThemeSurface>
  );
}
