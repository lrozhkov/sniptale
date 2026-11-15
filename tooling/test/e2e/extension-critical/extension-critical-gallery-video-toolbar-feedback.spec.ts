import { expect, test } from '@playwright/test';
import { translate } from '../support/catalog-fixture';
import { startHostServer } from '../support/host-server';
import {
  addReviewFocus,
  seedReviewVideo,
  seedReviewWebcamBundle,
  seedReviewHistory,
  installReviewModeChoice,
} from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const width of [1280, 1920])
  for (const theme of ['light', 'dark'] as const)
    test(`toolbar feedback ${width} ru ${theme}`, async ({ page }, info) => {
      const host = await startHostServer();
      const label = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
      const button = (key: Parameters<typeof translate>[0]) =>
        page.getByRole('button', { name: label(key), exact: true });
      try {
        await page.setViewportSize({ width, height: width === 1280 ? 560 : 900 });
        await applyHarnessBootstrap(page, {
          preserveMediaLibrary: true,
          storage: {
            'sniptale-locale-preference': 'ru',
            'sniptale-theme-preference': theme,
          },
        });
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        await seedReviewVideo(
          page,
          'review-vp8-opus.webm',
          { width: 160, height: 90, duration: 12 },
          false,
          true
        );
        await page.reload();
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        await button('gallery.videoReview.advancedEditing').click();
        await page.evaluate(() => document.fonts.ready);
        const toolbar = page.locator('.review-timeline-toolbar');
        const lane = (track: string) =>
          page.locator(`[data-review-header-track="${track}"] [data-review-track-select]`);
        await expect(lane('source')).toHaveAttribute('aria-pressed', 'true');
        await expect(button('gallery.videoReview.cutMode')).toBeVisible();
        await expect(button('gallery.videoReview.zoomRegionLabel')).toHaveCount(0);
        const autosave = toolbar.locator('[data-ui="autosave-control"] button');
        await autosave.click();
        const autosaveToggle = page.getByRole('switch', {
          name: label('editor.documentActions.autosaveSwitch'),
          exact: true,
        });
        const drawing = autosaveToggle.locator('xpath=following-sibling::span');
        await expect.poll(async () => (await drawing.boundingBox())!.width).toBe(40);
        await expect(drawing).toHaveCSS('height', '28px');
        expect(await drawing.evaluate((node) => getComputedStyle(node, '::before').height)).toBe(
          '2px'
        );
        expect(await drawing.evaluate((node) => getComputedStyle(node, '::after').width)).toBe(
          '16px'
        );
        await page.screenshot({ path: info.outputPath('autosave-compact.png'), fullPage: false });
        await autosaveToggle.press('Escape');
        await expect(autosave).toBeFocused();
        const exportButton = toolbar.locator('[data-ui="gallery.videoReview.openExport"]');
        const more = toolbar.locator('[data-ui="gallery.videoReview.moreActions"]');
        const help = page.getByRole('menuitem', {
          name: label('gallery.keyboard.title'),
          exact: true,
        });
        const openHelp = async () => {
          await more.click();
          await help.click();
        };
        const density = button('gallery.videoReview.compactTrackHeight');
        await button('gallery.videoReview.trackSettings').click();
        await page.screenshot({ path: info.outputPath('track-settings.png'), fullPage: false });
        const densityBox = (await density.boundingBox())!;
        const settingsBox = (await button('gallery.videoReview.trackSettings').boundingBox())!;
        expect.soft(densityBox.x + densityBox.width).toBeLessThanOrEqual(settingsBox.x);
        await expect(
          page.locator('[data-ui="gallery.videoReview.trackControls"] button').first()
        ).toHaveAttribute('aria-label', label('gallery.videoReview.compactTrackHeight'));
        const trackSwitch = page.locator('[data-review-header-track="zoom"]').getByRole('switch');
        await expect.soft(trackSwitch).toHaveClass(/sniptale-glass-switch/);
        await lane('zoom').click();
        await expect(lane('zoom')).toHaveAttribute('aria-pressed', 'true');
        await expect(button('gallery.videoReview.cutMode')).toHaveCount(0);
        await trackSwitch.click();
        await expect(lane('source')).toHaveAttribute('aria-pressed', 'true');
        await expect(button('gallery.videoReview.cutMode')).toBeVisible();
        await expect(trackSwitch).toHaveAttribute('aria-checked', 'false');
        await trackSwitch.press('Space');
        await expect(trackSwitch).toHaveAttribute('aria-checked', 'true');
        await density.click();
        await expect(density).toHaveAttribute('aria-pressed', 'true');
        await expect.soft(density.locator('svg')).toHaveClass(/lucide-chevrons-up-down/);
        await density.click();
        await expect.soft(density.locator('svg')).toHaveClass(/lucide-chevrons-down-up/);
        await button('gallery.videoReview.trackSettings').click();
        const helpBox = (await more.boundingBox())!;
        const exportBox = (await exportButton.boundingBox())!;
        expect.soft(helpBox.x).toBeGreaterThanOrEqual(exportBox.x + exportBox.width);
        await openHelp();
        await expect(page.locator('dialog[open]')).toHaveCount(2);
        await page.keyboard.press('Escape');
        await expect(more).toBeFocused();
        for (const key of [
          'gallery.videoReview.undo',
          'gallery.videoReview.redo',
          'gallery.videoReview.historyReset',
        ] as const)
          await expect.soft(button(key).locator('[data-review-toolbar-label]')).toHaveCount(0);
        const reset = button('gallery.videoReview.historyReset');
        await reset.hover();
        await expect(reset).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(reset).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
        await reset.click();
        await expect(page.locator('[data-ui="gallery.videoReview.historyChoices"]')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(reset).toBeFocused();
        const cut = button('gallery.videoReview.cutMode');
        await page.mouse.move(0, 0);
        await expect.soft(cut).toHaveCSS('font-weight', '400');
        await cut.hover();
        await expect.soft(cut).toHaveCSS('font-weight', '450');
        await page.screenshot({ path: info.outputPath('toolbar-hover.png'), fullPage: false });
        await cut.click();
        await expect(cut).toHaveAttribute('aria-pressed', 'true');
        await lane('zoom').focus();
        await lane('zoom').press('Enter');
        await expect(lane('zoom')).toHaveAttribute('aria-pressed', 'true');
        await expect(cut).toHaveCount(0);
        await expect(button('gallery.videoReview.zoomRegionLabel')).toBeVisible();
        await page.screenshot({ path: info.outputPath('zoom-lane-tools.png'), fullPage: false });
        await lane('originalAudio').click();
        await expect(button('gallery.videoReview.originalAudioRange')).toBeVisible();
        await expect(cut).toHaveCount(0);
        await lane('text').click();
        await expect(lane('text')).toHaveAttribute('aria-pressed', 'true');
        await expect(button('gallery.videoReview.originalAudioRange')).toHaveCount(0);
        await page.screenshot({ path: info.outputPath('text-lane-actions.png'), fullPage: false });
        await lane('source').focus();
        await lane('source').press('Space');
        await expect(button('gallery.videoReview.play')).toBeVisible();
        await expect(lane('source')).toHaveAttribute('aria-pressed', 'true');
        await expect(cut).toHaveAttribute('aria-pressed', 'false');
        await addReviewFocus(page);
        await button('gallery.videoReview.undo').click();
        await expect(button('gallery.videoReview.redo')).toBeEnabled();
        await button('gallery.videoReview.redo').click();
        await button('gallery.videoReview.play').click();
        const pause = button('gallery.videoReview.pause');
        await expect.soft(pause.locator('svg rect')).toHaveCount(2);
        await pause.click();
        await expect(button('gallery.videoReview.play')).toBeVisible();
        if (width === 1280 && theme === 'light') {
          await lane('annotationEffects').click();
          await expect(cut).toHaveCount(0);
          await button('gallery.videoReview.annotationEffectsAdd').click();
          const selector = button('gallery.videoReview.annotationEffectsChoose');
          await expect(selector).not.toHaveAttribute('aria-describedby');
          await expect(selector).not.toHaveText(
            label('gallery.videoReview.annotationEffectsChoose')
          );
          await selector.click();
          await page.getByRole('option', { name: 'Главная мысль', exact: true }).click();
          await expect(selector).toHaveText('Главная мысль');
          await page.screenshot({
            path: info.outputPath('annotation-choice.png'),
            fullPage: false,
          });
          await button('gallery.videoReview.pointerTool').click();
          await page.setViewportSize({ width: 1100, height: 560 });
          const scroll = page.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
          await expect(scroll).toHaveCSS('overflow-x', 'auto');
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
          ).toBe(true);
          expect(await scroll.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
          await scroll.evaluate((node) => {
            node.scrollLeft = node.scrollWidth;
          });
          await expect(more).toBeInViewport();
          await openHelp();
          await page.keyboard.press('Escape');
          await expect(more).toBeFocused();
          await page.screenshot({ path: info.outputPath('below-minimum.png'), fullPage: false });
        }
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });

test('shadow review comment keeps Space and text navigation outside video shortcuts', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1920, height: 900 });
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'ru' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(
      page,
      'review-vp8-opus.webm',
      { width: 160, height: 90, duration: 12 },
      false,
      true
    );
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await page
      .getByRole('button', {
        name: translate('gallery.videoReview.advancedEditing', 'ru'),
        exact: true,
      })
      .click();
    const editor = page.locator('[data-ui="gallery.videoReview.dialog"]');
    await editor.evaluate((node) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;left:30px;top:30px;z-index:2147483647';
      const field = document.createElement('textarea');
      field.setAttribute('aria-label', 'Design review comment');
      overlay.attachShadow({ mode: 'open' }).append(field);
      node.append(overlay);
    });
    const comment = page.getByRole('textbox', { name: 'Design review comment' });
    await comment.fill('Замечание');
    await comment.press('Space');
    await comment.pressSequentially('по кадру');
    await expect(comment).toHaveValue('Замечание по кадру');
    await comment.press('Home');
    await comment.press('Delete');
    await expect(comment).toHaveValue('амечание по кадру');
    const play = page.getByRole('button', {
      name: translate('gallery.videoReview.play', 'ru'),
      exact: true,
    });
    await expect(play).toBeVisible();
    await page.screenshot({ path: info.outputPath('shadow-comment-typing.png'), fullPage: false });
    await play.click();
    await expect(
      page.getByRole('button', { name: translate('gallery.videoReview.pause', 'ru'), exact: true })
    ).toBeVisible();
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('project, track context and direct focus commands preserve camera information and Undo', async ({
  page,
}, info) => {
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  const button = (key: Parameters<typeof translate>[0]) =>
    page.getByRole('button', { name: label(key), exact: true });
  try {
    await page.setViewportSize({ width: 1920, height: 900 });
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await installReviewModeChoice(page, 'advanced');
    await seedReviewWebcamBundle(page);
    await seedReviewHistory(page);
    await page.reload();
    await page.getByRole('button', { name: 'Screen or window: Screen', exact: true }).click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await page.locator('[data-ui="gallery.videoReview.projectInfo"]').waitFor();
    const inspector = page.locator('[data-ui="gallery.videoReview.inspector"]');
    const toolbar = page.locator('[data-ui="gallery.videoReview.toolbar"]');
    const mode = button('gallery.videoReview.advancedEditing');
    const project = inspector.locator('[data-ui="gallery.videoReview.projectInfo"]');
    await expect(project).toBeVisible();
    const camera = project.locator('[data-ui="gallery.videoReview.projectCameraInfo"]');
    await expect(camera).toContainText('camera-clock.webm');
    await expect(camera).toContainText('160 × 90');
    await project.locator('button.review-project-title').click();
    const name = project.getByRole('textbox', {
      name: label('videoEditor.app.projectNameLabel'),
      exact: true,
    });
    await name.fill('Context project');
    await name.press('Enter');
    await expect(page).toHaveTitle('Context project');
    await page.evaluate(async () =>
      chrome.storage.local.set({ 'sniptale-locale-preference': 'ru' })
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page).toHaveTitle('Context project');
    await page.evaluate(async () =>
      chrome.storage.local.set({ 'sniptale-locale-preference': 'en' })
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Context project');
    await expect(
      inspector.locator('[data-ui="gallery.videoReview.inspectorNavigation"]')
    ).toHaveCount(0);
    expect(await mode.evaluate((el) => el.nextElementSibling?.getAttribute('data-ui'))).toBe(
      'gallery.videoReview.openExport'
    );
    const lane = (track: string) =>
      page.locator(`[data-review-header-track="${track}"] [data-review-track-select]`);
    await lane('originalAudio').click();
    await expect(inspector.locator('header h2')).toHaveText(
      label('gallery.videoReview.audioOriginal')
    );
    await toolbar
      .getByRole('button', { name: label('gallery.videoReview.comments'), exact: true })
      .click();
    await inspector
      .locator('header')
      .getByRole('button', { name: label('gallery.videoReview.audioOriginal'), exact: true })
      .click();
    await expect(inspector.locator('header h2')).toHaveText(
      label('gallery.videoReview.audioOriginal')
    );
    await mode.click();
    await lane('originalAudio').click();
    await expect(inspector).toContainText(label('gallery.videoReview.volume'));
    await expect(inspector).not.toContainText(label('gallery.videoReview.recognitionTitle'));
    await expect(
      inspector.getByRole('button', { name: label('gallery.videoReview.speechTitle'), exact: true })
    ).toHaveCount(0);
    const controls = page.locator('[data-ui="gallery.videoReview.trackControls"]');
    await expect(
      controls.getByRole('button', { name: label('gallery.videoReview.telemetry'), exact: true })
    ).toBeVisible();
    await expect(
      toolbar.getByRole('button', { name: label('gallery.videoReview.telemetry'), exact: true })
    ).toHaveCount(0);
    await mode.click();
    await lane('zoom').click();
    const tools = toolbar.locator('[data-ui="gallery.videoReview.focusTools"]');
    await expect(tools.getByRole('button')).toHaveCount(4);
    const zoom = tools.getByRole('button', {
      name: label('gallery.videoReview.zoomRegionLabel'),
      exact: true,
    });
    await zoom.click();
    const zoomLane = page.locator('[data-ui="gallery.videoReview.zoomLane"]');
    await zoomLane.scrollIntoViewIfNeeded();
    const box = (await zoomLane.boundingBox())!;
    const plane = page.locator('[data-ui="gallery.videoReview.timePlane"]');
    const duration = Number(await plane.getAttribute('aria-valuemax'));
    await page.mouse.move(box.x + box.width / duration, box.y + box.height - 5);
    await page.mouse.down();
    await expect(zoom).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(box.x + (box.width * 3) / duration, box.y + box.height - 5, { steps: 5 });
    await page.mouse.up();
    const plate = page.locator('[data-review-removal-key^="focus:"]');
    await expect(plate).toHaveCount(1);
    await plate.click();
    await expect(lane('zoom')).toHaveAttribute('aria-pressed', 'true');
    const floating = page.locator('[data-ui="gallery.videoReview.selectionActions"]');
    await expect(floating).toBeVisible();
    await expect(floating.getByRole('button')).toHaveCount(3);
    const actions = inspector.locator('[data-section="actions"]');
    await expect(actions).toContainText(label('gallery.videoReview.zoomDelete'));
    const ys = await floating
      .getByRole('button')
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().y));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
    await expect(floating).toHaveAttribute('data-tail-side', 'bottom');
    const handles = plate.locator('.review-timeline-resize-handle');
    await expect(handles).toHaveCount(2);
    await page.mouse.move(2, 2);
    await expect(handles.first()).toHaveCSS('opacity', '1');
    expect(await handles.first().evaluate((el) => getComputedStyle(el, '::after').height)).toBe(
      '16px'
    );
    await page.screenshot({
      path: info.outputPath('project-context-actions.png'),
      fullPage: false,
    });
    await floating
      .getByRole('button', { name: label('gallery.videoReview.zoomDelete'), exact: true })
      .click();
    await expect(plate).toHaveCount(0);
    await button('gallery.videoReview.undo').click();
    await expect(plate).toHaveCount(1);
    await page.setViewportSize({ width: 1280, height: 560 });
    await expect(mode).toBeInViewport();
    await expect(controls.getByRole('button').first()).toBeInViewport();
    await page.screenshot({ path: info.outputPath('context-toolbar-short.png'), fullPage: false });
    // Controlled microphone input still uses the production recorder and a native MediaRecorder take.
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.evaluate(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          const audio = new AudioContext();
          const oscillator = audio.createOscillator();
          const destination = audio.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          return destination.stream;
        },
      });
    });
    await lane('voiceover').click();
    await button('gallery.videoReview.recordVoiceover').click();
    const recorder = page.locator('[data-ui="gallery.videoReview.voiceoverInspector"]');
    await expect(recorder).toBeVisible();
    const recordingNavigation = page.locator('[data-ui="gallery.videoReview.recordingNavigation"]');
    const showRecordingSection = async (key: Parameters<typeof translate>[0]) => {
      await recordingNavigation.getByRole('button').click();
      await page.getByRole('option', { name: label(key), exact: true }).click();
    };
    await recorder
      .getByRole('button', { name: label('videoEditor.app.recordAudioStart'), exact: true })
      .click();
    await expect(
      recorder.getByRole('button', { name: label('videoEditor.app.recordAudioStop'), exact: true })
    ).toBeVisible();
    await showRecordingSection('gallery.videoReview.scene');
    await expect(recorder).toBeHidden();
    await expect(inspector.locator('.review-inspector-scroll')).toHaveAttribute('inert');
    await showRecordingSection('gallery.videoReview.recordVoiceover');
    // Elapsed capture time is required to produce an actual decodable take.
    await page.waitForTimeout(1200);
    await recorder
      .getByRole('button', { name: label('videoEditor.app.recordAudioStop'), exact: true })
      .click();
    const trim = recorder.locator('[data-ui="video-editor.audio-recording.trim-panel"]');
    await expect(trim).toBeVisible();
    const retainedTake = await trim.elementHandle();
    await showRecordingSection('gallery.videoReview.comments');
    await expect(trim).toBeAttached();
    await expect(trim).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 560 });
    await showRecordingSection('gallery.videoReview.recordVoiceover');
    await expect(trim).toBeVisible();
    expect(await trim.evaluate((node, before) => node === before, retainedTake)).toBe(true);
    await expect(
      recorder.getByRole('button', { name: label('videoEditor.app.recordAudioSave'), exact: true })
    ).toBeEnabled();
    await page.screenshot({
      path: info.outputPath('retained-recording-navigation.png'),
      fullPage: false,
    });
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
