// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { VideoReview } from './index';
import {
  createEditorFixture,
  committedEditorFixtureProjection,
} from './editor-fixture.test-support';
import type { commitVideoWorkspaceWithProjection } from '../../composition/persistence/review-workspaces/store';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';

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
  editorRender: vi.fn(),
  inspectorRender: vi.fn(),
  laneRender: vi.fn(),
  useSilentMediaFixture: false,
}));
vi.mock('./use-review-audio-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./use-review-audio-runtime')>();
  return {
    ...actual,
    useReviewEditorAudioRuntime: (
      props: Parameters<typeof actual.useReviewEditorAudioRuntime>[0]
    ) => {
      const runtime = actual.useReviewEditorAudioRuntime(
        integration.useSilentMediaFixture ? { ...props, silent: true } : props
      );
      return integration.useSilentMediaFixture ? { ...runtime, startPlayback: () => {} } : runtime;
    },
  };
});
vi.mock('./use-editor-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./use-editor-state')>();
  return {
    ...actual,
    useReviewEditorState: (...args: Parameters<typeof actual.useReviewEditorState>) => {
      integration.editorRender();
      return actual.useReviewEditorState(...args);
    },
  };
});
vi.mock('./inspector-binding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./inspector-binding')>();
  return {
    ...actual,
    ReviewInspectorBinding: (props: Parameters<typeof actual.ReviewInspectorBinding>[0]) => {
      integration.inspectorRender();
      return actual.ReviewInspectorBinding(props);
    },
  };
});
vi.mock('./track-row', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./track-row')>();
  return {
    ...actual,
    ReviewTrackRow: (props: Parameters<typeof actual.ReviewTrackRow>[0]) => {
      if (props.track) integration.laneRender(props.track);
      return actual.ReviewTrackRow(props);
    },
  };
});
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
  options: { lane?: 'zoomLane'; start?: number; end?: number } = {}
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
  for (const [type, x] of [
    ['pointerdown', options.start ?? 100],
    ['pointermove', options.end ?? 200],
    ['pointerup', options.end ?? 200],
  ] as const)
    await act(async () =>
      (type === 'pointerdown'
        ? host.querySelector(`[data-ui="gallery.videoReview.${options.lane ?? 'sourceLane'}"]`)!
        : plane
      ).dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }))
    );
}

it('advances the real Gallery playhead without rendering the editor, inspector or lanes per tick', async () => {
  const fixture = createEditorFixture(integration);
  integration.index.mockResolvedValue({
    duration: 4,
    boundaries: [0, 4],
    videoCodec: 'vp8',
    audioCodec: null,
    container: 'webm',
    rotation: 0,
  });
  integration.useSilentMediaFixture = true;
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  let frameId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const tick = async (video: HTMLVideoElement, time: number) => {
    await act(async () => {
      now = time * 1000;
      video.currentTime = time;
      video.dispatchEvent(new Event('timeupdate'));
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(now);
    });
  };
  const counters = [integration.editorRender, integration.inspectorRender, integration.laneRender];
  const playhead = () =>
    fixture.host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.rulerPlayhead"]')!;
  for (const counter of counters) counter.mockClear();
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    const video = fixture.host.querySelector<HTMLVideoElement>(
      '[data-ui="gallery.videoReview.stage"] video'
    )!;
    Object.defineProperties(video, {
      duration: { value: 4 },
      readyState: { value: 4 },
    });
    await act(async () => {
      video.dispatchEvent(new Event('loadedmetadata'));
      video.dispatchEvent(new Event('canplay'));
    });
    expect(fixture.button('play').disabled).toBe(false);
    await fixture.click('play');
    expect(video.play).toHaveBeenCalled();
    await tick(video, 0.25);
    expect(video.paused).toBe(false);
    for (const counter of counters) {
      expect(counter).toHaveBeenCalled();
      counter.mockClear();
    }
    let previous = playhead().style.transform;
    for (const time of [0.5, 0.75, 1, 1.25, 1.5]) {
      await tick(video, time);
      const current = playhead().style.transform;
      expect(current).not.toBe(previous);
      previous = current;
    }
    expect(integration.editorRender).not.toHaveBeenCalled();
    expect(integration.inspectorRender).not.toHaveBeenCalled();
    expect(integration.laneRender).not.toHaveBeenCalled();
  } finally {
    await fixture.cleanup();
    integration.useSilentMediaFixture = false;
  }
});

