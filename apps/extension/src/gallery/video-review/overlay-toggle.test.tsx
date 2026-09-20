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

it('keeps advanced mode in the unified timeline toolbar and hides unavailable overlay controls', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    expect(
      fixture.button('advancedEditing').closest('[data-ui="gallery.videoReview.timeline"]')
    ).not.toBeNull();
    expect(fixture.host.querySelector('[aria-label="gallery.videoReview.inspector"]')).toBeNull();
    await fixture.click('advancedEditing');
    for (const key of [
      'addOverlayComment',
      'showOnVideo',
      'hideOverlays',
      'showOverlays',
      'trackControlsWidth',
      'volume',
    ])
      expect(fixture.host.querySelector(`[aria-label="gallery.videoReview.${key}"]`)).toBeNull();
    expect(
      fixture.host.querySelector('aside [aria-label="gallery.videoReview.advancedEditing"]')
    ).toBeNull();
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.backgroundInspector"]')
    ).not.toBeNull();
    await fixture.click('advancedEditing');
    expect(fixture.host.querySelector('[aria-label="gallery.videoReview.inspector"]')).toBeNull();
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.backgroundInspector"]')
    ).toBeNull();
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
