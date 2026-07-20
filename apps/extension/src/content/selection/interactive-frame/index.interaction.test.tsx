// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrameData } from '../../../features/highlighter/contracts';
import { useFrameUIStore } from '../frame-runtime/state/frame-ui.store';
import { InteractiveFrame } from '.';

const highlighterMocks = vi.hoisted(() => ({
  clearFrameEditing: vi.fn(),
  isHighlighterEnabled: vi.fn(() => true),
  pauseHighlighter: vi.fn(),
  setFrameEditing: vi.fn(),
}));

vi.mock('../highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../highlighter')>()),
  clearFrameEditing: highlighterMocks.clearFrameEditing,
  isHighlighterEnabled: highlighterMocks.isHighlighterEnabled,
  pauseHighlighter: highlighterMocks.pauseHighlighter,
  setFrameEditing: highlighterMocks.setFrameEditing,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createFrame(): FrameData {
  return {
    id: 'frame-1',
    x: 120,
    y: 80,
    width: 320,
    height: 180,
    effectMode: 'border',
  };
}

function renderFrame(props?: Partial<React.ComponentProps<typeof InteractiveFrame>>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const frame = createFrame();
  const onDelete = vi.fn();
  const onUpdate = vi.fn();

  act(() => {
    root?.render(
      <InteractiveFrame
        frame={frame}
        zIndex={10}
        onDelete={onDelete}
        onUpdate={onUpdate}
        {...props}
      />
    );
  });

  return { frame, onDelete, onUpdate };
}

function findToolbarButton(titlePattern: RegExp): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
    titlePattern.test(item.title)
  );
  expect(button).toBeInstanceOf(HTMLButtonElement);
  return button as HTMLButtonElement;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function openFrameSizeEditor() {
  act(() => {
    useFrameUIStore.getState().showTooltip('frame-1');
  });

  act(() => {
    findToolbarButton(/Edit|Редактировать/).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });

  const frameContainer = document.querySelector<HTMLDivElement>('.sniptale-frame-container');
  const widthInput = document.querySelector<HTMLInputElement>(
    '.sniptale-content-size-tooltip-input'
  );

  expect(frameContainer).toBeInstanceOf(HTMLDivElement);
  expect(widthInput).toBeInstanceOf(HTMLInputElement);
  return {
    frameContainer: frameContainer as HTMLDivElement,
    widthInput: widthInput as HTMLInputElement,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useFrameUIStore.getState().reset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  useFrameUIStore.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('InteractiveFrame size edit interactions', () => {
  it('keeps the highlighter frame visible when the width input is cleared', () => {
    const { onDelete } = renderFrame();
    const { frameContainer, widthInput } = openFrameSizeEditor();

    expect(frameContainer.style.width).toBe('320px');
    expect(frameContainer.style.height).toBe('180px');

    act(() => {
      widthInput.focus();
      widthInput.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Backspace' })
      );
      setInputValue(widthInput, '');
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(document.querySelector('.sniptale-frame-container')).toBe(frameContainer);
    expect(frameContainer.style.width).toBe('320px');
    expect(frameContainer.style.height).toBe('180px');

    act(() => {
      widthInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(widthInput.value).toBe('320');
    expect(frameContainer.style.width).toBe('320px');
  });

  it('applies the width input draft when Enter is pressed', () => {
    renderFrame();
    const { frameContainer, widthInput } = openFrameSizeEditor();

    act(() => {
      widthInput.focus();
      setInputValue(widthInput, '450');
      widthInput.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })
      );
    });

    expect(widthInput.value).toBe('450');
    expect(frameContainer.style.width).toBe('450px');
  });
});
