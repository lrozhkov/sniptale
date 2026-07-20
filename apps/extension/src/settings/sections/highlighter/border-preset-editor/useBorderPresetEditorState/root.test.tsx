// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BorderPreset } from '../../../../../features/highlighter/contracts';
import { useBorderPresetEditorState, type BorderPresetEditorProps } from '.';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

type EditorState = ReturnType<typeof useBorderPresetEditorState>;

let container: HTMLDivElement | null = null;
let latestState: EditorState | null = null;
let root: Root | null = null;

function BorderPresetEditorHarness(props: BorderPresetEditorProps) {
  const state = useBorderPresetEditorState(props);

  useEffect(() => {
    latestState = state;
  });

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderHarness(props: Partial<BorderPresetEditorProps> = {}) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  const nextProps: BorderPresetEditorProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    ...props,
  };

  await act(async () => {
    root?.render(<BorderPresetEditorHarness {...nextProps} />);
  });
  await flushEffects();

  return nextProps;
}

function getState() {
  if (!latestState) {
    throw new Error('Hook state is not ready');
  }

  return latestState;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestState = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('border preset editor state initialization', () => {
  it('initializes from a preset and clamps padding updates', async () => {
    const preset: BorderPreset = {
      id: 'preset-1',
      name: 'Orange border',
      isSystemDefault: false,
      order: 4,
      width: 6,
      color: '#ff6600',
      style: 'dashed',
      radius: 12,
      padding: { top: 4, right: 5, bottom: 6, left: 7 },
      shadow: 30,
      opacity: 84,
      strokeOpacity: 84,
      fillColor: '#00000000',
      fillOpacity: 0,
      inheritCustomCss: true,
      customCss: 'background: red;',
    };

    await renderHarness({ preset });

    expect(getState().name).toBe('Orange border');
    expect(getState().previewStyle).toMatchObject({
      borderColor: 'rgba(255, 102, 0, 0.84)',
      borderStyle: 'dashed',
      borderWidth: '6px',
      borderRadius: '12px',
      opacity: 1,
    });

    act(() => {
      getState().updatePadding('top', 999);
      getState().updatePadding('left', -5);
    });
    await flushEffects();

    expect(getState().padding.top).toBe(50);
    expect(getState().padding.left).toBe(0);
  });
});

describe('border preset editor state validation', () => {
  it('validates blocked css properties and clears the error when css is removed', async () => {
    await renderHarness();

    act(() => {
      getState().setCustomCss('position: fixed; color: red;');
    });
    await flushEffects();

    expect(getState().hasBlockedProps).toBe(true);
    expect(getState().cssError).toBe('highlighter.editor.blockedPropertiesPrefix position');

    act(() => {
      getState().setCustomCss('');
    });
    await flushEffects();

    expect(getState().hasBlockedProps).toBe(false);
    expect(getState().cssError).toBeNull();
  });
});

describe('border preset editor save creation flow', () => {
  it('guards blank saves and creates new presets with trimmed names', async () => {
    const onCreate = vi.fn();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '11111111-1111-1111-1111-111111111111'
    );

    await renderHarness({ onSave: onCreate });

    act(() => {
      getState().handleSave();
    });
    expect(onCreate).not.toHaveBeenCalled();

    act(() => {
      getState().setName('  New preset  ');
      getState().setCustomCss('color: blue;');
    });
    await flushEffects();

    act(() => {
      getState().handleSave();
    });

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'New preset',
        order: 0,
        customCss: 'color: blue;',
      })
    );
  });
});

describe('border preset editor save css guard', () => {
  it('blocks save when css validation reports a parse error', async () => {
    const onCreate = vi.fn();
    const cssSanitizer = await import('../../../../../features/highlighter/css-sanitizer/css');
    vi.spyOn(cssSanitizer, 'validateCssString').mockReturnValue({
      blockedProps: [],
      hasBlockedProps: false,
      rawError: 'shared.runtime.cssRecognitionFailed',
      styles: {},
    });

    await renderHarness({ onSave: onCreate });

    act(() => {
      getState().setName('Broken css preset');
      getState().setCustomCss('broken-css');
    });
    await flushEffects();

    expect(getState().cssError).toBe('shared.runtime.cssRecognitionFailed');

    act(() => {
      getState().handleSave();
    });

    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe('border preset editor save edit flow', () => {
  it('preserves preset identity while editing an existing preset', async () => {
    const preset: BorderPreset = {
      id: 'preset-edit',
      name: 'Existing',
      isSystemDefault: true,
      order: 2,
      width: 4,
      color: '#111111',
      style: 'solid',
      radius: 8,
      padding: { top: 1, right: 1, bottom: 1, left: 1 },
      shadow: 100,
      opacity: 75,
      customCss: '',
      fillColor: '#00000000',
      fillOpacity: 0,
      inheritCustomCss: false,
      strokeOpacity: 100,
    };
    const onUpdate = vi.fn();

    await renderHarness({ onSave: onUpdate, preset });

    act(() => {
      getState().setName('Edited');
    });
    await flushEffects();

    act(() => {
      getState().handleSave();
    });

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'preset-edit',
        isSystemDefault: true,
        order: 2,
        name: 'Edited',
      })
    );
  });
});
