import { formatPreciseTime } from '../../../../apps/extension/src/video-editor/timeline/project/interaction-state/helpers';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { checkInspectorPaintedFont } from '../support/inspector-utilities';
import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { addVideoProjectCommentDocument } from '../../../../apps/extension/src/features/video/project/comments/authoring';
import { createCanvasComment } from '../../../../apps/extension/src/features/video/review/comments';
import { translate } from '../../../../apps/extension/src/platform/i18n';

for (const [index, size] of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
].entries()) {
  test(`Native editorial notes ${size.width}`, async ({ page }, info) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize(size);
    const locale = index ? 'en' : 'ru';
    const theme = index ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: theme });
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const project = createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename: 'notes.webm',
        width: 160,
        height: 90,
        duration: 12,
        mimeType: 'video/webm',
        size: bytes.length,
      });
      const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
      const secondTrack = createVideoProjectTrack('Second video', 1, 'PRIMARY');
      const second = {
        ...structuredClone(video),
        id: 'same-file-copy',
        trackId: secondTrack.id,
        sourceInstanceId: 'independent-source',
        startTime: 20,
        duration: 4,
        sourceDuration: 4,
      };
      project.duration = 24;
      project.tracks.push(secondTrack);
      project.clips.push(second);
      const firstSource = `${video.name} · ${project.tracks.find((track) => track.id === video.trackId)!.name} · 1`;
      const secondSource = `${second.name} · ${secondTrack.name} · 2`;
      const original = locale === 'ru' ? 'Проверить переход' : 'Check the transition';
      const edited = locale === 'ru' ? 'Заметка о переходе' : 'Note about the transition';
      const created = addVideoProjectCommentDocument(project, {
        id: 'notes',
        target: { kind: 'project' },
        note: { id: 'note', text: original, anchor: { kind: 'range', start: 2, end: 5 } },
      });
      if (!created.ok || !created.document) throw new Error('Notes fixture admission refused');
      // Passive legacy metadata must not expose the retired on-video note controls.
      created.document.canvasComments = [
        createCanvasComment({ id: 'legacy-bubble', annotationId: 'note', start: 2, end: 5 }),
      ];
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [created.project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript(() => {
        if (!sessionStorage.getItem('native-notes-seeded')) return;
        const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
        if (typeof bootstrap === 'object' && bootstrap !== null)
          Reflect.deleteProperty(bootstrap, 'videoProjects');
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.evaluate(() => sessionStorage.setItem('native-notes-seeded', 'true'));
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await page.locator('[data-ui="video-editor.timeline.surface"]').waitFor();
      const noteMarker = (text: string) =>
        page.getByRole('button', {
          name: `${label('videoEditor.sidebar.commentNote')} · ${formatPreciseTime(2)} · ${text}`,
          exact: true,
        });
      await noteMarker(original).click();
      await expect(
        page.locator('[data-ui="video-editor.timeline.playhead-handle"]')
      ).toHaveAttribute('aria-valuenow', '2');
      const inspector = page.locator('[data-ui="video-editor.comment.inspector"]');
      await inspector.waitFor();
      await inspector
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupContent'),
          exact: true,
        })
        .click();
      const field = inspector.getByRole('textbox');
      await field.fill(edited);
      await checkInspectorPaintedFont(page, field, 'input');
      await field.press('Tab');
      const read = async () => (await readNativeVideoProject(page))!;
      await expect
        .poll(async () => (await read()).commentDocuments![0]!.annotations[0]!.text)
        .toBe(edited);
      const acceptedClips = structuredClone((await read()).clips);
      await inspector
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupTiming'),
          exact: true,
        })
        .click();
      await checkInspectorPaintedFont(
        page,
        inspector.getByLabel(label('gallery.videoReview.textFragmentStart'), { exact: true }),
        'numeric'
      );
      await page.screenshot({ path: info.outputPath('notes-timing.png'), fullPage: false });
      const rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
      const position = (await rail.boundingBox())!;
      await inspector
        .getByLabel(label('gallery.videoReview.textFragmentEnd'), { exact: true })
        .scrollIntoViewIfNeeded();
      expect((await rail.boundingBox())!.y).toBe(position.y);
      await inspector
        .getByRole('button', { name: label('videoEditor.sidebar.actionsTitle'), exact: true })
        .click();
      await expect(
        inspector.getByRole('button', {
          name: label('gallery.videoReview.showOnVideo'),
          exact: true,
        })
      ).toHaveCount(0);
      await inspector
        .getByRole('button', { name: label('videoEditor.sidebar.commentBack'), exact: true })
        .click();
      const manager = page.locator('[data-ui="video-editor.comments.panel"]');
      await manager.waitFor();
      await expect(
        manager.getByRole('button', {
          name: label('gallery.videoReview.addOverlayComment'),
          exact: true,
        })
      ).toHaveCount(0);
      await manager.getByRole('button', { name: edited, exact: true }).click();
      await expect(
        page.locator('[data-ui="video-editor.timeline.playhead-handle"]')
      ).toHaveAttribute('aria-valuenow', '2');
      await page.reload();
      await page.locator('[data-ui="video-editor.timeline.surface"]').waitFor();
      await noteMarker(edited).click();
      await noteMarker(edited).focus();
      await page.keyboard.press('Delete');
      await expect
        .poll(async () => (await read()).commentDocuments![0]!.annotations.length)
        .toBe(0);
      expect((await read()).clips).toEqual(acceptedClips);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await read()).commentDocuments![0]!.annotations[0]?.text)
        .toBe(edited);
      await noteMarker(edited).click();
      await inspector
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupTiming'),
          exact: true,
        })
        .click();
      await inspector
        .getByRole('button', { name: label('videoEditor.sidebar.commentBack'), exact: true })
        .click();
      await manager
        .getByRole('button', { name: label('videoEditor.sidebar.commentDestination'), exact: true })
        .click();
      await expect(page.getByRole('option', { name: firstSource, exact: true })).toBeVisible();
      await expect(page.getByRole('option', { name: secondSource, exact: true })).toBeVisible();
      await page.getByRole('option', { name: secondSource, exact: true }).click();
      await manager
        .getByRole('button', { name: label('videoEditor.sidebar.commentAddNote'), exact: true })
        .click();
      await expect(
        page.locator('[data-ui="video-editor.timeline.playhead-handle"]')
      ).toHaveAttribute('aria-valuenow', '20');
      await inspector
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupContent'),
          exact: true,
        })
        .click();
      await inspector.getByRole('textbox').fill('Source instance note');
      await inspector.getByRole('textbox').press('Tab');
      await expect
        .poll(
          async () =>
            (await read()).commentDocuments?.find((entry) => entry.binding.kind === 'source')
              ?.binding
        )
        .toEqual({
          kind: 'source',
          assetId: video.assetId,
          sourceInstanceId: second.sourceInstanceId,
        });
      await inspector
        .getByRole('button', {
          name: label('videoEditor.sidebar.commentSourceTime'),
          exact: true,
        })
        .click();
      const floating = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      const closeMaterials = page.locator('[data-ui="video-editor.materials.close"]');
      if (await closeMaterials.isVisible()) await closeMaterials.click();
      const resize = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
      for (const targetWidth of [520, 359, 360, 361]) {
        const width = (await floating.boundingBox())!.width;
        const handle = (await resize.boundingBox())!;
        await page.mouse.move(handle.x + handle.width / 2, handle.y + 12);
        await page.mouse.down();
        await page.mouse.move(handle.x + handle.width / 2 + width - targetWidth, handle.y + 12);
        await page.mouse.up();
        await expect
          .poll(async () => Math.round((await floating.boundingBox())!.width))
          .toBe(targetWidth);
        expect(await floating.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
          true
        );
        await page.screenshot({
          path: info.outputPath(`notes-width-${targetWidth}.png`),
          fullPage: false,
        });
      }
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await inspector
        .getByRole('button', { name: label('videoEditor.sidebar.commentBack'), exact: true })
        .click();
      await expect(manager).toBeInViewport();
      await page.screenshot({ path: info.outputPath('notes-all-return.png'), fullPage: false });
      await manager.getByRole('button', { name: 'Source instance note', exact: true }).click();
      await expect(
        inspector.getByRole('textbox', {
          name: label('gallery.videoReview.commentText'),
          exact: true,
        })
      ).toHaveValue('Source instance note');
      await page.setViewportSize({ width: 1100, height: 560 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

test('Native source note markers navigate to the clicked retained piece', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  const host = await startHostServer();
  try {
    const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
    const project = createVideoProjectFromRecording({
      recordingId: 'beta-v1-recording',
      filename: 'pieces.webm',
      width: 160,
      height: 90,
      duration: 12,
      mimeType: 'video/webm',
      size: bytes.length,
    });
    const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
    const sourceInstanceId = clip.sourceInstanceId ?? clip.id;
    project.clips = [
      { ...clip, sourceInstanceId, sourceDuration: 3, duration: 3 },
      {
        ...clip,
        id: 'right-piece',
        sourceInstanceId,
        sourceStart: 6,
        sourceDuration: 6,
        duration: 3,
        playbackRate: 2,
        startTime: 10,
      },
    ];
    project.duration = 13;
    const added = addVideoProjectCommentDocument(project, {
      id: 'notes',
      target: { kind: 'source', clipId: clip.id },
      note: { id: 'note', text: 'Across the cut', anchor: { kind: 'range', start: 1, end: 8 } },
    });
    if (!added.ok) throw new Error('Source note fixture admission refused');
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      videoProjects: [added.project],
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`);
    const label = translate('videoEditor.sidebar.commentNote', 'en');
    await page
      .getByRole('button', {
        name: `${label} · ${formatPreciseTime(1)} · Across the cut`,
        exact: true,
      })
      .click();
    await expect(page.locator('[data-ui="video-editor.timeline.playhead-handle"]')).toHaveAttribute(
      'aria-valuenow',
      '1'
    );
    await page
      .getByRole('button', {
        name: `${label} · ${formatPreciseTime(10)} · Across the cut`,
        exact: true,
      })
      .click();
    await expect(page.locator('[data-ui="video-editor.timeline.playhead-handle"]')).toHaveAttribute(
      'aria-valuenow',
      '10'
    );
    await page.screenshot({ path: info.outputPath('source-note-piece.png'), fullPage: false });
    await page.getByRole('button', { name: 'Back to notes', exact: true }).click();
    await page
      .locator('[data-ui="video-editor.timeline.ruler"]')
      .getByText('0:06', { exact: true })
      .click();
    const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
    const gapTime = Number(await playhead.getAttribute('aria-valuenow'));
    expect(gapTime).toBeGreaterThan(5.9);
    expect(gapTime).toBeLessThan(6.4);
    await page.getByRole('button', { name: 'Across the cut', exact: true }).click();
    await expect(playhead).toHaveAttribute('aria-valuenow', '1');
    await expect
      .poll(() =>
        page.locator('[data-preview-stage-canvas]').evaluate((node) => {
          if (!(node instanceof HTMLCanvasElement)) return false;
          const context = node.getContext('2d');
          if (!context) return false;
          for (let y = 1; y < 9; y++) {
            for (let x = 1; x < 16; x++) {
              const pixel = context.getImageData(
                Math.floor((node.width * x) / 16),
                Math.floor((node.height * y) / 9),
                1,
                1
              ).data;
              if (
                Math.max(pixel[0]!, pixel[1]!, pixel[2]!) -
                  Math.min(pixel[0]!, pixel[1]!, pixel[2]!) >
                100
              )
                return true;
            }
          }
          return false;
        })
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath('source-note-nearest-gap.png'),
      fullPage: false,
    });
    expect(
      (await readNativeVideoProject(page))!.commentDocuments![0]!.annotations[0]!.anchor
    ).toEqual({ kind: 'range', start: 1, end: 8 });
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
