// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NormalizedSettings, SettingsPatch } from '../../../../contracts/settings';

const persistence = vi.hoisted(() => ({
  load: vi.fn<() => Promise<NormalizedSettings>>(),
  patch: vi.fn<(patch: SettingsPatch) => Promise<NormalizedSettings>>(),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: persistence.load,
  patchSettings: persistence.patch,
}));

import { createDefaultSettings } from '../../../../composition/persistence/settings';
import { useRecordingToolbarControls } from './recording-controls';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let controls: ReturnType<typeof useRecordingToolbarControls>;

function Harness(props: { enabled?: boolean; active?: boolean }) {
  controls = useRecordingToolbarControls(props.enabled ?? true, props.active ?? false);
  return null;
}

function gate<Value>() {
  let accept!: (value: Value) => void;
  const promise = new Promise<Value>((resolve) => {
    accept = resolve;
  });
  return { promise, accept };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  persistence.load.mockResolvedValue(createDefaultSettings());
  persistence.patch.mockResolvedValue(createDefaultSettings());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('does not read or write recording preferences in other toolbar modes', async () => {
  await act(async () => root.render(<Harness enabled={false} />));
  expect(persistence.load).not.toHaveBeenCalled();
  expect(persistence.patch).not.toHaveBeenCalled();
});

it('loads acknowledged preferences without writing and waits before allowing edits', async () => {
  const loading = gate<NormalizedSettings>();
  persistence.load.mockReturnValue(loading.promise);
  await act(async () => root.render(<Harness />));
  await act(async () => {
    controls.toggleEditing();
    await controls.setVisible('pencil', false);
  });
  expect(controls.ready).toBe(false);
  expect(controls.editing).toBe(false);
  expect(persistence.patch).not.toHaveBeenCalled();
  const settings = createDefaultSettings();
  settings.contentToolbar = {
    displayMode: 'horizontal',
    compactMenus: false,
    position: null,
    recordingControls: { camera: false },
  };
  await act(async () => loading.accept(settings));
  expect(controls.controls).toEqual({ camera: false });
  expect(controls.ready).toBe(true);
  act(() => controls.toggleEditing());
  expect(controls.editing).toBe(true);
  expect(persistence.patch).not.toHaveBeenCalled();
});

it('projects only acknowledged changes and prevents duplicate pending edits', async () => {
  await act(async () => root.render(<Harness />));
  const writing = gate<NormalizedSettings>();
  persistence.patch.mockReturnValue(writing.promise);
  let pending: Promise<void>;
  act(() => {
    pending = controls.setVisible('pencil', false);
  });
  expect(controls.pending).toBe(true);
  expect(controls.controls).toEqual({});
  await act(async () => controls.setVisible('camera', false));
  expect(persistence.patch).toHaveBeenCalledExactlyOnceWith({
    contentToolbar: { recordingControls: { pencil: false } },
  });
  const accepted = createDefaultSettings();
  accepted.contentToolbar = {
    displayMode: 'horizontal',
    compactMenus: false,
    position: null,
    recordingControls: { pencil: false, camera: false },
  };
  await act(async () => {
    writing.accept(accepted);
    await pending;
  });
  expect(controls.controls).toEqual({ pencil: false, camera: false });
  expect(controls.pending).toBe(false);
});

it('retains the prior selection after failure and permits a retry', async () => {
  await act(async () => root.render(<Harness />));
  persistence.patch.mockRejectedValueOnce(new Error('storage refused'));
  await act(async () => controls.setVisible('camera', false));
  expect(controls.controls).toEqual({});
  expect(controls.error).toBeTruthy();
  expect(controls.pending).toBe(false);
  const accepted = createDefaultSettings();
  accepted.contentToolbar = {
    displayMode: 'horizontal',
    compactMenus: false,
    position: null,
    recordingControls: { camera: false },
  };
  persistence.patch.mockResolvedValueOnce(accepted);
  await act(async () => controls.setVisible('camera', false));
  expect(controls.controls).toEqual({ camera: false });
  expect(controls.error).toBeNull();
});

it('offers reload after an opening failure without writing defaults', async () => {
  persistence.load.mockRejectedValueOnce(new Error('load failed'));
  await act(async () => root.render(<Harness />));
  expect(controls.ready).toBe(false);
  expect(controls.error).toBeTruthy();
  await act(async () => controls.reload());
  expect(controls.ready).toBe(true);
  expect(controls.error).toBeNull();
  expect(persistence.patch).not.toHaveBeenCalled();
});

it('leaves customization when recording begins and cannot edit an active recording', async () => {
  await act(async () => root.render(<Harness />));
  act(() => controls.toggleEditing());
  expect(controls.editing).toBe(true);
  await act(async () => root.render(<Harness active />));
  await act(async () => {
    controls.toggleEditing();
    await controls.setVisible('pencil', false);
  });
  expect(controls.editing).toBe(false);
  expect(persistence.patch).not.toHaveBeenCalled();
  await act(async () => root.render(<Harness />));
  expect(controls.editing).toBe(false);
});
