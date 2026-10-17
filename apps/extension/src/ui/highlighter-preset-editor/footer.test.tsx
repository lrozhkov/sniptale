// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HighlighterPresetEditorFooter } from './footer';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const result = Array.from(host.querySelectorAll('button')).find(
    (node) => node.textContent === label
  );
  if (!result) throw new Error(`Footer command ${label} is missing`);
  return result;
}

it('requires a nonempty name for Save and leaves Cancel available while saving', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const render = (name: string, isSaving: boolean) =>
    act(() =>
      root.render(
        <HighlighterPresetEditorFooter
          name={name}
          isSaving={isSaving}
          onSave={onSave}
          onClose={onClose}
          resetLabel="Reset preset"
        />
      )
    );
  render('   ', false);
  expect(button('common.actions.save').disabled).toBe(true);
  act(() => button('common.actions.save').click());
  expect(onSave).not.toHaveBeenCalled();
  render('Preset', false);
  act(() => button('common.actions.save').click());
  expect(onSave).toHaveBeenCalledOnce();
  render('Preset', true);
  expect(button('common.actions.save').disabled).toBe(true);
  expect(button('common.actions.cancel').disabled).toBe(false);
  act(() => button('common.actions.cancel').click());
  expect(onClose).toHaveBeenCalledOnce();
  expect(host.textContent).not.toContain('Reset preset');
});

it('runs only the caller-admitted reset command and blocks it during a save', () => {
  const onReset = vi.fn();
  const render = (isSaving: boolean) =>
    act(() =>
      root.render(
        <HighlighterPresetEditorFooter
          name="Preset"
          isSaving={isSaving}
          onSave={vi.fn()}
          onClose={vi.fn()}
          onReset={onReset}
          resetLabel="Reset preset"
        />
      )
    );
  render(true);
  expect(button('Reset preset').disabled).toBe(true);
  act(() => button('Reset preset').click());
  expect(onReset).not.toHaveBeenCalled();
  render(false);
  act(() => button('Reset preset').click());
  expect(onReset).toHaveBeenCalledOnce();
});
