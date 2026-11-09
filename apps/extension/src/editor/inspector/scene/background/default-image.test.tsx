// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';
import { useEditorStore } from '../../../state/useEditorStore';
import { disableFrameBackground } from './settings';
const io = vi.hoisted(() => ({
  catalog: {
    status: 'ready',
    presets: [
      { id: 'disabled', enabled: false, available: true, mediaId: undefined as string | undefined },
      { id: 'first', enabled: true, available: true, mediaId: undefined as string | undefined },
    ],
  },
  bundled: vi.fn(),
  library: vi.fn(),
  convert: vi.fn(),
}));
vi.mock('../../../../composition/background-resources/catalog', () => ({
  useBackgroundCatalog: () => io.catalog,
}));
vi.mock('../../../../composition/background-resources/acquisition', () => ({
  readBundledBackground: io.bundled,
  readLibraryBackground: io.library,
}));
vi.mock('../../../../platform/media-utils/data-url', () => ({ blobToDataUrl: io.convert }));
import { useDefaultFrameBackgroundImage } from './default-image';
let root: Root;
let host: HTMLDivElement;
let selection: ReturnType<typeof useDefaultFrameBackgroundImage>;
const setFrameDraft = vi.fn();
const setBackgroundMode = vi.fn();
const none = disableFrameBackground(DEFAULT_EDITOR_FRAME_SETTINGS);
function Probe({ frame = none }: { frame?: EditorFrameSettings }) {
  selection = useDefaultFrameBackgroundImage({
    frameDraft: frame,
    setFrameDraft,
    setBackgroundMode,
  });
  return null;
}
async function render(frame?: EditorFrameSettings) {
  await act(async () => root.render(<Probe {...(frame ? { frame } : {})} />));
}
function pending() {
  let resolve!: (value: { file: File }) => void;
  const promise = new Promise<{ file: File }>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  root = createRoot(host);
  vi.clearAllMocks();
  io.catalog.status = 'ready';
  io.catalog.presets[1]!.mediaId = undefined;
  io.bundled.mockResolvedValue({ file: new File(['x'], 'bg.png') });
  io.library.mockResolvedValue({ file: new File(['x'], 'library.png') });
  io.convert.mockResolvedValue('data:image/png;base64,chosen');
});
afterEach(async () => {
  await act(async () => root.unmount());
  useEditorStore.setState({ sessionId: null });
  vi.unstubAllGlobals();
});
it('accepts the first enabled available image and mode as one frame command', async () => {
  await render();
  await act(async () => selection.select('image'));
  expect(io.bundled).toHaveBeenCalledWith('first', expect.any(AbortSignal));
  expect(setBackgroundMode).not.toHaveBeenCalled();
  expect(setFrameDraft).toHaveBeenCalledOnce();
  const update = setFrameDraft.mock.calls[0]![0] as (
    frame: EditorFrameSettings
  ) => EditorFrameSettings;
  expect(update(none)).toMatchObject({
    backgroundMode: 'image',
    backgroundImageData: 'data:image/png;base64,chosen',
    paddingTop: 32,
  });
});
it('reuses an existing image and admits empty-catalog upload without acquisition', async () => {
  await render({ ...none, backgroundImageData: 'kept' });
  act(() => selection.select('image'));
  expect(setBackgroundMode).toHaveBeenCalledWith('image');
  expect(io.bundled).not.toHaveBeenCalled();
  io.catalog.presets[1]!.available = false;
  await render();
  act(() => selection.select('image'));
  expect(setBackgroundMode).toHaveBeenCalledTimes(2);
  io.catalog.presets[1]!.available = true;
});
it.each(['mode', 'document', 'unmount'] as const)(
  'refuses a late default-image result after %s changes',
  async (change) => {
    const work = pending();
    io.bundled.mockReturnValue(work.promise);
    await render();
    act(() => selection.select('image'));
    const signal = io.bundled.mock.calls[0]![1] as AbortSignal;
    if (change === 'mode') act(() => selection.select('none'));
    if (change === 'document')
      await act(async () => useEditorStore.setState({ sessionId: 'another-session' }));
    if (change === 'unmount') await act(async () => root.render(null));
    expect(signal.aborted).toBe(true);
    await act(async () => work.resolve({ file: new File(['x'], 'late.png') }));
    expect(setFrameDraft).not.toHaveBeenCalled();
  }
);
it('preserves accepted state on failure and permits a Library retry', async () => {
  io.bundled.mockRejectedValue(new Error('unavailable'));
  await render();
  await act(async () => selection.select('image'));
  expect(selection.failed).toBe(true);
  expect(setFrameDraft).not.toHaveBeenCalled();
  io.catalog.presets[1]!.mediaId = 'library-image';
  await render();
  await act(async () => selection.select('image'));
  expect(io.library).toHaveBeenCalledWith('library-image', expect.any(AbortSignal));
  expect(setFrameDraft).toHaveBeenCalledOnce();
  expect(selection.failed).toBe(false);
});
it('keeps image acquisition disabled until the catalog is ready', async () => {
  io.catalog.status = 'loading';
  await render();
  expect(selection.pending).toBe(true);
});

it('rejects a changed authoritative session before the subscription cleanup runs', async () => {
  const work = pending();
  io.bundled.mockReturnValue(work.promise);
  await render();
  act(() => selection.select('image'));
  const current = useEditorStore.getState();
  const state = vi
    .spyOn(useEditorStore, 'getState')
    .mockReturnValue({ ...current, sessionId: 'next-document' });
  try {
    await act(async () => work.resolve({ file: new File(['x'], 'late.png') }));
    expect(setFrameDraft).not.toHaveBeenCalled();
  } finally {
    state.mockRestore();
  }
});