it('preserves an inside playhead when opening properties and seeks to the start only from outside', async () => {
  const scrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
  const fixture = createEditorFixture(integration, {
    history: [
      {
        id: 'speed-operation',
        at: 1,
        target: 'edit',
        before: null,
        after: {
          id: 'selected-speed',
          kind: 'speed',
          start: 1,
          end: 3,
          requestedStart: 1,
          requestedEnd: 3,
          rate: 2,
          audio: 'speed',
        },
      },
    ],
  });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    const video = fixture.host.querySelector('video')!;
    const seek = async (time: number) => {
      const ruler = fixture.host.querySelector<HTMLElement>(
        '[data-ui="gallery.videoReview.ruler"]'
      )!;
      vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 28));
      Object.assign(ruler, {
        setPointerCapture: vi.fn(),
        hasPointerCapture: () => true,
        releasePointerCapture: vi.fn(),
      });
      const clientX = (time / Number(ruler.getAttribute('aria-valuemax'))) * 400;
      for (const type of ['pointerdown', 'pointerup']) {
        await act(async () =>
          ruler.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX }))
        );
      }
      expect(video.currentTime).toBe(time);
    };
    for (const [time, expected] of [
      [2, 2],
      [0.5, 1],
      [3, 1],
    ]) {
      await seek(time!);
      await act(async () =>
        fixture.host
          .querySelector<HTMLButtonElement>(
            '[data-review-header-track="source"] [data-review-track-select]'
          )!
          .click()
      );
      await act(async () =>
        [...fixture.host.querySelectorAll<HTMLButtonElement>('.review-track-items-open')]
          .at(-1)!
          .click()
      );
      expect(video.currentTime).toBe(expected);
      expect(
        fixture.host.querySelector(
          'aside [role="group"][aria-label="gallery.videoReview.speedRate"]'
        )
      ).not.toBeNull();
    }
    await seek(2);
    await act(async () =>
      fixture.host
        .querySelector<HTMLButtonElement>('[data-selection-slot="interval"] button')!
        .click()
    );
    expect(video.currentTime).toBe(1);
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.playbackRangeOverlay"]')
    ).not.toBeNull();
  } finally {
    await fixture.cleanup();
    Element.prototype.scrollIntoView = scrollIntoView;
  }
});

it('deletes the unified selection: cut stays when audio is selected, undo restores it', async () => {
  const fixture = createEditorFixture(integration, { inspectorWidth: 0 });
  const { host, root, click, back } = fixture;
  const musicFile = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
  const dragEvent = (type: string) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 250 });
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [musicFile], types: ['Files'] },
    });
    return event;
  };
  const cutCount = () =>
    fixture.snapshot.workspace.history.filter(
      (op) => op.target === 'edit' && op.after !== null && op.after.kind === 'cut'
    ).length;
  const musicCount = () => {
    const { history, cursor } = fixture.snapshot.workspace;
    const op = history
      .slice(0, cursor)
      .filter((item) => item.target === 'advancedContent')
      .at(-1) as { after: { audio: { music: unknown[] } } } | undefined;
    return op?.after.audio.music.length ?? 0;
  };
  integration.index.mockResolvedValue({
    duration: 4,
    boundaries: [0, 1, 2, 3, 4],
    videoCodec: 'vp8',
    audioCodec: null,
    container: 'webm',
    rotation: 0,
  });
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    await click('advancedEditing');
    await click('cutMode');
    await dragRange(host);
    expect(cutCount()).toBe(1);
    const music = host.querySelector('[data-audio-lane="music"]')!;
    await act(async () => {
      music.dispatchEvent(dragEvent('dragenter'));
      music.dispatchEvent(dragEvent('drop'));
      await vi.waitFor(() => expect(musicCount()).toBe(1));
    });
    expect(musicCount()).toBe(1);
    const clip = host.querySelector<HTMLElement>('[aria-label^="gallery.videoReview.audioMusic"]')!;
    Object.assign(clip, { setPointerCapture: vi.fn() });
    await act(async () =>
      clip.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, button: 0 }))
    );
    await act(async () => fixture.key(new KeyboardEvent('keydown', { key: 'Delete' })));
    await act(async () => {
      await vi.waitFor(() => expect([musicCount(), cutCount()]).toEqual([0, 1]), {
        timeout: 2_500,
      });
    });
    await click('undo');
    expect([musicCount(), cutCount()]).toEqual([1, 1]);
    await click('redo');
    expect([musicCount(), cutCount()]).toEqual([0, 1]);
  } finally {
    await fixture.cleanup();
  }
});

