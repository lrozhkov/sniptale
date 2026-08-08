// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSystemStepBadgePresetCatalog } from '../../../../../features/highlighter/step-badge-presets/catalog';
import { StepBadgePresetEditor } from './editor';
import type { StepBadgePresetCatalogController } from './types';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function actions(): StepBadgePresetCatalogController['actions'] {
  return {
    add: vi.fn(),
    closeEditor: vi.fn(),
    delete: vi.fn(async () => undefined),
    edit: vi.fn(),
    moveBefore: vi.fn(),
    reset: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
    setDefault: vi.fn(async () => undefined),
    toggle: vi.fn(async () => undefined),
  };
}

function createController(editing = true): StepBadgePresetCatalogController {
  const presets = createSystemStepBadgePresetCatalog();
  return {
    actions: actions(),
    catalog: {
      catalogCustomized: false,
      defaultPresetId: presets[0]!.id,
      presets,
      systemCatalogRevision: 1,
    },
    editor: { isOpen: true, ...(editing ? { preset: presets[0]! } : {}) },
    error: false,
    isLoading: false,
    isSaving: false,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('edits positioning, numbering, appearance, and saves a system preset in place', async () => {
  const controller = createController();
  await act(async () => root.render(<StepBadgePresetEditor controller={controller} />));
  expect(document.body.textContent).toContain('highlighter.stepBadgePresets.editor.editTitle');
  expect(document.body.textContent).toContain('content.stepBadge.autoTitle');
  expect(
    document.querySelector('[data-ui="shared.step-badge-preset-editor.inspector"]')
  ).not.toBeNull();
  expect(
    document.querySelector('[data-ui="shared.highlighter-manual-inspector-surface"]')
  ).not.toBeNull();
  expect(
    document.querySelector('[data-ui="shared.categorized-inspector.section-heading"]')?.textContent
  ).toBe('content.stepBadge.numberingSection');
  const positionSection = document.querySelector<HTMLButtonElement>(
    'button[aria-label="content.stepBadge.positionSection"]'
  );
  await act(async () => positionSection?.click());
  expect(document.querySelectorAll('button[aria-pressed]').length).toBeGreaterThanOrEqual(9);
  const anchors = [
    ...document.querySelectorAll<HTMLButtonElement>('.grid.w-24 button[aria-pressed]'),
  ];
  await act(async () => anchors.at(-1)?.click());
  const offset = document.querySelector<HTMLButtonElement>(
    'button[title="content.stepBadge.offsetRight"]'
  );
  await act(async () => offset?.click());
  await act(async () => offset?.click());
  const sizeSection = document.querySelector<HTMLButtonElement>(
    'button[aria-label="content.stepBadge.sizeSection"]'
  );
  await act(async () => sizeSection?.click());
  const customSize = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'content.stepBadge.sizeCustom'
  );
  await act(async () => customSize?.click());
  const name = document.querySelector<HTMLInputElement>('input[maxlength="64"]')!;
  expect(name.value).toBe('highlighter.stepBadgePresets.system.classic');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      name,
      'Changed'
    );
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const save = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'common.actions.save'
  );
  await act(async () => save?.click());
  expect(controller.actions.save).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'system-classic', name: 'Changed' })
  );
});

it('starts and saves a named user preset from the current default', async () => {
  const controller = createController(false);
  await act(async () => root.render(<StepBadgePresetEditor controller={controller} />));
  expect(document.body.textContent).toContain('highlighter.stepBadgePresets.editor.newTitle');
  const name = document.querySelector<HTMLInputElement>('input[maxlength="64"]')!;
  expect(name.value).toBe('');
  const save = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'common.actions.save'
  );
  expect(save?.disabled).toBe(true);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(name, 'Mine');
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => save?.click());
  expect(controller.actions.save).toHaveBeenCalledWith(
    expect.objectContaining({ id: '', name: 'Mine', origin: 'user' })
  );
});
