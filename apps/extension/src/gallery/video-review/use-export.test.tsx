// @vitest-environment jsdom
import * as telemetryProjection from '../../features/video/review/telemetry';
import { translate } from '../../platform/i18n';
import { QuickEditExportUnavailable } from '../../workflows/video-review/export-lifecycle';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { ReviewRenderOptions } from './edit-actions';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type { LoadedReview } from './use-session';
import { prepareReviewExporter, useReviewExport } from './use-export';
import {
  installDiagnosticLogObserver,
  type DiagnosticLogEvent,
} from '@sniptale/platform/observability/logger';
const mocks = vi.hoisted(() => ({ index: vi.fn(), export: vi.fn(), download: vi.fn() }));
vi.mock('../../workflows/video-review/media-index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/video-review/media-index')>()),
  inspectReviewMedia: mocks.index,
  supportedReviewVideoCodecs: vi.fn(async (format: string) =>
    format === 'mp4' ? ['avc'] : ['vp9', 'vp8']
  ),
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
it('keeps the actual UI default source profile and restores it after an explicit quality choice', async () => {
  const fixture = setup((advanced) => {
    advanced.ui.mode = 'advanced';
  }, true);
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    expect(fixture.hook.renderSettings).toEqual({ frameRate: 0 });
    expect(fixture.hook.sourceVideoAvailable).toBe(true);
    expect(fixture.hook.plan()).toMatchObject({ kind: 'ready', video: 'copy' });
    const quality = fixture.host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.exportQuality')}"]`
    )!;
    expect(quality.textContent).toContain(translate('gallery.videoReview.exportSourceVideo'));
    await act(async () => fixture.hook.setRenderSettings({ frameRate: 0, quality: 'HIGH' }));
    expect(fixture.hook.plan()).toMatchObject({ kind: 'ready', video: 'render' });
    expect(fixture.hook.sourceVideoAvailable).toBe(true);
    await act(async () => quality.click());
    const source = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
      (button) => button.textContent === translate('gallery.videoReview.exportSourceVideo')
    )!;
    expect(source.disabled).toBe(false);
    await act(async () => source.click());
    expect(fixture.hook.renderSettings).toEqual({ frameRate: 0 });
    expect(fixture.hook.plan()).toMatchObject({ kind: 'ready', video: 'copy' });
  } finally {
    await fixture.cleanup();
  }
});

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
      reject(new DOMException('aborted', 'AbortError'));
      await pending;
    });
    expect(fixture.hook.failed).toBe(false);
    expect(fixture.hook.result).toBeNull();
    expect(fixture.hook.completion).toBeNull();
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
    expect(fixture.hook.completion).toEqual({ destination: 'download', mediaId: null });
    expect(fixture.hook.phase).toBe('idle');
  } finally {
    await fixture.cleanup();
  }
});

it('downloads the rendered result when only visual effects are applied', async () => {
  const fixture = setup((advanced) => {
    advanced.ui.mode = 'advanced';
    advanced.ui.tracks.zoom = true;
    advanced.zoom.enabled = true;
    advanced.zoom.regions = [createQuickEditZoomRegion({ id: 'visual', at: 0, endMax: 4 })];
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
    const selects = fixture.host.querySelectorAll<HTMLButtonElement>('[aria-haspopup="listbox"]');
    expect(selects).toHaveLength(5);
    for (const [label, option] of [
      [translate('gallery.videoReview.exportCodec'), 'VP9'],
      [translate('gallery.videoReview.exportFrameRate'), '24'],
      [
        translate('gallery.videoReview.exportQuality'),
        translate('videoEditor.exportDialog.qualityMedium'),
      ],
    ]) {
      const trigger = Array.from(selects).find(
        (node) => node.getAttribute('aria-label') === label
      )!;
      await act(async () => trigger.click());
      const choice = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="option"]')
      ).find((node) => node.textContent?.trim() === option)!;
      await act(async () => choice.click());
    }
    await act(async () => fixture.hook.start());
    expect(mocks.export.mock.calls[0]![0].renderSettings).toEqual({
      codec: 'vp9',
      frameRate: 24,
      frameRateMode: 'constant',
      quality: 'MEDIUM',
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
      },
      () => {
        order.push('pause');
      }
    );
    await act(async () => exporter.download());
    expect(order).toEqual(['pause', 'flush', 'download']);
  } finally {
    await fixture.cleanup();
  }
});

