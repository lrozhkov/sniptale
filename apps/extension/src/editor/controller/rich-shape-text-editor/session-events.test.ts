// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { bindRichShapeTextEditorEvents } from './session-events';

function createCanvas() {
  const selectionElement = document.createElement('div');
  document.body.append(selectionElement);
  return {
    canvas: { getSelectionElement: () => selectionElement },
    selectionElement,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

it('commits text edits from keyboard and outside pointer interactions', () => {
  const { canvas, selectionElement } = createCanvas();
  const element = document.createElement('textarea');
  document.body.append(element);
  const cleanupRefreshHandlers = vi.fn();
  const commit = vi.fn();
  const onInput = vi.fn();

  const cleanup = bindRichShapeTextEditorEvents({
    canvas: canvas as never,
    cleanupRefreshHandlers,
    commit,
    element,
    onInput,
  });

  element.dispatchEvent(new Event('input'));
  element.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'Enter' })
  );
  document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  selectionElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  cleanup();
  element.dispatchEvent(new Event('blur'));

  expect(onInput).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledTimes(4);
  expect(cleanupRefreshHandlers).toHaveBeenCalledOnce();
});

it('commits Escape and Tab while keeping textarea-local pointer events editable', () => {
  const { canvas } = createCanvas();
  const element = document.createElement('textarea');
  document.body.append(element);
  const commit = vi.fn();

  bindRichShapeTextEditorEvents({
    canvas: canvas as never,
    cleanupRefreshHandlers: vi.fn(),
    commit,
    element,
    onInput: vi.fn(),
  });

  element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));

  expect(commit).toHaveBeenCalledTimes(2);
});