it('selects captured actions without creating notes and clears the selection on empty timeline', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    await vi.waitFor(() => expect(fixture.snapshot.workspace.history).toHaveLength(1));
    await act(async () =>
      fixture.host
        .querySelector<HTMLButtonElement>(
          '[data-review-header-track="mouse"] [data-review-track-select]'
        )!
        .click()
    );
    const action = Array.from(
      fixture.host.querySelectorAll<HTMLButtonElement>('.review-history-row button')
    ).find((button) => button.textContent?.includes('gallery.videoReview.eventScroll'))!;
    expect(action).not.toBeNull();
    await act(async () => action.click());
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.actionProperties"]')
    ).not.toBeNull();
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.actionProperties"]')
    ).not.toBeNull();
    expect(fixture.snapshot.draft).toBeNull();
    expect(integration.draft).not.toHaveBeenCalled();
    await act(async () => fixture.key(new KeyboardEvent('keydown', { key: 'Delete' })));
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.actionProperties"]')
    ).not.toBeNull();
    expect(fixture.snapshot.workspace.history).toHaveLength(1);
    const plane = fixture.host.querySelector<HTMLElement>(
      '[data-ui="gallery.videoReview.timePlane"]'
    )!;
    Object.assign(plane, { setPointerCapture: vi.fn(), hasPointerCapture: () => false });
    await act(async () =>
      fixture.host
        .querySelector('[data-ui="gallery.videoReview.sourceLane"]')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300, button: 0 }))
    );
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.actionProperties"]')
    ).toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

it('preserves a selected speed range when toolbar preferences and tools change', async () => {
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
    await fixture.selectRulerRange(1, 2);
    await fixture.click('speedMode');
    const speedOptions = fixture.host.querySelector<HTMLElement>(
      'aside [role="group"][aria-label="gallery.videoReview.speedRate"]'
    )!;
    expect(speedOptions).not.toBeNull();
    const selectedRate = speedOptions.querySelector('[aria-pressed="true"]')?.textContent;
    expect(selectedRate).toBe('2×');
    const historyLength = fixture.snapshot.workspace.history.length;
    expect(
      fixture.host.querySelector(
        '[data-ui="gallery.videoReview.editingTools"] [aria-label="gallery.videoReview.removeEdit"]'
      )
    ).toBeNull();
    expect(fixture.button('speedMode').getAttribute('aria-pressed')).toBe('false');
    const speed = fixture.snapshot.workspace.history.at(-1);
    const magnet = fixture.host.querySelector<HTMLButtonElement>(
      '[data-ui="gallery.videoReview.annotationMagnetToggle"]'
    )!;
    const liveSeek = fixture.host.querySelector<HTMLButtonElement>(
      '[data-ui="gallery.videoReview.liveSeekToggle"]'
    )!;
    await act(async () => magnet.click());
    await act(async () => liveSeek.click());
    expect(fixture.snapshot.workspace.history).toHaveLength(historyLength);
    expect(speedOptions.isConnected).toBe(true);
    expect(speedOptions.querySelector('[aria-pressed="true"]')?.textContent).toBe(selectedRate);
    await fixture.addFocus(2, 3);
    expect(fixture.snapshot.workspace.history).toHaveLength(historyLength + 1);
    expect(fixture.snapshot.workspace.history[historyLength - 1]).toEqual(speed);
    expect(speedOptions.isConnected).toBe(false);
    expect(fixture.button('zoomRegionLabel').getAttribute('aria-pressed')).toBe('false');
  } finally {
    await fixture.cleanup();
  }
});