it('allows recovery from unavailable export settings after the profile changes', async () => {
  const fixture = setup((advanced) => {
    advanced.ui.mode = 'advanced';
  });
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    await act(async () =>
      fixture.hook.setRenderSettings({
        quality: 'HIGH',
        frameRate: 30,
        format: 'webm',
        codec: 'avc',
      })
    );
    await act(async () => fixture.hook.start());
    expect(fixture.hook.blocked).toEqual(['video-encoder']);
    await act(async () =>
      fixture.hook.setRenderSettings({
        quality: 'HIGH',
        frameRate: 30,
        format: 'webm',
        codec: 'vp9',
      })
    );
    expect(fixture.hook.blocked).toBeNull();
    expect(fixture.hook.plan()).toMatchObject({ kind: 'ready', video: 'render' });
  } finally {
    await fixture.cleanup();
  }
});

it('retains camera conflict location and permits retry after settings change', async () => {
  const fixture = setup();
  const conflicts = [
    { regionId: 'zoom', interval: { start: 1.5, end: 4 }, time: 2, reason: 'dynamics' as const },
  ];
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    mocks.export.mockRejectedValueOnce(
      new QuickEditExportUnavailable(['camera-follow'], [], conflicts)
    );
    await act(async () => fixture.hook.start());
    expect(fixture.hook.cameraConflicts).toEqual(conflicts);
    expect(fixture.hook.blocked).toEqual(['camera-follow']);
    await act(async () => fixture.hook.setRenderSettings({ frameRate: 30, quality: 'HIGH' }));
    expect(fixture.hook.cameraConflicts).toEqual([]);
    mocks.export.mockResolvedValueOnce({
      file: new File(['copy'], 'copy.webm'),
      receipt: { filename: 'copy.webm', mediaId: 'copy' },
    });
    await act(async () => fixture.hook.start());
    expect(fixture.hook.completion).not.toBeNull();
    expect(fixture.hook.blocked).toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

it.each([false, true])(
  'clears recovered asset failure while preserving other blockers (%s)',
  async (encoderFailure) => {
    const fixture = setup();
    try {
      await act(async () => fixture.root.render(<fixture.Harness />));
      mocks.export.mockRejectedValueOnce(
        new QuickEditExportUnavailable(
          encoderFailure ? ['asset-missing', 'video-encoder'] : ['asset-missing']
        )
      );
      await act(async () => fixture.hook.start());
      expect(fixture.hook.blocked).toContain('asset-missing');
      await act(async () => fixture.hook.retryAssetAvailability());
      expect(fixture.hook.blocked).toEqual(encoderFailure ? ['video-encoder'] : null);
    } finally {
      await fixture.cleanup();
    }
  }
);

it('keeps export failure visible when pending edits were flushed after the last render', async () => {
  const fixture = setup();
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    const start = fixture.hook.start;
    const state = fixture.resource.session.getSnapshot();
    const snapshot = {
      ...state.snapshot,
      workspace: { ...state.snapshot.workspace, revision: state.snapshot.workspace.revision + 1 },
    };
    vi.spyOn(fixture.resource.session, 'getSnapshot').mockReturnValue({ ...state, snapshot });
    mocks.export.mockRejectedValueOnce(new QuickEditExportUnavailable(['asset-missing']));
    await act(async () => start());
    expect(fixture.hook.blocked).toEqual(['asset-missing']);
  } finally {
    await fixture.cleanup();
  }
});

it.each(['gallery', 'fragment'] as const)(
  'pauses before awaiting pending content for %s export',
  async (entry) => {
    const fixture = setup();
    const order: string[] = [];
    let release!: () => void;
    const flushing = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.export.mockImplementation(async () => {
      order.push('export');
      return { file: new File(['copy'], 'copy.webm'), receipt: { filename: 'copy.webm' } };
    });
    try {
      await act(async () => fixture.root.render(<fixture.Harness />));
      const exporter = prepareReviewExporter(
        fixture.hook,
        async (action) => action(),
        async () => {
          order.push('flush');
          await flushing;
        },
        () => {
          order.push('pause');
        }
      );
      let operation!: Promise<void>;
      await act(async () => {
        operation =
          entry === 'gallery'
            ? exporter.start()
            : exporter.downloadSelection({ kind: 'range', start: 2, end: 4 });
        await Promise.resolve();
      });
      expect(order).toEqual(['pause', 'flush']);
      expect(mocks.export).not.toHaveBeenCalled();
      await act(async () => {
        release();
        await operation;
      });
      expect(order).toEqual(['pause', 'flush', 'export']);
      expect(fixture.hook.phase).toBe('idle');
    } finally {
      release();
      await fixture.cleanup();
    }
  }
);

it('binds time estimates to the current attempt and clears them on cancel and publication', async () => {
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
    const first = mocks.export.mock.calls[0]![0];
    act(() => first.onTimeEstimate({ remainingMs: 12_000 }));
    expect(fixture.hook.timeEstimate).toEqual({ remainingMs: 12_000 });
    act(() => fixture.hook.cancel());
    act(() => first.onTimeEstimate({ remainingMs: 99_000 }));
    expect(fixture.hook.timeEstimate).toBeNull();
    await act(async () => {
      reject(new DOMException('aborted', 'AbortError'));
      await pending;
    });
    await act(async () => {
      pending = fixture.hook.start();
      await Promise.resolve();
    });
    expect(fixture.hook.timeEstimate).toBeNull();
    act(() => first.onTimeEstimate({ remainingMs: 99_000 }));
    expect(fixture.hook.timeEstimate).toBeNull();
    const second = mocks.export.mock.calls[1]![0];
    act(() => second.onTimeEstimate({ remainingMs: 5000 }));
    act(() => second.onPublishing());
    act(() => second.onTimeEstimate({ remainingMs: 9000 }));
    expect(fixture.hook.timeEstimate).toBeNull();
    await act(async () => {
      reject(new Error('publication failed'));
      await pending;
    });
    expect(fixture.hook.phase).toBe('idle');
    expect(fixture.hook.timeEstimate).toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

it('retains completion metadata until dismissal or the next attempt, without clearing the report receipt', async () => {
  const fixture = setup();
  const value = {
    file: new File(['copy'], 'copy.webm'),
    receipt: { filename: 'copy.webm', mediaId: 'recording:copy' },
  };
  mocks.export.mockResolvedValue(value);
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    await act(async () => fixture.hook.start());
    expect(fixture.hook.completion).toEqual({ destination: 'gallery', mediaId: 'recording:copy' });
    expect(fixture.hook.progress).toBe(100);
    expect(fixture.hook.timeEstimate).toBeNull();
    act(() => fixture.hook.dismissCompletion());
    expect(fixture.hook.completion).toBeNull();
    expect(fixture.hook.result).toBe(value);
    await act(async () => fixture.hook.start());
    let finish!: (value: unknown) => void;
    mocks.export.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = fixture.hook.start();
    });
    expect(fixture.hook.completion).toBeNull();
    act(() => mocks.export.mock.calls.at(-1)![0].onProgress(1));
    expect(fixture.hook.completion).toBeNull();
    act(() => fixture.hook.dismissCompletion());
    await act(async () => {
      finish(value);
      await pending;
    });
    expect(fixture.hook.completion).toBeNull();
    mocks.export.mockRejectedValue(new Error('failed'));
    await act(async () => fixture.hook.start());
    expect(fixture.hook.completion).toBeNull();
    expect(fixture.hook.failed).toBe(true);
  } finally {
    await fixture.cleanup();
  }
});

