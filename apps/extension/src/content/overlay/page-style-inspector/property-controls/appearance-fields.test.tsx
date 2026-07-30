// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { AppearanceSection } from './sections/appearance';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

it('keeps direct appearance controls and omits background asset and gradient inputs', () => {
  const actions: PageStyleInspectorActions = {
    close: vi.fn(),
    comment: {
      commit: vi.fn(() => true),
      endComposition: vi.fn(),
      startComposition: vi.fn(),
      updateDraft: vi.fn(),
    },
    resetValue: vi.fn(),
    setSideFieldLinked: vi.fn(),
    updateValue: vi.fn(),
    updateValues: vi.fn(),
  };
  const state: PageStyleInspectorViewState = {
    comment: { commitFailed: false, draft: '', marker: null },
    defaultValues: { 'background-color': '#ffffff', 'box-shadow': 'none' },
    draftPatch: { declarations: [] },
    modifiedProperties: [],
    selection: null,
    values: { 'background-color': '#ffffff', 'box-shadow': 'none' },
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