it('resizes a selected speed range on the timeline through the same reversible history', async () => {
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
    await fixture.selectRulerRange(1, 2);
    await fixture.click('speedMode');
    const speedOptions = fixture.host.querySelector<HTMLElement>(
      'aside [role="group"][aria-label="gallery.videoReview.speedRate"]'
    )!;
    expect(speedOptions).not.toBeNull();
    const selectedRate = speedOptions.querySelector('[aria-pressed="true"]')?.textContent;
    expect(selectedRate).toBe('2×');
    const historyLength = fixture.snapshot.workspace.history.length;
    const block = fixture.host.querySelector<HTMLElement>(
      '[data-ui="gallery.videoReview.editBlock"]'
    )!;
    const endHandle = block.querySelector<HTMLElement>('[data-edge="end"]')!;
    const duration = Number(
      fixture.host
        .querySelector('[data-ui="gallery.videoReview.ruler"]')!
        .getAttribute('aria-valuemax')
    );
    vi.spyOn(block.parentElement!, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 400, 48)
    );
    Object.assign(block, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
    for (const [type, time] of [
      ['pointerdown', 2],
      ['pointermove', 2.5],
      ['pointerup', 2.5],
    ] as const) {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX: (time / duration) * 400,
        button: 0,
        altKey: true,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      await act(async () => (type === 'pointerdown' ? endHandle : block).dispatchEvent(event));
    }
    expect(fixture.snapshot.workspace.history).toHaveLength(historyLength + 1);
    const operation = fixture.snapshot.workspace.history.at(-1);
    expect(operation).toMatchObject({
      target: 'edit',
      before: { kind: 'speed', start: 1, end: 2, rate: 2 },
      after: { kind: 'speed', start: 1, end: 2.5, rate: 2 },
    });
    expect(fixture.button('cutMode').getAttribute('aria-pressed')).toBe('false');
    const remove = fixture.host.querySelector<HTMLButtonElement>(
      'aside button[aria-label="gallery.videoReview.deleteSelected"]'
    )!;
    expect(remove.className).toContain('!w-full');
    expect(remove.closest('[data-section="actions"]')).not.toBeNull();
    await act(async () => remove.click());
    expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({
      target: 'edit',
      after: null,
    });
    expect(
      fixture.host.querySelector('aside [role="group"][aria-label="gallery.videoReview.speedRate"]')
    ).toBeNull();
    expect(fixture.host.querySelectorAll('[data-ui="gallery.videoReview.editBlock"]')).toHaveLength(
      0
    );
    await fixture.click('undo');
    expect(fixture.host.querySelectorAll('[data-ui="gallery.videoReview.editBlock"]')).toHaveLength(
      1
    );
    expect(committedEditorFixtureProjection(fixture.snapshot).document.edits).toEqual([
      expect.objectContaining({ kind: 'speed', start: 1, end: 2.5, rate: 2 }),
    ]);
    await fixture.click('undo');
    expect(committedEditorFixtureProjection(fixture.snapshot).document.edits).toEqual([
      expect.objectContaining({ kind: 'speed', start: 1, end: 2, rate: 2 }),
    ]);
    await fixture.click('redo');
    expect(committedEditorFixtureProjection(fixture.snapshot).document.edits).toEqual([
      expect.objectContaining({ kind: 'speed', start: 1, end: 2.5, rate: 2 }),
    ]);
    await fixture.click('redo');
    expect(fixture.host.querySelectorAll('[data-ui="gallery.videoReview.editBlock"]')).toHaveLength(
      0
    );
  } finally {
    await fixture.cleanup();
  }
});

