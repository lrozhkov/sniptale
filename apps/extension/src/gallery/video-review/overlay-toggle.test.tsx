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

it('hides overlays in the editor without touching their data or export flag', async () => {
  const fixture = createEditorFixture(integration);
  const { host, root, click, back } = fixture;
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    await click('advancedEditing');
    await click('addOverlayComment');
    expect(host.querySelector('[data-ui="gallery.videoReview.canvasComment"]')).not.toBeNull();
    const toggle = () =>
      host.querySelector<HTMLButtonElement>(
        '[aria-label="gallery.videoReview.hideOverlays"], [aria-label="gallery.videoReview.showOverlays"]'
      )!;
    expect(toggle().getAttribute('aria-label')).toBe('gallery.videoReview.hideOverlays');
    await click('hideOverlays');
    expect(host.querySelector('[data-ui="gallery.videoReview.canvasComment"]')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
    const workspace = fixture.snapshot.workspace;
    expect(workspace.advanced.ui.overlaysVisible).toBe(false);
    expect(workspace.history.at(-1)?.target).toBe('canvasComment');
    const comments = workspace.history.filter((op) => op.target === 'canvasComment');
    expect(comments).toHaveLength(1);
    expect((comments[0] as { after: { renderToVideo: boolean } }).after.renderToVideo).toBe(true);
    await click('showOverlays');
    expect(host.querySelector('[data-ui="gallery.videoReview.canvasComment"]')).not.toBeNull();
    await click('advancedEditing');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })));
    expect(
      fixture.snapshot.workspace.history.filter((op) => op.target === 'canvasComment')
    ).toHaveLength(1);
  } finally {
    await fixture.cleanup();
  }
});

it('links a saved annotation to a burned overlay without retyping text', async () => {
  const fixture = createEditorFixture(integration);
  const { host, root, click, back, fill } = fixture;
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    await click('addComment');
    await fill('Bridge me');
    await click('save');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.showOnVideo"]')!
        .click()
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
    const op = fixture.snapshot.workspace.history.at(-1) as {
      target: string;
      after: { annotationId?: string; renderToVideo: boolean };
    };
    expect(op.target).toBe('canvasComment');
    expect(op.after.annotationId).toBeTruthy();
    expect(op.after.renderToVideo).toBe(true);
    expect(
      host.querySelector('[data-ui="gallery.videoReview.canvasCommentBubble"]')!.textContent
    ).toBe('Bridge me');
    await click('undo');
    expect(host.querySelector('[data-ui="gallery.videoReview.canvasComment"]')).toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

it('keeps mode navigation separate from timeline tools and hides advanced content in Basic', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    const mode = fixture.button('advancedEditing');
    expect(mode.closest('[data-ui="gallery.videoReview.timeline"]')).toBeNull();
    expect(
      fixture.host.querySelector('[aria-label="gallery.videoReview.addOverlayComment"]')
    ).toBeNull();
    await fixture.click('advancedEditing');
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.backgroundInspector"]')
    ).not.toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

it('keeps conflict recovery accessible while a Basic comment is being edited', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('addComment');
    await fixture.fill('Conflicting comment');
    integration.commit.mockRejectedValueOnce({ code: 'conflict' });
    await fixture.click('save');
    expect(fixture.button('reload').disabled).toBe(false);
    await fixture.click('reload');
    expect(integration.read).toHaveBeenCalled();
  } finally {
    await fixture.cleanup();
  }
});
