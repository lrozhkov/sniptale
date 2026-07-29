// @vitest-environment jsdom

import { act } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { UserViewportPreset } from '../../../../contracts/settings';
import { useViewportPresetEditorState } from './state';

const loggerErrorMock = vi.hoisted(() => vi.fn());
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: loggerErrorMock }),
}));

let container: HTMLDivElement | null = null;
let latest: ReturnType<typeof useViewportPresetEditorState> | null = null;
let root: Root | null = null;

function Harness(props: Parameters<typeof useViewportPresetEditorState>[0]) {
  latest = useViewportPresetEditorState(props);
  return null;
}

function requireState(): ReturnType<typeof useViewportPresetEditorState> {
  if (!latest) throw new Error('Editor state is unavailable');
  return latest;
}

async function renderHarness(props: Parameters<typeof useViewportPresetEditorState>[0]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<Harness {...props} />));
}

function submitEvent(): FormEvent {
  const form = document.createElement('form');
  return {
    bubbles: true,
    cancelable: true,
    currentTarget: form,
    defaultPrevented: false,
    eventPhase: 0,
    isDefaultPrevented: () => false,
    isPropagationStopped: () => false,
    isTrusted: false,
    nativeEvent: new Event('submit'),
    persist: vi.fn(),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: form,
    timeStamp: 0,
    type: 'submit',
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  latest = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('syncs all preset fields and submits a trimmed target-aware draft', async () => {
  const preset: UserViewportPreset = {
    enabled: true,
    height: 900,
    id: 'window-1',
    kind: 'user',
    name: 'Desktop window',
    order: 0,
    target: 'window',
    width: 1440,
  };
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  await renderHarness({ isOpen: true, onClose, onSave, preset });

  expect(requireState().form).toMatchObject({
    height: 900,
    label: 'Desktop window',
    target: 'window',
    width: 1440,
  });
  act(() => {
    requireState().form.setLabel('  Tablet  ');
    requireState().form.setTarget('viewport');
    requireState().form.setWidth(768);
    requireState().form.setHeight(1024);
  });
  await act(async () => requireState().handlers.handleSubmit(submitEvent()));

  expect(onSave).toHaveBeenCalledWith({
    height: 1024,
    name: 'Tablet',
    nameEdited: true,
    target: 'viewport',
    width: 768,
  });
  expect(onClose).toHaveBeenCalledOnce();
  expect(requireState().status.isSaving).toBe(false);
});

it('marks a system display name as untouched when only dimensions change', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  await renderHarness({
    isOpen: true,
    onClose: vi.fn(),
    onSave,
    preset: {
      catalogRevision: 2,
      customized: false,
      enabled: true,
      height: 720,
      id: 'system:window-hd',
      kind: 'system',
      order: 0,
      systemKey: 'windowHd',
      target: 'window',
      width: 1280,
    },
  });
  act(() => requireState().form.setWidth(1300));
  await act(async () => requireState().handlers.handleSubmit(submitEvent()));

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ nameEdited: false, width: 1300 }));
});

it('blocks blank names, exposes loading state, handles failures, and closes on Escape', async () => {
  const onClose = vi.fn();
  const onSave = vi.fn().mockRejectedValue(new Error('save failed'));
  await renderHarness({ isLoading: true, isOpen: true, onClose, onSave });
  expect(requireState().status.isDisabled).toBe(true);

  await act(async () => requireState().handlers.handleSubmit(submitEvent()));
  expect(onSave).not.toHaveBeenCalled();

  act(() => requireState().form.setLabel('a'.repeat(81)));
  await act(async () => requireState().handlers.handleSubmit(submitEvent()));
  expect(onSave).not.toHaveBeenCalled();

  act(() => requireState().form.setLabel('Preset'));
  await act(async () => requireState().handlers.handleSubmit(submitEvent()));
  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to save viewport preset', expect.any(Error));
  expect(requireState().status.isSaving).toBe(false);

  act(() => requireState().handlers.handleKeyDown({ key: 'Escape' } as KeyboardEvent));
  expect(onClose).toHaveBeenCalledOnce();
  act(() => requireState().handlers.handleKeyDown({ key: 'Enter' } as KeyboardEvent));
  expect(onClose).toHaveBeenCalledOnce();
});
