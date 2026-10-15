// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

// These integration fixtures contain synthetic bytes, not a decodable media stream.
vi.mock('./use-zoom-preview-source', async (original) => ({
  ...(await original<typeof import('./use-zoom-preview-source')>()),
  useZoomPreviewSource: () => null,
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
    args: Parameters<
      typeof import('../../composition/persistence/review-workspaces/store').commitVideoWorkspaceWithProjection
    >[0]
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
  importedAudioClip: (
    assetId: string,
    duration: number,
    atTime: number,
    timelineDuration: number
  ) => ({
    id: `audio-${assetId}`,
    assetId,
    timelineStart: Math.max(0, Math.min(atTime, Math.max(0, timelineDuration - 0.2))),
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
import { VideoReview } from './index';
import {
  createEditorFixture,
  committedEditorFixtureProjection,
} from './editor-fixture.test-support';

it('saves a new note before editing an existing one and preserves the chosen edit', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('addComment');
    await fixture.fill('Existing note');
    await fixture.click('save');
    await fixture.click('addComment');
    await fixture.fill('New note');
    await fixture.click('editComment');
    expect(fixture.snapshot.workspace.history).toHaveLength(2);
    expect(fixture.host.querySelector('textarea')?.value).toBe('Existing note');
    await fixture.fill('Changed existing');
    await fixture.click('save');
    expect(fixture.snapshot.workspace.history).toHaveLength(3);
    expect(fixture.host.textContent).toContain('New note');
    expect(fixture.host.textContent).toContain('Changed existing');
  } finally {
    await fixture.cleanup();
  }
});

it('retains a new note when native ended arrives after the previous End command', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('addComment');
    await fixture.fill('Before End');
    await act(async () => {
      const plane = fixture.host.querySelector<HTMLElement>(
        '[data-ui="gallery.videoReview.timePlane"]'
      )!;
      plane.focus();
      plane.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', code: 'End', bubbles: true }));
    });
    expect(fixture.host.querySelector('textarea')).toBeNull();
    await fixture.click('addComment');
    const field = fixture.host.querySelector('textarea');
    expect(field).not.toBeNull();
    await act(async () => {
      const video = fixture.host.querySelector('video');
      expect(video).not.toBeNull();
      video!.dispatchEvent(new Event('ended', { bubbles: true }));
    });
    expect(fixture.host.querySelector('textarea')).toBe(field);
    expect(field?.disabled).toBe(false);
    await fixture.fill('After End');
    await fixture.click('save');
    expect(
      fixture.snapshot.workspace.history.filter(
        (operation) => operation.target === 'annotation' && operation.after?.text === 'After End'
      )
    ).toHaveLength(1);
  } finally {
    await fixture.cleanup();
  }
});

it('keeps the note field focused while drawing its region', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('addComment');
    await fixture.fill('Region note');
    const field = fixture.host.querySelector('textarea');
    const stage = fixture.host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.stage"]')!;
    Object.assign(stage, {
      getBoundingClientRect: () => new DOMRect(0, 0, 640, 360),
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
    for (const [type, x, y] of [
      ['pointerdown', 160, 90],
      ['pointermove', 480, 270],
      ['pointerup', 480, 270],
    ] as const) {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      await act(async () => {
        stage.dispatchEvent(event);
        // Native mouse focus moves to the enclosing dialog unless pointerdown prevents it.
        if (type === 'pointerdown' && !event.defaultPrevented)
          fixture.host.querySelector('dialog')!.focus();
      });
    }
    expect(fixture.host.querySelector('textarea')).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(fixture.host.querySelector('[data-region-corner="se"]')).not.toBeNull();
    await fixture.click('save');
    expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({
      target: 'annotation',
      after: { text: 'Region note', region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } },
    });
  } finally {
    await fixture.cleanup();
  }
});

it('restores a deleted note with keyboard Undo after its focused action disappears', async () => {
  const fixture = createEditorFixture(integration);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('addComment');
    await fixture.fill('Restore this note');
    await fixture.click('save');
    await act(async () => {
      fixture.host.querySelector<HTMLButtonElement>('.review-inspector-list > li button')!.click();
    });
    const remove = fixture.host.querySelector<HTMLButtonElement>('[data-note-delete]')!;
    expect(remove).not.toBeNull();
    const commit = integration.commit.getMockImplementation()!;
    integration.commit.mockImplementationOnce(async (...args) => {
      await gate;
      return commit(...args);
    });
    await act(async () => {
      remove.focus();
      remove.click();
    });
    expect(remove.disabled).toBe(true);
    // Native disabling removes focus before the accepted delete commits.
    if (document.activeElement === remove) {
      document.body.tabIndex = -1;
      document.body.focus();
      document.body.removeAttribute('tabindex');
    }
    await act(async () => release());
    expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({
      target: 'annotation',
      after: null,
    });
    expect(fixture.host.querySelector('.review-inspector-list')?.textContent).not.toContain(
      'Restore this note'
    );
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          code: 'KeyZ',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(fixture.snapshot.workspace.cursor).toBe(1);
    expect(fixture.host.querySelector('.review-inspector-list')?.textContent).toContain(
      'Restore this note'
    );
  } finally {
    release();
    await fixture.cleanup();
  }
});