it('reports direct downloads and ignores cleanup errors from an older completed download', async () => {
  const fixture = setup();
  const value = {
    file: new File(['copy'], 'copy.webm'),
    receipt: { filename: 'copy.webm', mediaId: null },
    release: vi.fn(),
  };
  mocks.export.mockResolvedValue(value);
  mocks.download.mockImplementation(() => undefined);
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    await act(async () => fixture.hook.start('download'));
    const oldCleanupError = mocks.download.mock.calls.at(-1)![3];
    expect(fixture.hook.completion).toEqual({ destination: 'download', mediaId: null });
    await act(async () => fixture.hook.download());
    expect(fixture.hook.completion).toEqual({ destination: 'download', mediaId: null });
    expect(fixture.hook.progress).toBe(100);
    act(() => oldCleanupError(new Error('old cleanup')));
    expect(fixture.hook.failed).toBe(false);
    expect(fixture.hook.completion).not.toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

it('retains an unexpected diagnosis after unmount while keeping typed cancellation quiet', async () => {
  const fixture = setup();
  const previousExport = mocks.export.getMockImplementation();
  const events: DiagnosticLogEvent[] = [];
  const stop = installDiagnosticLogObserver((event) => events.push(event));
  let reject!: (error: Error) => void;
  mocks.export.mockImplementation(
    () =>
      new Promise((_, failure) => {
        reject = failure;
      })
  );
  let disposed = false;
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    let pending!: Promise<void>;
    await act(async () => {
      pending = fixture.hook.start();
    });
    act(() => fixture.hook.cancel());
    await act(async () => {
      reject(new DOMException('aborted', 'AbortError'));
      await pending;
    });
    expect(events).toEqual([]);
    await act(async () => {
      pending = fixture.hook.start();
    });
    await fixture.cleanup();
    disposed = true;
    vi.stubGlobal('__SNIPTALE_RELEASE_BUILD__', true);
    reject(new Error('private-file.webm https://private.example user text'));
    await pending;
    expect(events).toHaveLength(1);
    expect(events[0]?.message).toBe(
      'export outcome=failed route=undetermined destination=gallery stage=prepare code=prepare-failed'
    );
  } finally {
    stop();
    mocks.export.mockImplementation(previousExport ?? (() => undefined));
    if (!disposed) await fixture.cleanup();
    vi.unstubAllGlobals();
  }
});

it('handles a direct source download refusal through its own diagnostic and UI outcome', async () => {
  const fixture = setup();
  const events: DiagnosticLogEvent[] = [];
  const stop = installDiagnosticLogObserver((event) => events.push(event));
  vi.stubGlobal('__SNIPTALE_RELEASE_BUILD__', true);
  mocks.download.mockImplementationOnce(() => {
    throw new Error('private source filename');
  });
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    await act(async () => fixture.hook.download());
    expect(fixture.hook.failed).toBe(true);
    expect(fixture.hook.completion).toBeNull();
    expect(mocks.export).not.toHaveBeenCalled();
    expect(events[0]?.message).toBe(
      'export outcome=failed route=copy destination=download stage=prepare code=prepare-failed'
    );
  } finally {
    stop();
    await fixture.cleanup();
  }
});

