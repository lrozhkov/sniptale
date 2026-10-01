// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { VideoReview } from './index';
import { createEditorFixture } from './editor-fixture.test-support';

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
  commitVideoWorkspace: integration.commit,
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
  options: { lane?: 'zoomLane' | 'original'; start?: number; end?: number } = {}
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
  if (original)
    Object.assign(original, {
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
        original ??
        (type === 'pointerdown'
          ? host.querySelector(`[data-ui="gallery.videoReview.${options.lane ?? 'sourceLane'}"]`)!
          : plane)
      ).dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }))
    );
}

it('creates a source-audio mute from a range, opens properties and restores it through undo/redo', async () => {
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
    expect(fixture.button('audioTrack').getAttribute('aria-pressed')).toBe('true');
    expect(fixture.button('zoomTrack').getAttribute('aria-pressed')).toBe('true');
    await dragRange(fixture.host);
    await fixture.click('originalAudioRange');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(
      fixture.host.querySelectorAll('[data-ui="gallery.videoReview.originalAudioRange"]')
    ).toHaveLength(1);
    const range = fixture.host.querySelector('[data-ui="gallery.videoReview.originalAudioRange"]')!;
    expect(range.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.host.querySelector('[data-ui="gallery.videoReview.sourceRange"]')).toBeNull();
    expect(fixture.host.textContent).toContain('gallery.videoReview.muteAudioRange');
    expect(fixture.host.querySelectorAll('[data-audio-edge]')).toHaveLength(2);
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC' }))
    );
    expect(fixture.host.querySelector('[data-ui="gallery.videoReview.cutRegion"]')).toBeNull();
    expect(fixture.button('cutMode').getAttribute('aria-pressed')).toBe('true');
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
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete' }))
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
    await fixture.click('originalAudioRange');
    await dragRange(fixture.host, { lane: 'original' });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
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
    await fixture.click('originalAudioRange');
    await dragRange(fixture.host, { lane: 'original', start: 400, end: 300 });
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
    expect(fixture.button('originalAudioRange').disabled).toBe(true);
    expect(fixture.button('originalAudioRange').title).toContain(
      'gallery.videoReview.originalAudioUnavailable'
    );
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
    const marker = audible.host.querySelector<HTMLButtonElement>(
      '[aria-label^="gallery.videoReview.telemetry ·"]'
    )!;
    await act(async () => marker.click());
    await audible.click('originalAudioRange');
    expect(audible.button('originalAudioRange').getAttribute('aria-pressed')).toBe('true');
    await audible.click('advancedEditing');
    await dragRange(audible.host);
    expect(
      audible.host.querySelector('[data-ui="gallery.videoReview.originalAudioRange"]')
    ).toBeNull();
  } finally {
    await audible.cleanup();
  }
});

