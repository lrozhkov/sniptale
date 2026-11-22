// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { VideoReview } from './index';
import * as audioPlaybackEngine from '../../workflows/video-review/audio-playback-engine';
import { FakeEngine } from './review-audio-runtime.test-support';
import {
  createEditorFixture,
  committedEditorFixtureProjection,
} from './editor-fixture.test-support';
import type { commitVideoWorkspaceWithProjection } from '../../composition/persistence/review-workspaces/store';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const integration = vi.hoisted(() => ({
  load: vi.fn(),
  index: vi.fn(),
  draft: vi.fn(),
  commit: vi.fn(),
  history: vi.fn(),
  read: vi.fn(),
  advanced: vi.fn(),
  snapshot: vi.fn(),
  download: vi.fn(),
  export: vi.fn(),
}));
vi.mock('../../workflows/video-review/export-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/video-review/export-lifecycle')>()),
  exportReviewedVideo: integration.export,
}));
vi.mock('../../workflows/video-review/media-index', () => ({
  inspectReviewMedia: integration.index,
  supportedReviewVideoCodecs: vi.fn(async (format: string) =>
    format === 'mp4' ? ['avc'] : ['vp9', 'vp8']
  ),
}));
vi.mock('../../workflows/video-review/source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/video-review/source')>()),
  loadVideoReviewSource: integration.load,
}));
vi.mock('../../composition/persistence/review-workspaces/store', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/review-workspaces/store')
  >()),
  saveVideoWorkspaceDraft: integration.draft,
  saveVideoWorkspaceAdvanced: integration.advanced,
  saveVideoWorkspaceSnapshot: integration.snapshot,
  commitVideoWorkspace: integration.commit,
  commitVideoWorkspaceWithProjection: async (
    args: Parameters<typeof commitVideoWorkspaceWithProjection>[0]
  ) => committedEditorFixtureProjection(await integration.commit(args)),
  moveVideoWorkspaceHistory: integration.history,
  readVideoWorkspace: integration.read,
}));
vi.mock('../../workflows/video-review/audio-import', () => ({
  importReviewAudio: vi.fn(
    async (args: {
      attach(assetId: string, duration: number): Promise<void>;
      assertCurrentTarget(): void;
      signal: AbortSignal;
    }) => {
      args.signal.throwIfAborted();
      args.assertCurrentTarget();
      await args.attach('project-asset:drop', 2);
    }
  ),
  importedAudioClip: (assetId: string, duration: number, atTime: number) => ({
    id: `audio-${assetId}`,
    assetId,
    timelineStart: atTime,
    sourceOffset: 0,
    duration,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  }),
}));
vi.mock('../shared/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/download')>()),
  downloadGalleryBlob: integration.download,
}));

async function dragRange(
  host: HTMLElement,
  options: { lane?: 'zoomLane' | 'original' | 'ruler'; start?: number; end?: number } = {}
) {
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  const gutter = Number.parseFloat(plane.style.getPropertyValue('--review-track-gutter'));
  vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(-gutter, 0, gutter + 400, 80)
  );
  Object.assign(plane, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  const original =
    options.lane === 'original'
      ? host.querySelector<HTMLElement>('[data-original-audio-lane]')
      : null;
  const ruler =
    !options.lane || options.lane === 'ruler'
      ? host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.ruler"]')
      : null;
  const local = original ?? ruler;
  if (local)
    Object.assign(local, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => new DOMRect(0, 0, 400, 32),
    });
  for (const [type, x] of [
    ['pointerdown', options.start ?? 100],
    ['pointermove', options.end ?? 200],
    ['pointerup', options.end ?? 200],
  ] as const)
    await act(async () =>
      (
        local ??
        (type === 'pointerdown'
          ? host.querySelector(`[data-ui="gallery.videoReview.${options.lane ?? 'sourceLane'}"]`)!
          : plane)
      ).dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }))
    );
}

async function selectTrack(
  host: HTMLElement,
  track: 'source' | 'zoom' | 'originalAudio' | 'mouse'
) {
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        `[data-review-header-track="${track}"] [data-review-track-select]`
      )!
      .click()
  );
}

