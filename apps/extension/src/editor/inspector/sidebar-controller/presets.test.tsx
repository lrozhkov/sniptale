// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  createDefaultEditorPresetStorageState: vi.fn(),
  loadEditorPresetState: vi.fn(),
  subscribeToEditorPresetState: vi.fn(() => () => undefined),
}));

vi.mock('../../../composition/persistence/editor-presets', async (importOriginal) => ({
  ...(await importOriginal()),
  createDefaultEditorPresetStorageState: storageMocks.createDefaultEditorPresetStorageState,
  loadEditorPresetState: storageMocks.loadEditorPresetState,
  subscribeToEditorPresetState: storageMocks.subscribeToEditorPresetState,
}));

import { useEditorPresetStorageState } from './presets';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useEditorPresetStorageState> | null = null;

function createPresetState(defaultPresetId: string) {
  return {
    pencil: {
      defaultPresetId,
      presets: [{ id: defaultPresetId, name: 'Pencil', enabled: true, order: 0, settings: {} }],
    },
    highlighter: { defaultPresetId: 'highlighter-default', presets: [] },
    ellipse: { defaultPresetId: 'ellipse-default', presets: [] },
    arrow: { defaultPresetId: 'arrow-default', presets: [] },
    text: { defaultPresetId: 'text-default', presets: [] },
    step: { defaultPresetId: 'step-default', presets: [] },
    sceneBackground: { defaultPresetId: 'scene-default', presets: [] },
    palette: {
      shapeStroke: ['#111111'],
      shapeFill: ['#222222'],
      textColor: ['#333333'],
      textBackground: ['#444444'],
      sceneBackground: ['#555555'],
    },
  };
}

function Harness() {
  latestState = useEditorPresetStorageState();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  storageMocks.createDefaultEditorPresetStorageState.mockReturnValue(createPresetState('default'));
  storageMocks.loadEditorPresetState.mockResolvedValue(createPresetState('loaded'));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

describe('useEditorPresetStorageState', () => {
  it('loads the stored preset state and updates it through the subscription seam', async () => {
    let subscriber: ((state: ReturnType<typeof createPresetState>) => void) | null = null;
    storageMocks.subscribeToEditorPresetState.mockImplementation(((callback: unknown) => {
      subscriber = callback as (state: ReturnType<typeof createPresetState>) => void;
      return () => undefined;
    }) as never);

    await renderHarness();

    expect(latestState?.pencil.defaultPresetId).toBe('loaded');
    expect(storageMocks.subscribeToEditorPresetState).toHaveBeenCalledTimes(1);

    await act(async () => {
      subscriber?.(createPresetState('subscribed'));
    });

    expect(latestState?.pencil.defaultPresetId).toBe('subscribed');
  });

  it('keeps the default state when the async load fails', async () => {
    storageMocks.loadEditorPresetState.mockRejectedValueOnce(new Error('failed'));

    await renderHarness();

    expect(latestState?.pencil.defaultPresetId).toBe('default');
  });
});

describe('useEditorPresetStorageState stale async handling', () => {
  it('ignores late async updates after the hook unmounts', async () => {
    let resolveLoad: ((state: ReturnType<typeof createPresetState>) => void) | null = null;
    let subscriber: ((state: ReturnType<typeof createPresetState>) => void) | null = null;
    storageMocks.loadEditorPresetState.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        })
    );
    storageMocks.subscribeToEditorPresetState.mockImplementation(((callback: unknown) => {
      subscriber = callback as (state: ReturnType<typeof createPresetState>) => void;
      return () => undefined;
    }) as never);

    await renderHarness();
    act(() => root?.unmount());

    await act(async () => {
      resolveLoad?.(createPresetState('late-load'));
      subscriber?.(createPresetState('late-subscription'));
    });

    expect(latestState?.pencil.defaultPresetId).toBe('default');
  });
});
