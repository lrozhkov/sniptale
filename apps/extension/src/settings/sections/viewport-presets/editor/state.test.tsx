// @vitest-environment jsdom

import { act } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ViewportPreset } from '../../../../contracts/settings';
import { useViewportPresetEditorState } from './state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useViewportPresetEditorState> | null = null;

function ViewportPresetHarness(props: Parameters<typeof useViewportPresetEditorState>[0]) {
  latestState = useViewportPresetEditorState(props);
  return null;
}

async function renderHarness(props: Parameters<typeof useViewportPresetEditorState>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ViewportPresetHarness {...props} />);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

function createSubmitEvent(): FormEvent {
  const form = document.createElement('form');
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();

  return {
    bubbles: true,
    cancelable: true,
    currentTarget: form,
    defaultPrevented: false,
    eventPhase: 0,
    isDefaultPrevented: () => preventDefault.mock.calls.length > 0,
    isPropagationStopped: () => stopPropagation.mock.calls.length > 0,
    isTrusted: false,
    nativeEvent: new Event('submit'),
    persist: vi.fn(),
    preventDefault,
    stopPropagation,
    target: form,
    timeStamp: 0,
    type: 'submit',
  };
}

function createKeyboardEvent(key: string): KeyboardEvent {
  return {
    key,
  } as KeyboardEvent;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

describe('useViewportPresetEditorState', () => {
  it('syncs preset values and submits the edited viewport preset flow', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn(async () => undefined);
    const preset: ViewportPreset = {
      id: 'viewport-1',
      label: 'Desktop',
      width: 1920,
      height: 1080,
    };

    await renderHarness({
      isOpen: true,
      onClose,
      onSave,
      preset,
    });
    await flushEffects();

    expect(latestState?.label).toBe('Desktop');
    expect(latestState?.width).toBe(1920);
    expect(latestState?.height).toBe(1080);

    act(() => {
      latestState?.setLabel('  Tablet  ');
      latestState?.setWidth(1280);
      latestState?.setHeight(800);
    });

    await act(async () => {
      await latestState?.handleSubmit(createSubmitEvent());
    });

    expect(onSave).toHaveBeenCalledWith('Tablet', 1280, 800);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('useViewportPresetEditorState keyboard handling', () => {
  it('closes the editor on Escape', async () => {
    const onClose = vi.fn();

    await renderHarness({
      isOpen: true,
      onClose,
      onSave: vi.fn(async () => undefined),
    });
    await flushEffects();

    act(() => {
      latestState?.handleKeyDown(createKeyboardEvent('Escape'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