/** History controls act on accepted content, after the product autosave acknowledgement. */
async function waitForContentCommit(
  fixture: ReturnType<typeof createEditorFixture>,
  cursor: number,
  after?: Record<string, unknown>
) {
  await act(async () => {
    await vi.waitFor(
      () => {
        expect(
          fixture.snapshot.workspace.cursor,
          JSON.stringify(fixture.snapshot.workspace.history)
        ).toBe(cursor);
        expect(fixture.snapshot.workspace.history.at(-1)?.target).toBe('advancedContent');
        if (after) expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({ after });
      },
      { timeout: 2_500 }
    );
  });
}

it('creates a source-audio mute from a range, opens properties and restores it through undo/redo', async () => {
  const fixture = createEditorFixture(integration, { inspectorWidth: 0 });
  integration.index.mockResolvedValue({
    duration: 4,
    boundaries: [0, 1, 2, 3, 4],
    videoCodec: 'vp8',
    audioCodec: 'opus',
    processedAudioCodec: 'opus',
    container: 'webm',
    rotation: 0,
  });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    // First entry commits zoom enablement before the independent audio gesture.
    await waitForContentCommit(fixture, 1);
    expect(fixture.host.querySelector('[data-review-track="originalAudio"]')).not.toBeNull();
    expect(fixture.host.querySelector('[data-review-track="zoom"]')).not.toBeNull();
    await dragRange(fixture.host);
    await selectTrack(fixture.host, 'originalAudio');
    await fixture.click('originalAudioRange');
    await waitForContentCommit(fixture, 2);
    expect(
      fixture.host.querySelectorAll('[data-ui="gallery.videoReview.originalAudioRange"]')
    ).toHaveLength(1);
    const range = fixture.host.querySelector('[data-ui="gallery.videoReview.originalAudioRange"]')!;
    expect(range.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.host.querySelector('[data-ui="gallery.videoReview.sourceRange"]')).toBeNull();
    expect(fixture.host.textContent).toContain('gallery.videoReview.muteAudioRange');
    expect(fixture.host.querySelectorAll('[data-audio-edge]')).toHaveLength(2);
    await act(async () => fixture.key(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC' })));
    expect(fixture.host.querySelector('[data-ui="gallery.videoReview.cutRegion"]')).toBeNull();
    expect(fixture.host.querySelector('[aria-label="gallery.videoReview.cutMode"]')).toBeNull();
    await fixture.click('undo');
    expect(
      fixture.host.querySelectorAll('[data-ui="gallery.videoReview.originalAudioRange"]')
    ).toHaveLength(1);
    await fixture.click('undo');
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.originalAudioRange"]')
    ).toBeNull();
    await fixture.click('redo');
    const restored = fixture.host.querySelector<HTMLButtonElement>(
      '[data-ui="gallery.videoReview.originalAudioRange"]'
    )!;
    expect(restored).not.toBeNull();
    await act(async () => restored.click());
    await act(async () =>
      fixture.key(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete' }))
    );
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.originalAudioRange"]')
    ).toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

it('draws a source-audio volume edit with an independent toolbar default', async () => {
  const fixture = createEditorFixture(integration);
  integration.index.mockResolvedValue({
    duration: 4,
    boundaries: [0, 1, 2, 3, 4],
    videoCodec: 'vp8',
    audioCodec: 'opus',
    processedAudioCodec: 'opus',
    container: 'webm',
    rotation: 0,
  });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    // First entry commits zoom enablement before the independent audio gesture.
    await waitForContentCommit(fixture, 1);
    await selectTrack(fixture.host, 'originalAudio');
    await fixture.selectRulerRange(1, 2);
    await fixture.click('originalAudioRange');
    await waitForContentCommit(fixture, 2, {
      audio: { original: { ranges: [expect.objectContaining({ volume: 0.5 })] } },
    });
    const item = fixture.host.querySelector<HTMLButtonElement>(
      '[data-ui="gallery.videoReview.originalAudioRange"]'
    );
    expect(item).not.toBeNull();
    expect(item?.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.host.textContent).toContain('gallery.videoReview.volume');
    expect(item?.title).toContain('50%');
    await fixture.click('undo');
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.originalAudioRange"]')
    ).toBeNull();
    await fixture.click('redo');
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.originalAudioRange"]')
    ).not.toBeNull();
    await selectTrack(fixture.host, 'originalAudio');
    await fixture.selectRulerRange(3, 4);
    await fixture.click('originalAudioRange');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(
      fixture.host.querySelectorAll('[data-ui="gallery.videoReview.originalAudioRange"]')
    ).toHaveLength(2);
  } finally {
    await fixture.cleanup();
  }
});

