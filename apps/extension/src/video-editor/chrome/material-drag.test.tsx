// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../features/video/project/factories/creation';
import { MaterialDragProvider, useMaterialDrag } from './material-drag';
import type { VideoProject } from '../../features/video/project/types';

const mocks = vi.hoisted(() => ({
  project: null as VideoProject | null,
  place: vi.fn(),
  telemetry: vi.fn(),
}));
vi.mock('../runtime/controller/store', () => ({
  getCurrentVideoEditorProjectSnapshot: () => mocks.project,
  useVideoEditorTimelineEditingPort: (
    select: (port: { placeMaterial: typeof mocks.place }) => unknown
  ) => select({ placeMaterial: mocks.place }),
}));
vi.mock('../../composition/persistence/recordings/telemetry', () => ({
  getRecordingTelemetry: mocks.telemetry,
}));
const container = document.createElement('div');
let root = createRoot(container);
let session: ReturnType<typeof useMaterialDrag>;
function Consumer() {
  session = useMaterialDrag();
  return <button>Source</button>;
}
afterEach(() => {
  act(() => root.unmount());
  root = createRoot(container);
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function setup(recording = false) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.append(container);
  mocks.project = createEmptyVideoProject('Drag');
  const asset = createVideoProjectAsset(
    'Media',
    'VIDEO',
    recording
      ? { kind: 'recording', recordingId: 'recording' }
      : { kind: 'project-asset', projectAssetId: 'asset' },
    {
      duration: 6,
      width: 640,
      height: 480,
      size: 1,
      mimeType: 'video/webm',
      hasAudio: false,
      audioPeaks: null,
    }
  );
  mocks.project.assets = [asset];
  mocks.place.mockReturnValue({ status: 'placed', clipId: 'clip' });
  act(() =>
    root.render(
      <MaterialDragProvider>
        <Consumer />
      </MaterialDragProvider>
    )
  );
  const values = new Map<string, string>();
  const types: string[] = [];
  const transfer = {
    types,
    effectAllowed: '',
    setData(type: string, value: string) {
      types.push(type);
      values.set(type, value);
    },
    getData: (type: string) => values.get(type) ?? '',
  } as unknown as DataTransfer;
  const source = container.querySelector('button')!;
  act(() => session.start(asset.id, source, transfer));
  const target = { trackId: mocks.project.tracks[0]!.id, startTime: 2, timelineLaneId: 'line-1' };
  return { asset, transfer, source, target };
}
it('admits only the active local payload and commits once without changing the playhead', async () => {
  const { asset, transfer, target } = setup();
  expect(session.accepts(transfer, true)).toBe(true);
  expect(session.accepts({ ...transfer, getData: () => 'foreign' }, true)).toBe(false);
  await act(async () => {
    session.drop(target);
    session.drop(target);
  });
  expect(mocks.place).toHaveBeenCalledExactlyOnceWith(asset.id, target, undefined);
  expect(session.drag).toBeNull();
  expect(session.pending).toBe(false);
});
it.each(['dragend', 'Escape'])('clears %s sessions and restores source focus', (kind) => {
  const { transfer, source } = setup();
  act(() =>
    window.dispatchEvent(
      kind === 'Escape' ? new KeyboardEvent('keydown', { key: 'Escape' }) : new Event('dragend')
    )
  );
  expect(session.drag).toBeNull();
  expect(session.accepts(transfer)).toBe(false);
  expect(document.activeElement).toBe(source);
});
it('discards a drag after project replacement', async () => {
  const { target, transfer } = setup();
  mocks.project = createEmptyVideoProject('Other');
  expect(session.accepts(transfer)).toBe(false);
  await act(async () => session.drop(target));
  expect(mocks.place).not.toHaveBeenCalled();
});
it.each(['cancel', 'track-change', 'unmount'])(
  'rejects pending telemetry after %s',
  async (change) => {
    let resolve!: (value: undefined) => void;
    mocks.telemetry.mockImplementation(
      () =>
        new Promise<undefined>((done) => {
          resolve = done;
        })
    );
    const { target } = setup(true);
    act(() => session.drop(target));
    expect(session.pending).toBe(true);
    if (change === 'cancel')
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    if (change === 'track-change')
      mocks.project = {
        ...mocks.project!,
        tracks: mocks.project!.tracks.map((track) => ({ ...track, locked: true })),
      };
    if (change === 'unmount') act(() => root.render(null));
    await act(async () => resolve(undefined));
    expect(mocks.place).not.toHaveBeenCalled();
  }
);
it('keeps an accepted drop alive after native dragend and reports placement failure', async () => {
  let resolve!: (value: undefined) => void;
  mocks.telemetry.mockImplementation(
    () =>
      new Promise<undefined>((done) => {
        resolve = done;
      })
  );
  const { target, asset } = setup(true);
  act(() => {
    session.drop(target);
    window.dispatchEvent(new Event('dragend'));
  });
  mocks.place.mockReturnValue({ status: 'rejected', reason: 'locked-track' });
  await act(async () => resolve(undefined));
  expect(mocks.place).toHaveBeenCalledExactlyOnceWith(asset.id, target, undefined);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});