it('deletes a selected cut from the inspector and restores it through history', async () => {
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
    await fixture.selectRulerRange(1, 2);
    await fixture.click('cutMode');
    expect(fixture.host.querySelectorAll('[data-ui="gallery.videoReview.editBlock"]')).toHaveLength(
      1
    );
    const remove = fixture.host.querySelector<HTMLButtonElement>(
      'aside button[aria-label="gallery.videoReview.deleteSelected"]'
    )!;
    expect(remove.textContent).toContain('gallery.videoReview.deleteSelected');
    await act(async () => remove.click());
    expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({
      target: 'edit',
      before: { kind: 'cut' },
      after: null,
    });
    expect(fixture.host.querySelectorAll('[data-ui="gallery.videoReview.editBlock"]')).toHaveLength(
      0
    );
    expect(
      fixture.host.querySelector('aside [aria-label="gallery.videoReview.deleteSelected"]')
    ).toBeNull();
    await fixture.click('undo');
    expect(fixture.host.querySelectorAll('[data-ui="gallery.videoReview.editBlock"]')).toHaveLength(
      1
    );
    await fixture.click('redo');
    expect(fixture.host.querySelectorAll('[data-ui="gallery.videoReview.editBlock"]')).toHaveLength(
      0
    );
  } finally {
    await fixture.cleanup();
  }
});

it('keeps a newly saved note selected and visible after leaving another inspector section', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    await fixture.click('comments');
    await fixture.click('addComment');
    const field = fixture.host.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        field,
        'Keep this note visible'
      );
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await fixture.click('save');
    expect(fixture.host.querySelector('.review-inspector-list')?.textContent).toContain(
      'Keep this note visible'
    );
    await fixture.click('editComment');
    expect(fixture.host.querySelector('.review-inspector-list li textarea')?.textContent).toBe(
      'Keep this note visible'
    );
    expect(
      fixture.host.querySelectorAll('[data-ui="gallery.videoReview.commentComposer"]')
    ).toHaveLength(1);
    await fixture.click('discard');
    expect(fixture.host.querySelector('textarea')).toBeNull();
    expect(fixture.host.querySelector('.review-inspector-list')?.textContent).toContain(
      'Keep this note visible'
    );
    expect(fixture.host.querySelector('aside [aria-label="gallery.videoReview.undo"]')).toBeNull();
    expect(
      fixture.host.querySelector(
        '[data-ui="gallery.videoReview.toolbar"] [aria-label="gallery.videoReview.undo"]'
      )
    ).not.toBeNull();
    expect(fixture.host.querySelector('.review-inspector-list li')?.className).toContain(
      'border-[var(--sniptale-color-accent)]'
    );
  } finally {
    await fixture.cleanup();
  }
});

it('closes the preview only after saving the note and preserves it when saving fails', async () => {
  const fixture = createEditorFixture(integration);
  const onClose = vi.fn();
  try {
    await act(async () =>
      fixture.root.render(
        <VideoReview aggregateId="recording:r" onBack={fixture.back} onClose={onClose} />
      )
    );
    await fixture.click('addComment');
    await fixture.fill('Keep this note');
    const publish = fixture.publication.getMockImplementation()!;
    let refusedNote = false;
    fixture.publication.mockImplementation(async (request) => {
      const last = parseVideoWorkspace(request.workspace)?.history.at(-1);
      if (!refusedNote && last?.target === 'annotation' && last.after?.text === 'Keep this note') {
        refusedNote = true;
        throw new Error('Write failed');
      }
      return publish(request);
    });
    const close = fixture.host.querySelector<HTMLButtonElement>(
      'header [aria-label="common.actions.close"]'
    )!;
    expect(close).not.toBeNull();
    expect(fixture.host.querySelector('header [aria-label="gallery.videoReview.back"]')).toBeNull();
    await act(async () => close.click());
    expect(refusedNote).toBe(true);
    expect(fixture.back).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(fixture.host.querySelector('textarea')?.value).toBe('Keep this note');
    await act(async () => close.click());
    expect(fixture.back).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(fixture.persistedSnapshot.draft).toBeNull();
    expect(fixture.persistedSnapshot.workspace.history.at(-1)).toMatchObject({
      target: 'annotation',
      after: { text: 'Keep this note' },
    });
  } finally {
    await fixture.cleanup();
  }
});

