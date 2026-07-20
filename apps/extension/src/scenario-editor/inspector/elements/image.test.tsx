// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioImageElement } from '../../../features/scenario/project/v3';
import { translate } from '../../../platform/i18n';
import { ImageElementFields } from './image';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderFields(withEdit = false) {
  const onChange = vi.fn();
  const onEditImageElement = withEdit ? vi.fn() : undefined;
  const element = { ...createScenarioImageElement(), id: 'image-1' };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ImageElementFields
        element={element}
        onChange={onChange}
        {...(onEditImageElement ? { onEditImageElement } : {})}
      />
    );
  });

  return { onChange, onEditImageElement };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders image controls without exposing edit action when no editor callback exists', () => {
  const { onChange } = renderFields();

  act(() => {
    clickButton(translate('scenario.editor.resetContentTransform'));
  });

  expect(container?.textContent).not.toContain(translate('scenario.editor.editImage'));
  expect(onChange).toHaveBeenCalledWith({ contentTransform: { scale: 1, x: 0, y: 0 } });
});

it('routes the optional image edit action to the selected image element id', () => {
  const { onEditImageElement } = renderFields(true);

  act(() => {
    clickButton(translate('scenario.editor.editImage'));
  });

  expect(onEditImageElement).toHaveBeenCalledWith('image-1');
});

function clickButton(label: string) {
  const button = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (candidate) => candidate.textContent?.includes(label)
  );
  expect(button).not.toBeNull();
  button?.click();
}
