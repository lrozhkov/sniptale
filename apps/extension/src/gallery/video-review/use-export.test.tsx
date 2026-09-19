// @vitest-environment jsdom
import { ReviewRenderOptions } from './edit-actions';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type { LoadedReview } from './use-session';
import { prepareReviewExporter, useReviewExport } from './use-export';
const mocks = vi.hoisted(() => ({ index: vi.fn(), export: vi.fn(), download: vi.fn() }));
vi.mock('../../workflows/video-review/media-index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/video-review/media-index')>()),
  inspectReviewMedia: mocks.index,
}));
vi.mock('../../workflows/video-review/export-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/video-review/export-lifecycle')>()),
  exportReviewedVideo: mocks.export,
}));
vi.mock('../shared/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/download')>()),
  downloadGalleryBlob: mocks.download,
}));
function setup(
  apply?: (advanced: ReturnType<typeof createQuickEditAdvancedState>) => void,
  showOptions = false
) {
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
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  apply?.(snapshot.workspace.advanced);
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
    processedVideoCodec: 'vp9',
  });
  const host = document.createElement('div');
  const root = createRoot(host);
  let hook!: ReturnType<typeof useReviewExport>;
  function Harness() {
    hook = useReviewExport(resource);
    return showOptions ? <ReviewRenderOptions exporter={hook} busy={false} /> : null;
  }
  return {
    host,
    root,
    Harness,
    resource,
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

it('downloads the rendered result when only visual effects are applied', async () => {
  const fixture = setup((advanced) => {
    advanced.ui.mode = 'advanced';
    advanced.zoom.enabled = true;
  });
  mocks.export.mockResolvedValue({
    file: new File(['copy'], 'copy.webm'),
    receipt: { filename: 'copy.webm' },
  });
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    await act(async () => fixture.hook.download());
    expect(mocks.export).toHaveBeenCalledOnce();
    expect(mocks.export.mock.calls[0]![0].destination).toBe('download');
    expect(mocks.download).toHaveBeenCalledWith(
      expect.anything(),
      'copy.webm',
      undefined,
      expect.any(Function)
    );
  } finally {
    await fixture.cleanup();
  }
});

it('passes the selected render options through the real export hook', async () => {
  const fixture = setup((advanced) => {
    advanced.ui.mode = 'advanced';
    advanced.background = {
      enabled: true,
      type: 'solid',
      color: '#112233ff',
      layout: { padding: 8, cornerRadius: 4 },
    };
  }, true);
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    const selects = fixture.host.querySelectorAll('select');
    expect(selects).toHaveLength(3);
    for (const [index, value] of [
      [0, 'vp9'],
      [1, '24'],
      [2, 'standard'],
    ] as const) {
      await act(async () => {
        selects[index]!.value = value;
        selects[index]!.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    await act(async () => fixture.hook.start());
    expect(mocks.export.mock.calls[0]![0].renderSettings).toEqual({
      codec: 'vp9',
      frameRate: 24,
      quality: 'standard',
    });
  } finally {
    await fixture.cleanup();
  }
});
it('flushes pending edits before the download entry point', async () => {
  const fixture = setup();
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    const order: string[] = [];
    mocks.download.mockImplementation(() => {
      order.push('download');
    });
    const exporter = prepareReviewExporter(
      fixture.hook,
      async (action) => {
        await action();
      },
      async () => {
        order.push('flush');
      }
    );
    await act(async () => exporter.download());
    expect(order).toEqual(['flush', 'download']);
  } finally {
    await fixture.cleanup();
  }
});
