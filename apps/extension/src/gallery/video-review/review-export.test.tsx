// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import * as zoomPreviewSource from './use-zoom-preview-source';
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

async function dragTimePlane(host: HTMLElement, start: number, end?: number) {
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
  const pointer = (type: string, x: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    (type === 'pointerdown'
      ? host.querySelector('[data-ui="gallery.videoReview.sourceLane"]')!
      : plane
    ).dispatchEvent(event);
  };
  await act(async () => pointer('pointerdown', start));
  if (end !== undefined) await act(async () => pointer('pointermove', end));
  await act(async () => pointer('pointerup', end ?? start));
}

it('blocks history and destructive shortcuts while the export controls are disabled', async () => {
  const fixture = createEditorFixture(integration);
  vi.spyOn(zoomPreviewSource, 'useZoomPreviewSource').mockReturnValue(async () => ({
    image: document.createElement('canvas'),
    width: 640,
    height: 360,
  }));
  let fail!: (reason: Error) => void;
  integration.export.mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      })
  );
  integration.index.mockResolvedValue({
    duration: 4,
    boundaries: [0, 1, 2, 3, 4],
    videoCodec: 'vp8',
    processedVideoCodec: 'vp8',
    audioCodec: null,
    container: 'webm',
    rotation: 0,
  });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    await fixture.click('cutMode');
    await dragTimePlane(fixture.host, 0, 100);
    await act(async () =>
      fixture.host
        .querySelector<HTMLButtonElement>(
          '[aria-label^="gallery.videoReview.cutLabel · 0.0 – 1.0"]'
        )!
        .click()
    );
    await fixture.click('pointerTool');
    await dragTimePlane(fixture.host, 200, 200);
    await fixture.click('zoomAdd');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    const target = () => fixture.host.querySelector('[data-ui="gallery.videoReview.zoomTarget"]');
    const preview = fixture.host.querySelector<HTMLCanvasElement>(
      '[data-ui="gallery.videoReview.zoomPreview"] canvas'
    )!;
    expect(target()).not.toBeNull();
    expect(preview.tabIndex).toBe(0);
    await fixture.click('exportSection');
    expect(fixture.button('exportVideo').disabled).toBe(false);
    await fixture.click('exportVideo');
    expect(integration.export).toHaveBeenCalledOnce();
    expect(target()).toBeNull();
    await act(async () =>
      fixture.host
        .querySelector<HTMLElement>(
          '[data-ui="gallery.videoReview.zoomLane"] [role="button"][data-cut-suppressed]'
        )!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    );
    const disabledPreview = fixture.host.querySelector<HTMLCanvasElement>(
      '[data-ui="gallery.videoReview.zoomPreview"] canvas'
    )!;
    expect(disabledPreview.tabIndex).toBe(-1);
    expect(target()).toBeNull();
    expect(fixture.button('exportSection').disabled).toBe(false);
    await fixture.click('exportSection');
    expect(fixture.button('cancelExport').disabled).toBe(false);
    expect(fixture.button('undo').disabled).toBe(true);
    for (const label of ['advancedEditing', 'zoomTrack', 'audioTrack'])
      expect(fixture.button(label).matches(':disabled')).toBe(true);
    integration.history.mockClear();
    integration.commit.mockClear();
    await act(async () =>
      disabledPreview.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      )
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(integration.commit).not.toHaveBeenCalled();
    for (const key of ['z', 'y'])
      await act(async () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true }))
      );
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })));
    expect(integration.history).not.toHaveBeenCalled();
    await dragTimePlane(fixture.host, 200, 300);
    expect(integration.commit).not.toHaveBeenCalled();
  } finally {
    await act(async () => fail?.(new Error('Cancelled test export')));
    await fixture.cleanup();
  }
});

it('marks the export opener active only while its inspector panel is shown', async () => {
  vi.useFakeTimers();
  const fixture = createEditorFixture(integration);
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    await act(async () => vi.advanceTimersByTimeAsync(300));
    vi.useRealTimers();
    await fixture.click('exportSection');
    const opener = fixture.host.querySelector('[data-ui="gallery.videoReview.openExport"]')!;
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.exportSection"]')
    ).not.toBeNull();
    expect(opener.getAttribute('aria-pressed')).toBe('true');
    const navigation = fixture.host.querySelector(
      '[data-ui="gallery.videoReview.inspectorNavigation"]'
    )!;
    const tabs = () => Array.from(navigation.querySelectorAll<HTMLButtonElement>('button'));
    expect(tabs()).toHaveLength(3);
    expect(
      fixture.host.querySelector('[data-ui="gallery.videoReview.exportSection"] h3')
    ).toBeNull();
    const history = fixture.snapshot.workspace.history;
    for (const section of ['scene', 'comments', 'exportSection']) {
      await act(async () =>
        tabs()
          .find((node) => node.textContent === `gallery.videoReview.${section}`)!
          .click()
      );
      expect(opener.getAttribute('aria-pressed')).toBe(
        section === 'exportSection' ? 'true' : 'false'
      );
    }
    expect(fixture.snapshot.workspace.history).toEqual(history);
    await fixture.click('zoomAdd');
    expect(opener.getAttribute('aria-pressed')).toBe('false');
    expect(tabs()).toHaveLength(3);
    expect(tabs().some((node) => node.textContent === 'gallery.videoReview.exportSection')).toBe(
      false
    );
    expect(tabs().some((node) => node.textContent === 'gallery.videoReview.zoomRegionLabel')).toBe(
      true
    );
    await act(async () => opener.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(opener.getAttribute('aria-pressed')).toBe('true');
    expect(tabs()).toHaveLength(3);
  } finally {
    await fixture.cleanup();
    vi.useRealTimers();
  }
});