it('keeps Volume unavailable without source audio and drops the tool on leaving advanced mode', async () => {
  const fixture = createEditorFixture(integration);
  integration.index.mockResolvedValue({
    duration: 4,
    boundaries: [0, 1, 2, 3, 4],
    videoCodec: 'vp8',
    audioCodec: null,
    container: 'webm',
    rotation: 0,
  });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    expect(fixture.host.querySelector('[data-review-header-track="originalAudio"]')).toBeNull();
    expect(
      fixture.host.querySelector('[aria-label="gallery.videoReview.originalAudioRange"]')
    ).toBeNull();
  } finally {
    await fixture.cleanup();
  }

  const audible = createEditorFixture(integration);
  integration.index.mockResolvedValue({
    duration: 4,
    boundaries: [0, 1, 2, 3, 4],
    videoCodec: 'vp8',
    audioCodec: 'opus',
    container: 'webm',
    rotation: 0,
  });
  try {
    await act(async () =>
      audible.root.render(<VideoReview aggregateId="recording:r" onBack={audible.back} />)
    );
    await audible.click('advancedEditing');
    expect(audible.host.querySelector('[data-history-family="cursor"]')).toBeNull();
    await selectTrack(audible.host, 'mouse');
    await selectTrack(audible.host, 'originalAudio');
    await audible.click('originalAudioRange');
    expect(audible.button('originalAudioRange').getAttribute('aria-pressed')).toBeNull();
    await audible.click('advancedEditing');
    await dragRange(audible.host);
    expect(
      audible.host.querySelector('[data-ui="gallery.videoReview.originalAudioRange"]')
    ).not.toBeNull();
  } finally {
    await audible.cleanup();
  }
});

it('inserts focus in result coordinates and never draws another object from a lane gesture', async () => {
  const fixture = createEditorFixture(integration, {
    history: [
      {
        id: 'speed-op',
        at: 1,
        target: 'edit',
        before: null,
        after: {
          id: 'speed',
          kind: 'speed',
          start: 0,
          end: 1,
          requestedStart: 0,
          requestedEnd: 1,
          rate: 2,
          audio: 'speed',
        },
      },
    ],
  });
  integration.index.mockResolvedValue({
    duration: 4,
    boundaries: [0, 1, 2, 3, 4],
    videoCodec: 'vp8',
    audioCodec: 'opus',
    container: 'webm',
    rotation: 0,
  });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    await waitForContentCommit(fixture, 2);
    await fixture.addFocus(1, 2);
    const inspector = fixture.host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]');
    expect(inspector).not.toBeNull();
    expect(fixture.button('zoomRegionLabel').getAttribute('aria-pressed')).toBe('false');
    expect(fixture.host.querySelector('[aria-label="gallery.videoReview.pointerTool"]')).toBeNull();
    await waitForContentCommit(fixture, 3);
    expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({
      target: 'advancedContent',
      after: {
        zoom: {
          regions: [expect.objectContaining({ start: 0.5, end: 1.5, timeDomain: 'result' })],
        },
      },
    });
    const before = fixture.snapshot.workspace.history.length;
    await dragRange(fixture.host, { lane: 'zoomLane', start: 280, end: 360 });
    expect(fixture.snapshot.workspace.history).toHaveLength(before);
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.focusRangePreview"]')
    ).toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

it('inserts focus in the available result interval of a cut project', async () => {
  const fixture = createEditorFixture(integration, {
    history: [
      {
        id: 'cut-op',
        at: 1,
        target: 'edit',
        before: null,
        after: {
          id: 'cut',
          kind: 'cut',
          start: 1.5,
          end: 2.5,
          requestedStart: 1.5,
          requestedEnd: 2.5,
        },
      },
    ],
  });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    await fixture.addFocus(0.25, 0.75);
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')
    ).not.toBeNull();
    expect(fixture.button('zoomRegionLabel').getAttribute('aria-pressed')).toBe('false');
    const regions = fixture.snapshot.workspace.history
      .filter((op) => op.target === 'advancedContent')
      .at(-1);
    expect(regions).toMatchObject({
      after: {
        zoom: {
          regions: [expect.objectContaining({ start: 0.25, end: 0.75, timeDomain: 'result' })],
        },
      },
    });
  } finally {
    await fixture.cleanup();
  }
});

