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

it('temporarily reveals saved hidden controls without writing and resets after the active session', async () => {
  const settings = createDefaultSettings();
  settings.contentToolbar = {
    ...settings.contentToolbar!,
    recordingControls: { pencil: false, microphone: false, camera: false },
  };
  persistence.load.mockResolvedValue(settings);
  await act(async () => root.render(<Harness active />));
  expect(controls.hasHidden).toBe(true);
  expect(controls.revealed).toBe(false);
  act(() => controls.toggleRevealed());
  expect(controls.revealed).toBe(true);
  expect(controls.controls.pencil).not.toBe(false);
  expect(controls.controls.microphone).not.toBe(false);
  expect(controls.controls.camera).not.toBe(false);
  await act(async () => root.render(<Harness active />));
  expect(controls.revealed).toBe(true);
  act(() => controls.toggleRevealed());
  expect(controls.controls.pencil).toBe(false);
  act(() => controls.toggleRevealed());
  await act(async () => root.render(<Harness active={false} />));
  expect(controls.revealed).toBe(false);
  await act(async () => root.render(<Harness active />));
  expect(controls.controls.pencil).toBe(false);
  expect(persistence.patch).not.toHaveBeenCalled();
  expect(settings.contentToolbar.recordingControls).toEqual({
    pencil: false,
    microphone: false,
    camera: false,
  });
});

it('does not reveal without hidden controls or outside recording and resets on mode exit', async () => {
  await act(async () => root.render(<Harness active />));
  expect(controls.hasHidden).toBe(false);
  act(() => controls.toggleRevealed());
  expect(controls.revealed).toBe(false);
  const settings = createDefaultSettings();
  settings.contentToolbar = { ...settings.contentToolbar!, recordingControls: { pencil: false } };
  persistence.load.mockResolvedValue(settings);
  await act(async () => controls.reload());
  act(() => controls.toggleRevealed());
  expect(controls.revealed).toBe(true);
  await act(async () => root.render(<Harness enabled={false} active />));
  expect(controls.revealed).toBe(false);
  act(() => controls.toggleRevealed());
  expect(controls.revealed).toBe(false);
  await act(async () => root.render(<Harness enabled active />));
  expect(controls.revealed).toBe(false);
  await act(async () => root.render(<Harness active={false} />));
  act(() => controls.toggleRevealed());
  expect(controls.revealed).toBe(false);
  expect(persistence.patch).not.toHaveBeenCalled();
});

it('defaults fading to enabled without writing and loads an explicit disabled value', async () => {
  await act(async () => root.render(<Harness />));
  expect(controls.fadeDuringRecording).toBe(true);
  const settings = createDefaultSettings();
  settings.contentToolbar = {
    displayMode: 'horizontal',
    compactMenus: false,
    position: null,
    fadeDuringRecording: false,
  };
  persistence.load.mockResolvedValueOnce(settings);
  await act(async () => controls.reload());
  expect(controls.fadeDuringRecording).toBe(false);
  expect(persistence.patch).not.toHaveBeenCalled();
});

it('projects fading only after acknowledgement and blocks duplicate preference edits', async () => {
  await act(async () => root.render(<Harness />));
  const writing = gate<NormalizedSettings>();
  persistence.patch.mockReturnValueOnce(writing.promise);
  let pending: Promise<void>;
  act(() => {
    pending = controls.setFadeDuringRecording(false);
  });
  expect(controls.fadeDuringRecording).toBe(true);
  expect(controls.pending).toBe(true);
  await act(async () => controls.setVisible('camera', false));
  expect(persistence.patch).toHaveBeenCalledExactlyOnceWith({
    contentToolbar: { fadeDuringRecording: false },
  });
  const accepted = createDefaultSettings();
  accepted.contentToolbar = {
    displayMode: 'horizontal',
    compactMenus: false,
    position: null,
    fadeDuringRecording: false,
    recordingControls: { camera: false },
  };
  await act(async () => {
    writing.accept(accepted);
    await pending;
  });
  expect(controls.fadeDuringRecording).toBe(false);
  expect(controls.controls).toEqual({ camera: false });
});

it('retains accepted fading after failure and permits retry', async () => {
  await act(async () => root.render(<Harness />));
  persistence.patch.mockRejectedValueOnce(new Error('write refused'));
  await act(async () => controls.setFadeDuringRecording(false));
  expect(controls.fadeDuringRecording).toBe(true);
  expect(controls.error).toBeTruthy();
  const accepted = createDefaultSettings();
  accepted.contentToolbar = {
    displayMode: 'horizontal',
    compactMenus: false,
    position: null,
    fadeDuringRecording: false,
  };
  persistence.patch.mockResolvedValueOnce(accepted);
  await act(async () => controls.setFadeDuringRecording(false));
  expect(controls.fadeDuringRecording).toBe(false);
  expect(controls.error).toBeNull();
});

it('loads acknowledged preferences without writing and waits before allowing edits', async () => {
  const loading = gate<NormalizedSettings>();
  persistence.load.mockReturnValue(loading.promise);
  await act(async () => root.render(<Harness />));
  await act(async () => {
    controls.toggleEditing();
    await controls.setVisible('pencil', false);
    await controls.setFadeDuringRecording(false);
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
