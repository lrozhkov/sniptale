// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { VideoReviewLoadError } from '../../workflows/video-review/source';
import { useLoadedReview } from './use-session';

const mocks = vi.hoisted(() => ({ load: vi.fn(), acquire: vi.fn(), release: vi.fn() }));
vi.mock('../../workflows/video-review/source', async (load) => ({
  ...(await load<typeof import('../../workflows/video-review/source')>()),
  loadVideoReviewSource: mocks.load,
}));
vi.mock('../../composition/persistence/assets/resource-sessions', async (load) => ({
  ...(await load<typeof import('../../composition/persistence/assets/resource-sessions')>()),
  acquireAssetResourceSession: mocks.acquire,
}));

function source(id: string) {
  const metadata = { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 3 };
  return {
    file: new File(['webm'], 'review.webm'),
    filename: 'review.webm',
    source: metadata,
    telemetry: null,
    snapshot: {
      draft: null,
      workspace: {
        aggregateId: id,
        sourceAssetId: 'asset',
        formatVersion: 1 as const,
        source: metadata,
        revision: 1,
        cursor: 0,
        history: [],
        advanced: createQuickEditAdvancedState(),
        createdAt: 1,
        updatedAt: 1,
      },
    },
  };
}

let root: ReturnType<typeof createRoot>;
let current: ReturnType<typeof useLoadedReview>;
function Owner({ id }: { id: string }) {
  current = useLoadedReview(id);
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.acquire.mockResolvedValue({ release: mocks.release });
  mocks.release.mockResolvedValue(undefined);
  mocks.load.mockImplementation(async (id: string) => source(id));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:review');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('releases the old reader and rejects its late source after another recording opens', async () => {
  let resolve!: (value: ReturnType<typeof source>) => void;
  mocks.load.mockImplementationOnce(
    () =>
      new Promise((finish) => {
        resolve = finish;
      })
  );
  await act(async () => root.render(<Owner id="recording:old" />));
  const signal: AbortSignal = mocks.load.mock.calls[0]![1];
  await act(async () => root.render(<Owner id="recording:new" />));
  expect(signal.aborted).toBe(true);
  expect(mocks.release).not.toHaveBeenCalled();
  expect(current.resource?.snapshot.workspace.aggregateId).toBe('recording:new');
  await act(async () => resolve(source('recording:old')));
  expect(current.resource?.snapshot.workspace.aggregateId).toBe('recording:new');
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
  expect(mocks.release).toHaveBeenCalledOnce();
});

it.each(['typed-source', 'unknown-source', 'session-url'] as const)(
  'retains the %s failure and reacquires the reader on explicit retry',
  async (kind) => {
    if (kind === 'typed-source')
      mocks.load.mockRejectedValueOnce(new VideoReviewLoadError('source', 'unavailable'));
    else if (kind === 'unknown-source') mocks.load.mockRejectedValueOnce(new Error('read failed'));
    else
      vi.mocked(URL.createObjectURL).mockImplementationOnce(() => {
        throw new Error('url failed');
      });
    await act(async () => root.render(<Owner id="recording:r" />));
    expect(current.resource).toBeNull();
    expect(current.failed?.stage).toBe(kind === 'session-url' ? 'session' : 'source');
    expect(mocks.release).toHaveBeenCalledOnce();
    await act(async () => current.retry());
    expect(current.failed).toBeNull();
    expect(current.resource?.url).toBe('blob:review');
    expect(mocks.acquire).toHaveBeenCalledTimes(2);
  }
);

it('releases a reader acquired after its loading owner unmounts without reading the source', async () => {
  let resolve!: (value: { release: typeof mocks.release }) => void;
  mocks.acquire.mockImplementationOnce(
    () =>
      new Promise((finish) => {
        resolve = finish;
      })
  );
  await act(async () => root.render(<Owner id="recording:r" />));
  await act(async () => root.render(null));
  await act(async () => resolve({ release: mocks.release }));
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(mocks.load).not.toHaveBeenCalled();
});

vi.mock('../../workflows/sync-transfer/editing-admission', () => ({
  ensureNativeEditingRootAvailable: vi.fn(async () => undefined),
}));