it('retains failed new-note text and blocks Back until retry succeeds', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('addComment');
    await fixture.fill('Keep on failure');
    integration.commit.mockRejectedValueOnce(new Error('Quota'));
    await fixture.click('common.actions.close');
    expect(fixture.back).not.toHaveBeenCalled();
    expect(fixture.host.querySelector('textarea')?.value).toBe('Keep on failure');
    expect(fixture.host.textContent).toContain('gallery.videoReview.saveFailed');
    await fixture.click('common.actions.close');
    expect(fixture.back).toHaveBeenCalledOnce();
    expect(fixture.snapshot.workspace.history).toHaveLength(1);
  } finally {
    await fixture.cleanup();
  }
});

it('saves before Home, a tool shortcut and history while existing edits stay explicit', async () => {
  const fixture = createEditorFixture(integration);
  const key = async (key: string, code = key, ctrlKey = false) =>
    act(async () => {
      const plane = fixture.host.querySelector<HTMLElement>(
        '[data-ui="gallery.videoReview.timePlane"]'
      )!;
      plane.focus();
      plane.dispatchEvent(new KeyboardEvent('keydown', { key, code, ctrlKey, bubbles: true }));
    });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('addComment');
    await fixture.fill('Before Home');
    await key('Home');
    expect(fixture.host.querySelector('textarea')).toBeNull();
    expect(fixture.snapshot.workspace.history).toHaveLength(1);
    await fixture.click('addComment');
    await fixture.fill('Before pointer');
    await key('v', 'KeyV');
    expect(fixture.snapshot.workspace.history).toHaveLength(2);
    await fixture.click('addComment');
    await fixture.fill('Before undo');
    await key('z', 'KeyZ', true);
    expect(fixture.snapshot.workspace.history).toHaveLength(3);
    expect(fixture.snapshot.workspace.cursor).toBe(2);
    await fixture.click('editComment');
    await fixture.fill('Explicit edit');
    await key('v', 'KeyV');
    expect(fixture.host.querySelector('textarea')?.value).toBe('Explicit edit');
    expect(fixture.snapshot.workspace.cursor).toBe(2);
    await fixture.click('discard');
  } finally {
    await fixture.cleanup();
  }
});

it('keeps Scene and Export after the accompanying draft context reset', async () => {
  const fixture = createEditorFixture(integration);
  const section = async (name: string) =>
    act(async () => {
      const node = Array.from(
        fixture.host.querySelectorAll<HTMLButtonElement>(
          '[data-ui="gallery.videoReview.inspectorNavigation"] button'
        )
      ).find((node) => node.textContent === `gallery.videoReview.${name}`);
      expect(node).toBeDefined();
      node!.click();
    });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    await fixture.click('addComment');
    await fixture.fill('Before Scene');
    await section('scene');
    expect(fixture.host.querySelector('textarea')).toBeNull();
    expect(
      fixture.snapshot.workspace.history.filter((operation) => operation.target === 'annotation')
    ).toHaveLength(1);
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.inspector"]')?.textContent
    ).toContain('gallery.videoReview.canvas');
    await fixture.click('addComment');
    await fixture.fill('Before Export');
    await fixture.click('exportSection');
    expect(
      fixture.snapshot.workspace.history.filter((operation) => operation.target === 'annotation')
    ).toHaveLength(2);
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.exportSection"]')
    ).not.toBeNull();
    await fixture.click('addComment');
    const field = fixture.host.querySelector('textarea');
    expect(field).not.toBeNull();
    expect(document.activeElement).toBe(field);
    await fixture.fill('After Export');
    await act(async () => {
      const plane = fixture.host.querySelector<HTMLElement>(
        '[data-ui="gallery.videoReview.timePlane"]'
      )!;
      plane.focus();
      plane.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', code: 'End', bubbles: true }));
    });
    expect(fixture.host.querySelector('textarea')).toBeNull();
    expect(
      fixture.snapshot.workspace.history.findLast((operation) => operation.target === 'annotation')
    ).toMatchObject({ target: 'annotation', after: { text: 'After Export' } });
  } finally {
    await fixture.cleanup();
  }
});

