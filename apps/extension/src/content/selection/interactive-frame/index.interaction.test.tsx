// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrameData } from '../../../features/highlighter/contracts';
import { useFrameUIStore } from '../frame-runtime/state/frame-ui.store';
import { InteractiveFrame } from '.';
import { queryAllContentUiElements, queryContentUiElement } from '../../platform/dom-host';
import { translate } from '../../../platform/i18n';

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
  const button = queryAllContentUiElements('button').find(
    (item): item is HTMLButtonElement =>
      item instanceof HTMLButtonElement && titlePattern.test(item.title)
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
    useFrameUIStore.getState().selectFrame('frame-1');
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
  it('shows only the compact trigger on hover and the full toolbar after selection', () => {
    const { frame } = renderFrame();

    act(() => useFrameUIStore.getState().hoverFrame(frame.id));
    const trigger = queryContentUiElement('.sniptale-frame-toolbar-trigger');
    expect(trigger).toBeInstanceOf(HTMLButtonElement);
    expect(queryContentUiElement('.sniptale-action-toolbar')).toBeNull();

    act(() => useFrameUIStore.getState().selectFrame(frame.id));
    expect(queryContentUiElement('.sniptale-frame-toolbar-trigger')).toBeNull();
    expect(queryContentUiElement('.sniptale-action-toolbar')).toBeInstanceOf(HTMLElement);
  });

  it('applies one five-pixel expansion from the selected toolbar', () => {
    const { frame, onUpdate } = renderFrame();
    act(() => useFrameUIStore.getState().selectFrame(frame.id));

    act(() => {
      findToolbarButton(/Increase frame size|Увеличить рамку/).click();
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ x: 115, y: 75, width: 330, height: 190 })
    );
  });

  it('orders toolbar commands in separated frame, annotation, edit, delete, and close groups', () => {
    const { frame } = renderFrame();
    act(() => useFrameUIStore.getState().selectFrame(frame.id));
    const toolbar = queryContentUiElement<HTMLElement>('.sniptale-action-toolbar');
    const titles = Array.from(toolbar?.querySelectorAll<HTMLButtonElement>('button') ?? []).map(
      (button) => button.title
    );

    expect(titles).toEqual([
      `${translate('content.interactiveFrame.effectBorder')}${translate(
        'content.interactiveFrame.effectActiveSuffix'
      )}`,
      translate('content.interactiveFrame.effectBlur'),
      translate('content.interactiveFrame.effectFocus'),
      translate('content.interactiveFrame.stepBadgeEnable'),
      translate('content.interactiveFrame.calloutAdd'),
      translate('content.interactiveFrame.decreaseFrame'),
      translate('content.interactiveFrame.increaseFrame'),
      translate('content.interactiveFrame.editButton'),
      translate('content.interactiveFrame.deleteButton'),
      translate('common.actions.close'),
    ]);
    expect(toolbar?.querySelectorAll('.sniptale-glass-toolbar-divider')).toHaveLength(4);
  });

  it('closes the selected toolbar without deleting the frame', () => {
    const { frame, onDelete } = renderFrame();
    act(() => useFrameUIStore.getState().selectFrame(frame.id));

    act(() => {
      findToolbarButton(/Close|Закрыть/).click();
    });

    expect(useFrameUIStore.getState().selectedFrameId).toBeNull();
    expect(queryContentUiElement('.sniptale-action-toolbar')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('keeps the selected toolbar fixed when its settings popover opens', () => {
    const { frame } = renderFrame();
    act(() => useFrameUIStore.getState().selectFrame(frame.id));
    const toolbar = queryContentUiElement<HTMLElement>('.sniptale-toolbar-portal-wrapper');
    expect(toolbar).toBeInstanceOf(HTMLElement);
    const before = {
      left: toolbar?.style.left,
      side: toolbar?.dataset['placementSide'],
      top: toolbar?.style.top,
    };

    act(() => {
      findToolbarButton(/Border|Рамка/).click();
    });

    expect(queryContentUiElement('.sniptale-frame-settings-popover')).toBeInstanceOf(HTMLElement);
    expect({
      left: toolbar?.style.left,
      side: toolbar?.dataset['placementSide'],
      top: toolbar?.style.top,
    }).toEqual(before);
  });

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

  it('returns the selected toolbar after Escape cancels size editing', () => {
    const { frame } = renderFrame();
    openFrameSizeEditor();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(document.querySelector('.sniptale-content-size-tooltip')).toBeNull();
    expect(useFrameUIStore.getState().selectedFrameId).toBe(frame.id);
    expect(queryContentUiElement('.sniptale-action-toolbar')).toBeInstanceOf(HTMLElement);
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