it('keeps occupied gain commands disabled and recovers from a playback failure', async () => {
  const fixture = createEditorFixture(integration);
  integration.index.mockResolvedValue({
    duration: 4,
    boundaries: [0, 1, 2, 3, 4],
    videoCodec: 'vp8',
    audioCodec: 'opus',
    processedAudioCodec: 'opus',
    container: 'webm',
    rotation: 0,
  });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    await selectTrack(fixture.host, 'originalAudio');
    await fixture.selectRulerRange(1, 2);
    await fixture.click('originalAudioRange');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    const timeline = fixture.host.querySelector('[data-ui="gallery.videoReview.timeline"]')!;
    await selectTrack(fixture.host, 'originalAudio');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await fixture.selectRulerRange(1, 2);
      await fixture.click('originalAudioRange');
      expect(fixture.button('originalAudioRange').disabled).toBe(true);
      expect(fixture.button('originalAudioRange').title).toBe(
        'gallery.videoReview.originalAudioRange'
      );
      expect(timeline.textContent).not.toContain('gallery.videoReview.originalAudioOverlap');
      expect(timeline.querySelector('[data-ui="gallery.videoReview.sourceRange"]')).toBeNull();
      expect(
        timeline.querySelectorAll('[data-ui="gallery.videoReview.originalAudioRange"]')
      ).toHaveLength(1);
      expect(fixture.host.querySelector('[data-ui="gallery.videoReview.feedback"]')).toBeNull();
    }
    await act(async () =>
      fixture.host
        .querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.originalAudioRange"]')!
        .click()
    );
    await fixture.click('deleteSelected');
    vi.spyOn(audioPlaybackEngine, 'createReviewAudioEngine').mockImplementation(
      () => new FakeEngine()
    );
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('playback'));
    await fixture.click('play');
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.feedback"]')?.textContent
    ).toContain('gallery.videoReview.playbackFailed');
    await dragRange(fixture.host, { lane: 'original', start: 80, end: 180 });
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.feedback"]')?.textContent
    ).toContain('gallery.videoReview.playbackFailed');
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.feedback"]')?.textContent
    ).not.toContain('gallery.videoReview.originalAudioOverlap');
    await fixture.click('play');
    expect(fixture.host.querySelector('[data-ui="gallery.videoReview.feedback"]')).toBeNull();
    expect(fixture.host.querySelector('video')?.paused).toBe(false);
  } finally {
    await fixture.cleanup();
  }
});

vi.mock('../../workflows/sync-transfer/editing-admission', () => ({
  ensureNativeEditingRootAvailable: vi.fn(async () => undefined),
}));

it('isolates editing controls while the voiceover tab is open and restores them on close', async () => {
  const fixture = createEditorFixture(integration);
  const { host, root, click, back } = fixture;
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    await click('advancedEditing');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[data-review-header-track="voiceover"] [data-review-track-select]'
        )!
        .click()
    );
    await click('recordVoiceover');
    const modal = host.querySelector('[data-ui="gallery.videoReview.voiceoverInspector"]');
    expect(modal).not.toBeNull();
    expect(modal!.textContent).toContain('gallery.videoReview.recordVoiceover');
    expect(host.querySelector('[data-ui="gallery.videoReview.voiceoverStrip"]')).toBeNull();
    expect(
      host.querySelector('[data-ui="gallery.videoReview.inspector"] header h2')?.textContent
    ).toContain('gallery.videoReview.recordVoiceover');
    expect(host.querySelector('[inert]')).not.toBeNull();
    await act(async () =>
      modal!.querySelector<HTMLButtonElement>('[aria-label="common.actions.close"]')!.click()
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('[inert]')).toBeNull();
  } finally {
    await fixture.cleanup();
  }
});