it('creates edits from recorded actions, selects their properties and recalculates eligibility', async () => {
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
    const selectAction = async () => {
      await act(async () =>
        fixture.host
          .querySelector<HTMLButtonElement>(
            '[data-review-header-track="mouse"] [data-review-track-select]'
          )!
          .click()
      );
      const action = Array.from(
        fixture.host.querySelectorAll<HTMLButtonElement>('.review-history-row button')
      ).find((button) => button.textContent?.includes('gallery.videoReview.eventScroll'))!;
      await act(async () => action.click());
    };
    await selectAction();
    await fixture.click('actionFocus');
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')
    ).not.toBeNull();
    await selectAction();
    expect(fixture.button('actionFocus').disabled).toBe(true);
    expect(fixture.button('actionSpeed').disabled).toBe(false);
    await fixture.click('actionSpeed');
    expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({
      target: 'edit',
      after: { kind: 'speed', start: 2, end: 3 },
    });
    expect(
      fixture.host.querySelector('aside [role="group"][aria-label="gallery.videoReview.speedRate"]')
    ).not.toBeNull();
    await selectAction();
    expect(fixture.button('actionSpeed').disabled).toBe(true);
    expect(fixture.button('actionCut').disabled).toBe(false);
    await fixture.click('undo');
    await selectAction();
    await fixture.click('actionCut');
    expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({
      target: 'edit',
      after: { kind: 'cut', start: 2, end: 3 },
    });
    await selectAction();
    const properties = fixture.host.querySelector(
      '[data-ui="gallery.videoReview.actionProperties"]'
    )!;
    const commands = fixture.host.querySelector(
      '[data-ui="gallery.videoReview.inspectorActionMenu"]'
    )!;
    expect(properties.querySelector('[role="status"]')?.textContent).toContain(
      'gallery.videoReview.actionRemoved'
    );
    expect(commands.textContent).not.toContain('gallery.videoReview.actionRemoved');
    for (const key of ['actionCut', 'actionSpeed', 'actionFocus', 'createCopy'])
      expect(commands.querySelector(`[aria-label="gallery.videoReview.${key}"]`)).toBeNull();
    expect(properties.querySelector('[aria-label="common.actions.delete"]')).toBeNull();
    expect(
      properties.querySelector('[data-ui="gallery.videoReview.interactionProperties"]')
    ).not.toBeNull();
    expect(fixture.snapshot.draft).toBeNull();
  } finally {
    await fixture.cleanup();
  }
}, 30000);

it('adds a note from the primary toolbar group and focuses the notes composer', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    await fixture.addFocus();
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')
    ).not.toBeNull();
    expect(
      fixture.host.querySelector(
        '[data-ui="gallery.videoReview.timelineToolbar"] [aria-label="gallery.videoReview.pointerTool"]'
      )
    ).toBeNull();
    expect(
      fixture.host.querySelector(
        '[data-ui="gallery.videoReview.primaryTools"] [aria-label="gallery.videoReview.addComment"]'
      )
    ).toBeNull();
    await fixture.click('addComment');
    const field = fixture.host.querySelector('textarea');
    expect(field).not.toBeNull();
    expect(document.activeElement).toBe(field);
    expect(fixture.host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')).toBeNull();
    expect(
      fixture.host.querySelectorAll('[data-ui="gallery.videoReview.commentComposer"]')
    ).toHaveLength(1);
  } finally {
    await fixture.cleanup();
  }
}, 30000);

vi.mock('../../workflows/sync-transfer/editing-admission', () => ({
  ensureNativeEditingRootAvailable: vi.fn(async () => undefined),
}));

