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
      (type === 'pointerdown' && options.lane
        ? host.querySelector(`[data-ui="gallery.videoReview.${options.lane}"]`)!
        : plane
      ).dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }))
    );
}

it('deletes the unified selection: cut stays when audio is selected, undo restores it', async () => {
  const fixture = createEditorFixture(integration);
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
    await act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(cutCount()).toBe(1);
    const music = host.querySelector('[data-audio-lane="music"]')!;
    music.dispatchEvent(dragEvent('dragenter'));
    music.dispatchEvent(dragEvent('drop'));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(musicCount()).toBe(1);
    const clip = host.querySelector<HTMLElement>('[aria-label^="gallery.videoReview.audioMusic"]')!;
    Object.assign(clip, { setPointerCapture: vi.fn() });
    await act(async () =>
      clip.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, button: 0 }))
    );
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
    expect([musicCount(), cutCount()]).toEqual([0, 1]);
    await click('undo');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
    expect([musicCount(), cutCount()]).toEqual([1, 1]);
    await click('redo');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
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
    const action = fixture.host.querySelector<HTMLButtonElement>(
      '[aria-label^="gallery.videoReview.telemetry ·"]'
    )!;
    expect(action).not.toBeNull();
    await act(async () => action.click());
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.actionProperties"]')
    ).not.toBeNull();
    expect(action.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.snapshot.draft).toBeNull();
    expect(integration.draft).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })));
    expect(action.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.snapshot.workspace.history).toHaveLength(1);
    const plane = fixture.host.querySelector<HTMLElement>(
      '[data-ui="gallery.videoReview.timePlane"]'
    )!;
    Object.assign(plane, { setPointerCapture: vi.fn(), hasPointerCapture: () => false });
    await act(async () =>
      plane.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300, button: 0 }))
    );
    expect(action.getAttribute('aria-pressed')).toBe('false');
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.actionProperties"]')
    ).toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

it('edits a selected speed range from its inspector through the same reversible history', async () => {
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
    await fixture.click('speedMode');
    await dragRange(fixture.host);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
    const input = fixture.host.querySelector<HTMLInputElement>(
      'aside input[aria-label="gallery.videoReview.rangeEnd"]'
    )!;
    expect(input).not.toBeNull();
    const historyLength = fixture.snapshot.workspace.history.length;
    await act(async () => input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2.5');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(fixture.snapshot.workspace.history).toHaveLength(historyLength + 1);
    const operation = fixture.snapshot.workspace.history.at(-1);
    expect(operation).toMatchObject({
      target: 'edit',
      after: { kind: 'speed', start: 1, end: 2.5 },
    });
    const remove = fixture.host.querySelector<HTMLButtonElement>(
      'aside button[aria-label="gallery.videoReview.removeEdit"]'
    )!;
    await act(async () => remove.click());
    expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({
      target: 'edit',
      after: null,
    });
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
    await act(async () =>
      [...fixture.host.querySelectorAll<HTMLButtonElement>('aside button')]
        .find((button) => button.textContent === 'gallery.videoReview.comments')!
        .click()
    );
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
    expect(fixture.host.querySelector('ol')?.textContent).toContain('Keep this note visible');
    await fixture.click('editComment');
    expect(fixture.host.querySelector('ol li textarea')?.textContent).toBe(
      'Keep this note visible'
    );
    expect(
      fixture.host.querySelectorAll('[data-ui="gallery.videoReview.commentComposer"]')
    ).toHaveLength(1);
    await fixture.click('discard');
    expect(fixture.host.querySelector('textarea')).toBeNull();
    expect(fixture.host.querySelector('ol')?.textContent).toContain('Keep this note visible');
    expect(fixture.host.querySelector('aside [aria-label="gallery.videoReview.undo"]')).toBeNull();
    expect(
      fixture.host.querySelector(
        '[data-ui="gallery.videoReview.toolbar"] [aria-label="gallery.videoReview.undo"]'
      )
    ).not.toBeNull();
    expect(fixture.host.querySelector('ol li')?.className).toContain(
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
    integration.draft.mockRejectedValueOnce(new Error('Write failed'));
    const close = fixture.host.querySelector<HTMLButtonElement>(
      'header [aria-label="common.actions.close"]'
    )!;
    expect(close).not.toBeNull();
    expect(fixture.button('back').closest('header')).not.toBeNull();
    await act(async () => close.click());
    expect(onClose).not.toHaveBeenCalled();
    expect(fixture.host.querySelector('textarea')?.value).toBe('Keep this note');
    await act(async () => close.click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(fixture.back).not.toHaveBeenCalled();
    expect(fixture.snapshot.draft?.annotation.text).toBe('Keep this note');
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
      const action = fixture.host.querySelector<HTMLButtonElement>(
        '[aria-label^="gallery.videoReview.telemetry ·"]'
      )!;
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
      fixture.host.querySelector('aside input[aria-label="gallery.videoReview.rangeEnd"]')
    ).not.toBeNull();
    await selectAction();
    expect(fixture.button('actionSpeed').disabled).toBe(true);
    expect(fixture.button('actionCut').disabled).toBe(true);
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
    expect(properties.textContent).toContain('gallery.videoReview.actionRemoved');
    expect(properties.querySelectorAll('button')).toHaveLength(0);
    expect(fixture.snapshot.draft).toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

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
    expect(fixture.host.textContent).toContain('gallery.videoReview.muteAudioRange');
    expect(fixture.host.querySelectorAll('[data-audio-edge]')).toHaveLength(2);
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC' }))
    );
    expect(fixture.host.querySelector('[data-ui="gallery.videoReview.cutRegion"]')).toBeNull();
    expect(fixture.button('cutMode').getAttribute('aria-pressed')).toBe('false');
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
    expect(fixture.button('focusRangeTool').disabled).toBe(true);
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

it('adds a note from the centered toolbar group and focuses the notes composer', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    await fixture.click('zoomAdd');
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')
    ).not.toBeNull();
    const group = fixture.host.querySelector('[data-ui="gallery.videoReview.noteHistoryTools"]')!;
    const buttons = group.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[0]?.getAttribute('aria-label')).toBe('gallery.videoReview.addComment');
    expect(buttons[1]?.getAttribute('aria-label')).toBe('gallery.videoReview.undo');
    await act(async () => buttons[0]!.click());
    const field = fixture.host.querySelector('textarea');
    expect(field).not.toBeNull();
    expect(document.activeElement).toBe(field);
    expect(fixture.host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')).toBeNull();
    expect(buttons[0]!.disabled).toBe(true);
    expect(
      fixture.host.querySelectorAll('[data-ui="gallery.videoReview.commentComposer"]')
    ).toHaveLength(1);
  } finally {
    await fixture.cleanup();
  }
});