it('exports fragments without exposing a bookend preference', async () => {
  const fixture = setup();
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    const before = structuredClone(fixture.resource.session.getSnapshot().snapshot);
    await act(async () => fixture.hook.downloadSelection({ kind: 'range', start: 0, end: 2 }));
    expect(mocks.export.mock.lastCall?.[0]).not.toHaveProperty('includeBookends');
    await act(async () => fixture.hook.start('download'));
    expect(mocks.export.mock.lastCall?.[0]).not.toHaveProperty('includeBookends');
    expect(fixture.resource.session.getSnapshot().snapshot).toEqual(before);
  } finally {
    await fixture.cleanup();
  }
});

it('shows full sequence duration without a fragment bookend option', async () => {
  const { createNeutralPresentationSettings } =
    await import('../../features/video/review/advanced/presentation');
  const fixture = setup((advanced) => {
    advanced.ui.mode = 'advanced';
    advanced.presentation = createNeutralPresentationSettings();
    advanced.presentation.intro = {
      mode: 'image',
      image: {
        assetId: 'project-asset:intro',
        width: 20,
        height: 10,
        duration: 3,
        fit: 'contain',
        fillColor: '#000000ff',
        crop: { panX: 0, panY: 0 },
      },
    };
  }, true);
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    expect(fixture.hook.hasBookends).toBe(true);
    expect(fixture.hook.presentationDuration?.totalDurationUs).toBe(9_000_000);
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.exportDuration"]')?.textContent
    ).toContain('9.0');
    expect(fixture.hook.presentationDuration?.totalDurationUs).toBe(9_000_000);
    expect(fixture.host.querySelectorAll('[aria-haspopup="listbox"]')).toHaveLength(5);
  } finally {
    await fixture.cleanup();
  }
});

it('reuses advisory export inputs during playback and refreshes changed inputs', async () => {
  const fixture = setup((advanced) => {
    advanced.ui.mode = 'advanced';
  });
  fixture.resource.telemetry = {
    recordingId: 'recording',
    createdAt: 0,
    updatedAt: 0,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
  };
  const projection = vi.spyOn(telemetryProjection, 'projectReviewTelemetry');
  try {
    await act(async () => fixture.root.render(<fixture.Harness />));
    const index = fixture.hook.index;
    projection.mockClear();
    await act(async () => fixture.root.render(<fixture.Harness />));
    expect(fixture.hook.index).toBe(index);
    expect(projection).not.toHaveBeenCalled();
    await act(async () => fixture.hook.setRenderSettings({ frameRate: 0, quality: 'HIGH' }));
    expect(projection).toHaveBeenCalled();
    projection.mockClear();
    fixture.resource.telemetry = {
      recordingId: 'recording',
      createdAt: 0,
      updatedAt: 0,
      captureMode: null,
      viewport: null,
      cursorTrack: null,
      actionEvents: [],
      signals: [],
    };
    await act(async () => fixture.root.render(<fixture.Harness />));
    expect(projection).toHaveBeenCalled();
    projection.mockClear();
    const state = fixture.resource.session.getSnapshot();
    vi.spyOn(fixture.resource.session, 'getSnapshot').mockReturnValue({
      ...state,
      document: {
        ...state.document,
        edits: [{ id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 }],
      },
    });
    await act(async () => fixture.root.render(<fixture.Harness />));
    expect(projection).toHaveBeenCalled();
    projection.mockClear();
    fixture.hook.plan();
    expect(projection).toHaveBeenCalled();
  } finally {
    projection.mockRestore();
    await fixture.cleanup();
  }
});