it('copies, mutes and deletes a multi-selection through the existing command history', async () => {
  const { createQuickEditAdvancedContent } =
    await import('../../features/video/review/advanced/defaults');
  const { createQuickEditAudioClip } = await import('../../features/video/review/advanced/audio');
  const content = createQuickEditAdvancedContent();
  content.audio.music = ['a', 'b'].map((id, index) =>
    createQuickEditAudioClip({
      id,
      assetId: `asset:${id}`,
      timelineStart: index * 1.5,
      duration: 1,
      endMax: 4,
    })
  );
  const fixture = createEditorFixture(integration, {
    history: [
      {
        id: 'seed',
        at: 0,
        target: 'advancedContent',
        before: createQuickEditAdvancedContent(),
        after: content,
      },
    ],
  });
  const music = () =>
    fixture.host.querySelectorAll<HTMLElement>('[data-review-removal-key^="audio:"]');
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    expect(music()).toHaveLength(2);
    const [a, b] = [...music()];
    for (const item of [a!, b!])
      Object.assign(item, {
        setPointerCapture: vi.fn(),
        hasPointerCapture: () => false,
        getClientRects: () => [new DOMRect(0, 0, 100, 30)],
      });
    for (const item of [a!, b!])
      await act(async () =>
        item.dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true })
        )
      );
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.timelineBatchInspector"]')
    ).not.toBeNull();
    await fixture.click('timelineSelectionClone');
    expect(music()).toHaveLength(4);
    await fixture.click('timelineSelectionMute');
    const afterMute = fixture.snapshot.workspace.history.at(-1)!;
    expect(afterMute.target).toBe('advancedContent');
    if (afterMute.target === 'advancedContent')
      expect(
        afterMute.after.audio.music.filter((clip) => clip.muted).map((clip) => clip.id)
      ).toEqual(['a', 'b']);
    // Removing the final member clears the current object selection as well as the group.
    for (const item of [b!, a!])
      await act(async () =>
        item.dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true })
        )
      );
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.timelineBatchInspector"]')
    ).toBeNull();
    for (const item of [a!, b!])
      await act(async () =>
        item.dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true })
        )
      );
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.timelineBatchInspector"]')
    ).not.toBeNull();
    await fixture.click('timelineSelectionDelete');
    expect(music()).toHaveLength(2);
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.timelineBatchInspector"]')
    ).toBeNull();
    await fixture.click('undo');
    expect(music()).toHaveLength(4);
  } finally {
    await fixture.cleanup();
  }
});

it.each(['keyboard', 'mouse'] as const)(
  'adds, copies and deletes an authored %s press with separate Undo steps',
  async (family) => {
    vi.useFakeTimers();
    const fixture = createEditorFixture(integration);
    const inspector = () =>
      fixture.host.querySelector('[data-ui="gallery.videoReview.inspector"]')!;
    const action = (label: string) =>
      inspector().querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    const plates = () =>
      [
        ...fixture.host.querySelectorAll<HTMLElement>(
          `[data-review-track="${family}"] [data-review-action-key]`
        ),
      ].filter((plate) => plate.dataset['reviewActionKey'] !== 'telemetry:action:mouse-press');
    try {
      await act(async () =>
        fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
      );
      await fixture.click('advancedEditing');
      await act(async () =>
        fixture.host
          .querySelector<HTMLButtonElement>(
            `[data-review-header-track="${family}"] [data-review-track-select]`
          )!
          .click()
      );
      await fixture.click(family === 'keyboard' ? 'addKeyPress' : 'addMousePress');
      if (family === 'keyboard')
        await act(async () =>
          document.querySelector<HTMLButtonElement>('[role="option"]')!.click()
        );
      expect(plates()).toHaveLength(1);
      expect(
        inspector().querySelector('[data-ui="gallery.videoReview.interactionProperties"]')
      ).not.toBeNull();
      const first = plates()[0]!.dataset['reviewActionKey'];
      await act(async () => action('gallery.videoReview.createCopy').click());
      expect(plates()).toHaveLength(2);
      expect(new Set(plates().map((plate) => plate.dataset['reviewActionKey'])).size).toBe(2);
      await act(async () => vi.advanceTimersByTimeAsync(5000));
      await fixture.click('undo');
      expect(plates()).toHaveLength(1);
      expect(plates()[0]!.dataset['reviewActionKey']).toBe(first);
      await fixture.click('redo');
      expect(plates()).toHaveLength(2);
      const copied = plates().find((plate) => plate.dataset['reviewActionKey'] !== first)!;
      await act(async () => copied.click());
      await act(async () => action('common.actions.delete').click());
      expect(plates()).toHaveLength(1);
      expect(plates()[0]!.dataset['reviewActionKey']).toBe(first);
      await act(async () => vi.advanceTimersByTimeAsync(5000));
      await fixture.click('undo');
      expect(plates()).toHaveLength(2);
      const content = committedEditorFixtureProjection(fixture.snapshot).document.advancedContent;
      expect(content.interactionTimeline?.presses).toHaveLength(2);
      expect(content.interactionTimeline?.presses.every((press) => press.family === family)).toBe(
        true
      );
    } finally {
      await fixture.cleanup();
      vi.useRealTimers();
    }
  }
);
