// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBorderPresetEditorState, type BorderPresetEditorProps } from '.';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

type EditorState = ReturnType<typeof useBorderPresetEditorState>;

let container: HTMLDivElement | null = null;
let latestState: EditorState | null = null;
let root: Root | null = null;

function Harness(props: BorderPresetEditorProps) {
  const state = useBorderPresetEditorState(props);

  useEffect(() => {
    latestState = state;
  });

  return null;
}

async function renderHarness(props: BorderPresetEditorProps) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness {...props} />);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
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

async function verifyTrimmedSaveContract() {
  const onSave = vi.fn();

  await renderHarness({
    isOpen: true,
    onClose: vi.fn(),
    onSave,
  });

  act(() => {
    getState().setName('  Modern border  ');
    getState().setCustomCss('color: blue;');
  });
  await flushEffects();

  act(() => {
    getState().handleSave();
  });

  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Modern border',
      customCss: 'color: blue;',
    })
  );
}

async function verifyExistingPresetEditBranch() {
  const onSave = vi.fn();
  const preset = {
    id: 'preset-1',
    name: 'Existing border',
    isSystemDefault: false,
    order: 3,
    width: 5,
    color: '#00aaff',
    style: 'solid' as const,
    radius: 8,
    padding: { top: 2, right: 3, bottom: 4, left: 5 },
    shadow: 100,
    opacity: 90,
    strokeOpacity: 55,
    fillColor: '#00ff00',
    fillOpacity: 25,
    inheritCustomCss: true,
    customCss: 'box-shadow: none;',
  };

  await renderHarness({
    isOpen: true,
    onClose: vi.fn(),
    onSave,
    preset,
  });
  await flushEffects();

  expect(getState().name).toBe('Existing border');
  expect(getState().previewStyle).toMatchObject({
    backgroundColor: 'rgba(0, 255, 0, 0.25)',
    borderColor: 'rgba(0, 170, 255, 0.55)',
    borderWidth: '5px',
  });

  act(() => {
    getState().handleSave();
  });

  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'preset-1',
      name: 'Existing border',
    })
  );
}

function runBorderPresetEditorStateIndexSuite() {
  it('keeps the public hook contract and trims saved names', verifyTrimmedSaveContract);
  it(
    'initializes from an existing preset and keeps the edit branch on save',
    verifyExistingPresetEditBranch
  );
}

describe('useBorderPresetEditorState/index', runBorderPresetEditorStateIndexSuite);
