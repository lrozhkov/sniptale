// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import type { loadVideoReviewSource } from '../../workflows/video-review/source';
import { VideoReview } from './index';
import { createEditorFixture } from './editor-fixture.test-support';

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
  openGallery: vi.fn(async () => undefined),
  subtitles: vi.fn(),
}));
vi.mock('../../platform/navigation/extension-pages', () => ({
  openGalleryPage: integration.openGallery,
}));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../workflows/video-review/export-lifecycle', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/export-lifecycle')>()),
  exportReviewedVideo: integration.export,
}));
vi.mock('../../workflows/video-review/media-index', () => ({
  inspectReviewMedia: integration.index,
  supportedReviewVideoCodecs: vi.fn(async (format: string) =>
    format === 'mp4' ? ['avc'] : ['vp9', 'vp8']
  ),
}));
vi.mock('../../workflows/video-review/source', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/source')>()),
  loadVideoReviewSource: integration.load,
}));
vi.mock('../../composition/persistence/review-workspaces/store', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/review-workspaces/store')>()),
  saveVideoWorkspaceDraft: integration.draft,
  saveVideoWorkspaceAdvanced: integration.advanced,
  commitVideoWorkspace: integration.commit,
  moveVideoWorkspaceHistory: integration.history,
  readVideoWorkspace: integration.read,
}));

vi.mock('../shared/download', () => ({ downloadGalleryBlob: integration.subtitles }));

it('exports the actual inspector document on the final video clock without changing project or audio', async () => {
  const fixture = createEditorFixture(integration);
  const load = integration.load.getMockImplementation()!;
  integration.load.mockImplementation(async () => {
    const loaded: Awaited<ReturnType<typeof loadVideoReviewSource>> = await load();
    loaded.snapshot.workspace.advanced.ui.mode = 'advanced';
    loaded.snapshot.workspace.advanced.text = {
      version: 1,
      fragments: [
        {
          id: 'phrase',
          text: 'Hidden authored phrase',
          originalText: '',
          start: 1,
          end: 3,
          timeDomain: 'result',
          alignment: 'manual',
          revision: 0,
          timingRevision: 0,
          showInVideo: false,
        },
      ],
    };
    return loaded;
  });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.selectRulerRange(1, 3);
    await fixture.click('exportSection');
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.exportSection"]')
    ).not.toBeNull();
    await act(async () =>
      fixture.host
        .querySelector<HTMLButtonElement>(
          '[data-review-header-track="text"] [data-review-track-select]'
        )!
        .click()
    );
    await fixture.click('subtitlesTitle');
    expect(fixture.host.textContent).toContain('Hidden authored phrase');
    expect(fixture.button('subtitlesDownload').disabled).toBe(false);
    await fixture.click('subtitlesDownload');
    expect(integration.subtitles).toHaveBeenCalledOnce();
    const blob: Blob = integration.subtitles.mock.calls[0]![0];
    const content = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(content).toContain('00:00:01.000 --> 00:00:03.000');
    expect(content).toContain('Hidden authored phrase');
    expect(integration.advanced).not.toHaveBeenCalled();
    expect(integration.commit).not.toHaveBeenCalled();
    expect(fixture.snapshot.workspace.advanced.audio.voiceover).toEqual([]);
    await fixture.click('textVoiceBack');
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.textDocument"]')
    ).not.toBeNull();
    await act(async () =>
      fixture.host
        .querySelector<HTMLElement>(
          '[data-ui="gallery.videoReview.textTrack"] [data-text-id="phrase"]'
        )!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    );
    expect(fixture.host.querySelector('[data-ui="gallery.videoReview.textDocument"]')).toBeNull();
    expect(fixture.host.querySelector('textarea')?.value).toBe('Hidden authored phrase');
    await act(async () =>
      fixture.host
        .querySelector<HTMLButtonElement>(
          '[data-review-header-track="actions"] [data-review-track-select]'
        )!
        .click()
    );
    await act(async () =>
      fixture.host
        .querySelector<HTMLButtonElement>(
          '[data-ui="gallery.videoReview.historyResults"] li button'
        )!
        .click()
    );
    expect(fixture.host.querySelector('[data-ui="gallery.videoReview.textSubtitles"]')).toBeNull();
    await act(async () =>
      fixture.host
        .querySelector<HTMLButtonElement>(
          '[data-review-header-track="text"] [data-review-track-select]'
        )!
        .click()
    );
    expect(fixture.host.textContent).toContain('Hidden authored phrase');
    expect(integration.commit).not.toHaveBeenCalled();
  } finally {
    await fixture.cleanup();
  }
});

vi.mock('../../workflows/sync-transfer/editing-admission', () => ({
  ensureNativeEditingRootAvailable: vi.fn(async () => undefined),
}));

it('shares caption visibility between the text eye and scene without disabling text authoring', async () => {
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    const eye = () =>
      fixture.host.querySelector<HTMLButtonElement>(
        '[data-review-header-track="text"] [aria-label="gallery.videoReview.captionsEnabled"]'
      )!;
    expect(eye().getAttribute('aria-pressed')).toBe('false');
    expect(
      fixture.host
        .querySelector('[data-review-track="text"]')
        ?.getAttribute('data-review-track-muted')
    ).toBe('false');
    await act(async () =>
      fixture.host
        .querySelector<HTMLButtonElement>(
          '[data-review-header-track="text"] [data-review-track-select]'
        )!
        .click()
    );
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.textDocument"]')
    ).not.toBeNull();
    expect(
      fixture.host.querySelector<HTMLButtonElement>(
        '[data-ui="gallery.videoReview.editingTools"] button[aria-label="gallery.videoReview.textFragmentAdd"]'
      )!.disabled
    ).toBe(false);
    await act(async () => eye().click());
    expect(eye().getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      const navigation = fixture.host.querySelector(
        '[data-ui="gallery.videoReview.inspectorNavigation"]'
      )!;
      Array.from(navigation.querySelectorAll('button'))
        .find((button) => button.textContent === 'gallery.videoReview.scene')!
        .click();
    });
    const toggle = fixture.host.querySelector<HTMLButtonElement>(
      '[data-ui="gallery.videoReview.captionScene"] [role="switch"]'
    )!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await act(async () => toggle.click());
    expect(eye().getAttribute('aria-pressed')).toBe('false');
    expect(fixture.host.querySelector('[data-review-track="text"]')).not.toBeNull();
    expect(fixture.snapshot.workspace.advanced.audio.voiceover).toEqual([]);
  } finally {
    await fixture.cleanup();
  }
});