it.each(['success', 'cancel', 'failure'] as const)(
  'keeps Export available during playback and releases the editor after %s',
  async (outcome) => {
    vi.useFakeTimers();
    const fixture = createEditorFixture(integration);
    // Synthetic media verifies transport controls; native browser proof owns raster painting.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    integration.index.mockResolvedValue({
      duration: 4,
      width: 320,
      height: 180,
      boundaries: [0, 2, 4],
      videoCodec: 'vp8',
      audioCodec: null,
      container: 'webm',
      rotation: 0,
      processedVideoCodec: 'vp9',
    });
    let finish!: () => void;
    integration.export.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          finish = () =>
            outcome === 'success'
              ? resolve({
                  file: new File(['copy'], 'copy.webm'),
                  receipt: { filename: 'copy.webm' },
                })
              : reject(new Error(outcome));
        })
    );
    try {
      await act(async () =>
        fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
      );
      await fixture.click('advancedEditing');
      await fixture.addFocus();
      await act(async () => vi.advanceTimersByTimeAsync(300));
      await fixture.click('exportSection');
      await fixture.click('play');
      expect(fixture.button('exportVideo').disabled).toBe(false);
      await fixture.click('exportVideo');
      expect(fixture.button('play').disabled).toBe(true);
      expect(fixture.button('advancedEditing').disabled).toBe(true);
      const calls = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })));
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(calls);
      const revision = fixture.snapshot.workspace.revision;
      await act(async () =>
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true })
        )
      );
      expect(fixture.snapshot.workspace.revision).toBe(revision);
      if (outcome === 'cancel') await fixture.click('cancelExport');
      await act(async () => finish());
      expect(fixture.button('play').disabled).toBe(false);
      expect(fixture.button('advancedEditing').disabled).toBe(false);
      expect(fixture.button('exportVideo').disabled).toBe(false);
      expect(fixture.host.textContent?.includes('gallery.videoReview.exportFailed')).toBe(
        outcome === 'failure'
      );
    } finally {
      finish?.();
      await fixture.cleanup();
      vi.useRealTimers();
    }
  }
);

it.each(['toolbar', 'shortcut'] as const)(
  'anchors %s Notes to the ruler range, then the playhead with action history hidden',
  async (entry) => {
    const fixture = createEditorFixture(integration);
    const add = async (range: boolean) => {
      if (entry === 'toolbar') await fixture.click(range ? 'commentRange' : 'addComment');
      else
        await act(async () =>
          fixture.key(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM' }))
        );
    };
    try {
      await act(async () =>
        fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
      );
      await fixture.click('telemetry');
      await fixture.selectRulerRange(1, 3);
      expect(
        fixture.host.querySelector(
          '[data-ui="gallery.videoReview.inspector"] [aria-label="gallery.videoReview.commentRange"]'
        )
      ).not.toBeNull();
      await add(true);
      await fixture.fill('Ruler note');
      await fixture.click('save');
      expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({
        target: 'annotation',
        after: { anchor: { kind: 'range', start: 1, end: 3 } },
      });
      expect(fixture.host.querySelector('[data-ui="gallery.videoReview.historyTrack"]')).toBeNull();
      const marker = fixture.host.querySelector<HTMLButtonElement>(
        '[data-ui="gallery.videoReview.sourceLane"] button[title="Ruler note"]'
      )!;
      expect(marker).not.toBeNull();
      await act(async () => marker.click());
      await fixture.click('clearPlaybackRange');
      expect(
        fixture.host.querySelector(
          '[data-ui="gallery.videoReview.inspector"] [aria-label="gallery.videoReview.addComment"]'
        )
      ).not.toBeNull();
      await fixture.selectRulerRange(2, 2);
      await add(false);
      await fixture.fill('Playhead note');
      await fixture.click('save');
      expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({
        target: 'annotation',
        after: { anchor: { kind: 'point', time: 2 } },
      });
    } finally {
      await fixture.cleanup();
    }
  }
);

it('retains the requested playhead while admission finishes the previous draft', async () => {
  const fixture = createEditorFixture(integration);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.selectRulerRange(2, 2);
    await fixture.click('addComment');
    await fixture.fill('Previous draft');
    const commit = integration.commit.getMockImplementation()!;
    integration.commit.mockImplementationOnce(async (...args) => {
      await gate;
      return commit(...args);
    });
    await fixture.click('addComment');
    const video = fixture.host.querySelector('video')!;
    await act(async () => {
      video.currentTime = 3;
      video.dispatchEvent(new Event('timeupdate'));
    });
    await act(async () => release());
    await fixture.fill('Captured request');
    await fixture.click('save');
    expect(fixture.snapshot.workspace.history.at(-1)).toMatchObject({
      target: 'annotation',
      after: { text: 'Captured request', anchor: { kind: 'point', time: 2 } },
    });
  } finally {
    release();
    await fixture.cleanup();
  }
});
