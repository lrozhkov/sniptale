// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import { ScenarioInspectorPanel } from './panel';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderInspector(selectedElementId: string | null) {
  const text = { ...createScenarioTextElement({ name: 'Title', text: 'Hello' }), id: 'text-1' };
  const image = {
    ...createScenarioImageElement({
      assetRef: { assetId: 'asset-1', galleryAssetId: null },
      name: 'Screenshot',
    }),
    id: 'image-1',
  };
  const actions = {
    onDeleteElement: vi.fn(),
    onEditImageElement: vi.fn(),
    onUpdateElement: vi.fn(),
    onUpdateSlide: vi.fn(),
  };

  act(() => {
    root?.render(
      <ScenarioInspectorPanel
        elements={[text, image]}
        onDeleteElement={actions.onDeleteElement}
        onEditImageElement={actions.onEditImageElement}
        onUpdateElement={actions.onUpdateElement}
        onUpdateSlide={actions.onUpdateSlide}
        selectedElementId={selectedElementId}
        slide={createScenarioSlide({ notes: 'Initial notes', title: 'Intro' })}
      />
    );
  });
  return actions;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('edits only step title and notes when no canvas item is selected', () => {
  const actions = renderInspector(null);
  commitInput(translate('scenario.editor.fieldTitle'), 'Opening');
  commitTextarea('Clear step instructions');

  expect(actions.onUpdateSlide).toHaveBeenCalledWith({ title: 'Opening' });
  expect(actions.onUpdateSlide).toHaveBeenCalledWith({ notes: 'Clear step instructions' });
  expect(container?.textContent).not.toContain(translate('scenario.editor.presentation'));
  expect(container?.textContent).not.toContain(translate('scenario.editor.layouts'));
  expect(container?.textContent).not.toContain(translate('scenario.editor.clicks'));
});

it('keeps image fit, reset, quick edit, and delete while hiding numeric transforms', async () => {
  const actions = renderInspector('image-1');
  openSelect(translate('scenario.editor.imageFit'));
  await act(async () => {
    findOption(translate('scenario.editor.imageFitCover'))?.click();
    await Promise.resolve();
  });
  clickText(translate('scenario.editor.resetContentTransform'));
  clickText(translate('scenario.editor.editImage'));
  clickText(translate('scenario.editor.removeSelectedItem'));

  expect(actions.onUpdateElement).toHaveBeenCalledWith('image-1', { fit: 'cover' });
  expect(actions.onUpdateElement).toHaveBeenCalledWith('image-1', {
    contentTransform: { scale: 1, x: 0, y: 0 },
  });
  expect(actions.onEditImageElement).toHaveBeenCalledWith('image-1');
  expect(actions.onDeleteElement).toHaveBeenCalledWith('image-1');
  expect(container?.textContent).not.toContain(translate('scenario.editor.contentScale'));
  expect(container?.textContent).not.toContain(translate('scenario.editor.animation'));
});

it('keeps lightweight text editing without build or frame controls', () => {
  const actions = renderInspector('text-1');
  commitInput(translate('scenario.editor.name'), 'Instruction');
  commitTextarea('Click Continue');

  expect(actions.onUpdateElement).toHaveBeenCalledWith('text-1', { name: 'Instruction' });
  expect(actions.onUpdateElement).toHaveBeenCalledWith('text-1', { text: 'Click Continue' });
  expect(container?.textContent).not.toContain(translate('scenario.editor.build'));
  expect(container?.querySelector('input[aria-label="X"]')).toBeNull();
});

function commitInput(label: string, value: string) {
  const input = container?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  expect(input).not.toBeNull();
  act(() => {
    setValue(input, value);
    input?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
}

function commitTextarea(value: string) {
  const textarea = container?.querySelector<HTMLTextAreaElement>('textarea');
  expect(textarea).not.toBeNull();
  act(() => {
    setValue(textarea, value);
    textarea?.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
}

function setValue(field: HTMLInputElement | HTMLTextAreaElement | null | undefined, value: string) {
  if (!field) return;
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
}

function openSelect(label: string) {
  act(() => container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click());
}

function findOption(label: string) {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
    (option) => option.textContent?.includes(label)
  );
}

function clickText(text: string) {
  const button = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (candidate) => candidate.textContent?.trim() === text
  );
  expect(button).not.toBeNull();
  act(() => button?.click());
}
