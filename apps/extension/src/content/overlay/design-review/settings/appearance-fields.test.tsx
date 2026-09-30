// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { AppearanceSection } from './sections/appearance';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const actions: DesignReviewActions = {
  close: vi.fn(),
  comment: {
    commit: vi.fn(() => true),
    endComposition: vi.fn(),
    startComposition: vi.fn(),
    updateDraft: vi.fn(),
  },
  copyElement: vi.fn(async () => undefined),
  copyPath: vi.fn(async () => undefined),
  delete: vi.fn(),
  resetValue: vi.fn(),
  selectAction: vi.fn(),
  setSettingsOpen: vi.fn(),
  setSideFieldLinked: vi.fn(),
  updateValue: vi.fn(),
  updateValues: vi.fn(),
  voice: { start: vi.fn(), stop: vi.fn() },
};

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

it('keeps direct appearance controls and omits background asset and gradient inputs', () => {
  const state: DesignReviewViewState = {
    action: 'refine',
    anchor: null,
    comment: { commitFailed: false, draft: '', marker: null },
    defaultValues: { 'background-color': '#ffffff', 'box-shadow': 'none' },
    draftPatch: { declarations: [] },
    modifiedProperties: [],
    selection: null,
    settingsOpen: true,
    values: { 'background-color': '#ffffff', 'box-shadow': 'none' },
    voice: {
      active: false,
      audioLevel: 0,
      caretPosition: null,
      errorCode: null,
      phase: 'idle',
    },
  };

  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<AppearanceSection actions={actions} disabled={false} state={state} />));

  expect(document.body.textContent).toContain('Цвет фона');
  expect(document.body.textContent).toContain('Тень');
  expect(document.body.textContent).not.toContain('Градиент');
  expect(document.body.textContent).not.toContain('Файл фона');
  expect(document.querySelector('input[type="file"]')).toBeNull();
});

it('applies a selected background color from the picker', () => {
  const onChange = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <AppearanceSection
        actions={{ ...actions, updateValue: onChange }}
        disabled={false}
        state={{
          action: 'refine',
          anchor: null,
          comment: { commitFailed: false, draft: '', marker: null },
          defaultValues: { 'background-color': '#ffffff' },
          draftPatch: { declarations: [] },
          modifiedProperties: [],
          selection: null,
          settingsOpen: true,
          values: { 'background-color': '#ffffff' },
          voice: {
            active: false,
            audioLevel: 0,
            caretPosition: null,
            errorCode: null,
            phase: 'idle',
          },
        }}
      />
    )
  );
  const backgroundRow = host.querySelector('[data-field-label="Цвет фона"]');
  const trigger = backgroundRow?.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.color-selector.picker-trigger"]'
  );
  act(() => trigger?.click());
  const hex = document.querySelector<HTMLInputElement>('input[aria-label="HEX"]');
  expect(hex).not.toBeNull();
  act(() => {
    if (!hex) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(hex, '#123456');
    hex.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(onChange).not.toHaveBeenCalled();
  const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Отмена'
  );
  act(() => cancel?.click());
  expect(onChange).not.toHaveBeenCalled();
  act(() => trigger?.click());
  const reopenedHex = document.querySelector<HTMLInputElement>('input[aria-label="HEX"]');
  expect(reopenedHex?.value).toBe('#FFFFFF');
  act(() => {
    if (!reopenedHex) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      reopenedHex,
      '#123456'
    );
    reopenedHex.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const apply = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Применить'
  );
  expect(apply?.disabled).toBe(false);
  act(() => apply?.click());
  expect(onChange).toHaveBeenCalledWith('background-color', '#123456');
});
