// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type { LoadedReview } from './use-session';
import { useReviewExport } from './use-export';
const mocks = vi.hoisted(() => ({ index: vi.fn(), export: vi.fn(), download: vi.fn() }));
vi.mock('../../workflows/video-review/media-index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/video-review/media-index')>()),
  inspectReviewMedia: mocks.index,
}));
vi.mock('../../workflows/video-review/export-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/video-review/export-lifecycle')>()),
  exportReviewedVideo: mocks.export,
}));
vi.mock('../library/actions/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../library/actions/shared')>()),
  downloadBlob: mocks.download,
}));
function setup() {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const source = { duration: 6, width: 160, height: 90, mimeType: 'video/webm', size: 5 };
  const snapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'original',
      formatVersion: 1 as const,
      source,
      revision: 1,
      cursor: 0,
      history: [],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const resource: LoadedReview = {
    source,
    snapshot,
    file: new File(['video'], 'clip.webm'),
    filename: 'clip.webm',
    telemetry: null,
    url: 'blob:original',
    session: createVideoReviewSession(snapshot),
  };
  mocks.index.mockResolvedValue({
    duration: 6,
    boundaries: [0, 2, 4, 6],
    videoCodec: 'vp8',
    audioCodec: null,
    container: 'webm',
    rotation: 0,
  });
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewExport>;
  function Harness() {
    hook = useReviewExport(resource);
    return null;
  }
  return {
    root,
    Harness,
    get hook() {
      return hook;
    },
    async cleanup() {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    },
  };
}
it('serializes the export button, honors cancellation, and leaves no false success', async () => {
  const fixture = setup();
  let reject!: (error: Error) => void;
  mocks.export.mockImplementation(
    () =>
      new Promise((_, failure) => {
        reject = failure;
      })
  );
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    let pending!: Promise<void>;
    await act(async () => {
      pending = fixture.hook.start();
      await Promise.resolve();
    });
    await act(async () => fixture.hook.start());
    expect(mocks.export).toHaveBeenCalledOnce();
    act(() => fixture.hook.cancel());
    expect(mocks.export.mock.calls[0]![0].signal.aborted).toBe(true);
    await act(async () => {
      reject(new Error('aborted'));
      await pending;
    });
    expect(fixture.hook.failed).toBe(false);
    expect(fixture.hook.result).toBeNull();
    expect(fixture.hook.phase).toBe('idle');
  } finally {
    await fixture.cleanup();
  }
});
it('does not cancel publication and reuses the completed copy for repeated download', async () => {
  const fixture = setup();
  let resolve!: (value: unknown) => void;
  mocks.export.mockImplementation(
    () =>
      new Promise((success) => {
        resolve = success;
      })
  );
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    let pending!: Promise<void>;
    await act(async () => {
      pending = fixture.hook.start();
      await Promise.resolve();
    });
    act(() => mocks.export.mock.calls[0]![0].onPublishing());
    act(() => fixture.hook.cancel());
    expect(mocks.export.mock.calls[0]![0].signal.aborted).toBe(false);
    const file = new File(['copy'], 'copy.webm');
    await act(async () => {
      resolve({ file, receipt: { filename: 'copy.webm' } });
      await pending;
    });
    fixture.hook.download();
    fixture.hook.download();
    expect(mocks.download).toHaveBeenCalledTimes(2);
    expect(mocks.export).toHaveBeenCalledOnce();
  } finally {
    await fixture.cleanup();
  }
});

it('downloads a selection without replacing the full-result report receipt', async () => {
  const fixture = setup();
  const full = {
    file: new File(['full'], 'full.webm'),
    receipt: { filename: 'full.webm', mediaId: 'recording:copy' },
  };
  const fragment = {
    file: new File(['part'], 'part.webm'),
    receipt: { filename: 'part.webm', mediaId: null },
    release: vi.fn(),
  };
  mocks.export.mockResolvedValueOnce(full).mockResolvedValueOnce(fragment);
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    await act(async () => fixture.hook.start());
    const selection = { kind: 'range' as const, start: 2, end: 4 };
    await act(async () => fixture.hook.downloadSelection(selection));
    expect(mocks.export).toHaveBeenLastCalledWith(
      expect.objectContaining({ destination: 'download', selection })
    );
    expect(mocks.download).toHaveBeenCalledWith(
      fragment.file,
      'part.webm',
      fragment.release,
      expect.any(Function)
    );
    expect(fixture.hook.result).toBe(full);
    expect(fixture.hook.phase).toBe('idle');
  } finally {
    await fixture.cleanup();
  }
});