it('draws focus in source coordinates, selects it and keeps drawing tools mutually exclusive', async () => {
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
    await fixture.click('focusRangeTool');
    expect(fixture.button('focusRangeTool').getAttribute('aria-pressed')).toBe('true');
    expect(fixture.button('pointerTool').getAttribute('aria-pressed')).toBe('false');
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'м', code: 'KeyV', bubbles: true }))
    );
    expect(fixture.button('focusRangeTool').getAttribute('aria-pressed')).toBe('false');
    expect(fixture.button('pointerTool').getAttribute('aria-pressed')).toBe('true');
    await fixture.click('focusRangeTool');
    await fixture.click('originalAudioRange');
    expect(fixture.button('focusRangeTool').getAttribute('aria-pressed')).toBe('false');
    expect(fixture.button('originalAudioRange').getAttribute('aria-pressed')).toBe('true');
    await fixture.click('focusRangeTool');
    expect(fixture.button('originalAudioRange').getAttribute('aria-pressed')).toBe('false');
    const plane = fixture.host.querySelector<HTMLElement>(
      '[data-ui="gallery.videoReview.timePlane"]'
    )!;
    const lane = fixture.host.querySelector<HTMLElement>(
      '[data-ui="gallery.videoReview.zoomLane"]'
    )!;
    const gutter = Number.parseFloat(plane.style.getPropertyValue('--review-track-gutter'));
    vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(-gutter, 0, gutter + 400, 100)
    );
    Object.assign(plane, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
    for (const [target, type, x] of [
      [lane, 'pointerdown', 100],
      [plane, 'pointermove', 200],
      [plane, 'pointerup', 200],
    ] as const) {
      await act(async () =>
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }))
      );
      if (type === 'pointermove')
        expect(
          fixture.host.querySelector('[data-ui="gallery.videoReview.focusRangePreview"]')
        ).not.toBeNull();
    }
    expect(fixture.button('focusRangeTool').getAttribute('aria-pressed')).toBe('false');
    expect(fixture.button('pointerTool').getAttribute('aria-pressed')).toBe('true');
    const inspector = fixture.host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]');
    expect(inspector).not.toBeNull();
    expect(
      inspector?.querySelector('[data-ui="gallery.videoReview.interval"]')?.textContent
    ).toContain('0.5 – 1.5');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
    expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({
      target: 'advancedContent',
      after: { zoom: { regions: [expect.objectContaining({ start: 0.5, end: 1.5 })] } },
    });
    expect(fixture.button('focusRangeTool').disabled).toBe(false);
  } finally {
    await fixture.cleanup();
  }
});

it('rejects focus over a cut and applies the focus tool immediately to an available selection', async () => {
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
    await fixture.click('focusRangeTool');
    await dragRange(fixture.host, { lane: 'zoomLane' });
    expect(fixture.host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')).toBeNull();
    expect(fixture.button('focusRangeTool').getAttribute('aria-pressed')).toBe('true');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(fixture.button('focusRangeTool').getAttribute('aria-pressed')).toBe('false');
    await dragRange(fixture.host);
    expect(fixture.button('focusRangeTool').disabled).toBe(true);
    await dragRange(fixture.host, { start: 25, end: 75 });
    expect(fixture.button('focusRangeTool').disabled).toBe(false);
    await fixture.click('focusRangeTool');
    const inspector = fixture.host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]');
    expect(inspector).not.toBeNull();
    expect(
      inspector?.querySelector('[data-ui="gallery.videoReview.interval"]')?.textContent
    ).toContain('0.3 – 0.8');
  } finally {
    await fixture.cleanup();
  }
});

it('keeps repeated gain failures in the inspector without source selection', async () => {
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
    await fixture.click('originalAudioRange');
    await dragRange(fixture.host, { lane: 'original' });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    const timeline = fixture.host.querySelector('[data-ui="gallery.videoReview.timeline"]')!;
    await fixture.click('originalAudioRange');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await dragRange(fixture.host, { lane: 'original', start: 80, end: 180 });
      expect(fixture.host.querySelector('aside')?.textContent).toContain(
        'gallery.videoReview.originalAudioOverlap'
      );
      expect(timeline.textContent).not.toContain('gallery.videoReview.originalAudioOverlap');
      expect(timeline.querySelector('[data-ui="gallery.videoReview.sourceRange"]')).toBeNull();
      expect(
        timeline.querySelectorAll('[data-ui="gallery.videoReview.originalAudioRange"]')
      ).toHaveLength(1);
    }
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('playback'));
    await fixture.click('play');
    expect(fixture.host.querySelector('aside')?.textContent).toContain(
      'gallery.videoReview.playbackFailed'
    );
    await dragRange(fixture.host, { lane: 'original', start: 80, end: 180 });
    expect(fixture.host.querySelector('aside')?.textContent).toContain(
      'gallery.videoReview.playbackFailed'
    );
    expect(fixture.host.querySelector('aside')?.textContent).not.toContain(
      'gallery.videoReview.originalAudioOverlap'
    );
  } finally {
    await fixture.cleanup();
  }
});
