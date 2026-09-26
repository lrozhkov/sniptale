// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
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
  snapshot: vi.fn(),
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
  saveVideoWorkspaceSnapshot: integration.snapshot,
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
import { VideoReview } from './index';
import { createEditorFixture } from './editor-fixture.test-support';

it('resets the mounted editor and preserves its changes on cancellation or failed storage', async () => {
  const fixture = createEditorFixture(integration, {
    history: [
      {
        id: 'cut-op',
        at: 1,
        target: 'edit',
        before: null,
        after: { id: 'cut', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 },
      },
    ],
  });
  integration.snapshot.mockRejectedValueOnce(new Error('Storage failed'));
  integration.snapshot.mockImplementationOnce(
    async (args: { workspace: VideoWorkspaceSnapshot['workspace'] }) => ({
      workspace: { ...args.workspace, revision: 2 },
      draft: null,
    })
  );
  const confirm = async () => {
    await fixture.click('resetOriginal');
    await act(async () =>
      fixture.host
        .querySelector<HTMLButtonElement>('.sniptale-confirm-actions button:last-child')!
        .click()
    );
  };
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    const edits = () => fixture.host.querySelectorAll('[data-ui="gallery.videoReview.editBlock"]');
    expect(edits()).toHaveLength(1);
    await fixture.click('resetOriginal');
    await act(async () =>
      fixture.host.querySelector<HTMLButtonElement>('.sniptale-confirm-actions button')!.click()
    );
    expect(edits()).toHaveLength(1);
    expect(integration.snapshot).not.toHaveBeenCalled();
    await confirm();
    expect(edits()).toHaveLength(1);
    expect(fixture.host.textContent).toContain('gallery.videoReview.saveFailed');
    await confirm();
    expect(edits()).toHaveLength(0);
    expect(fixture.button('undo').disabled).toBe(true);
    expect(fixture.button('redo').disabled).toBe(true);
    expect(fixture.host.querySelector('video')!.currentTime).toBe(0);
  } finally {
    await fixture.cleanup();
  }
});
