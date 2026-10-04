// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
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
import { VideoReview } from './index';
import { createEditorFixture } from './editor-fixture.test-support';

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

it('retains failed new-note text and blocks Back until retry succeeds', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('addComment');
    await fixture.fill('Keep on failure');
    integration.commit.mockRejectedValueOnce(new Error('Quota'));
    await fixture.click('back');
    expect(fixture.back).not.toHaveBeenCalled();
    expect(fixture.host.querySelector('textarea')?.value).toBe('Keep on failure');
    expect(fixture.host.textContent).toContain('gallery.videoReview.saveFailed');
    await fixture.click('back');
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
      window.dispatchEvent(new KeyboardEvent('keydown', { key, code, ctrlKey }));
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
  } finally {
    await fixture.cleanup();
  }
});
