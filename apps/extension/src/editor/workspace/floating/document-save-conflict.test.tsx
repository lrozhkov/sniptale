// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import { DocumentSaveError } from './document-save-conflict';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('opens a recoverable error popover without placing action text in the toolbar', async () => {
  act(() =>
    root.render(<DocumentSaveError conflict pending={false} onSaveCopy={async () => undefined} />)
  );
  await act(async () => Promise.resolve());
  const trigger = container?.querySelector<HTMLButtonElement>(
    '[data-ui="editor.floating.document-bar.error-trigger"]'
  );
  expect(trigger?.getAttribute('aria-expanded')).toBe('true');
  expect(container.textContent).not.toContain(translate('editor.documentActions.reloadLatest'));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    translate('editor.documentActions.conflictDescription')
  );
  act(() => trigger?.click());
  expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  act(() => trigger?.click());
  expect(trigger?.getAttribute('aria-expanded')).toBe('true');
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
  act(() => trigger?.click());
  act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  act(() => trigger?.click());
  const close = document.querySelector<HTMLButtonElement>(
    `#editor-save-error button[title="${translate('common.actions.close')}"]`
  );
  act(() => close?.click());
  expect(trigger?.getAttribute('aria-expanded')).toBe('false');
});
