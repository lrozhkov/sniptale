import { checkLocalWindowIcon, checkRenderedWindowIcon } from '../support/window-header-local-icon';
import { writeFile } from 'node:fs/promises';
import { checkInspectorUtility, checkInspectorLabels } from '../support/inspector-utilities';
import { createVideoProjectMotionRegion } from '../../../../apps/extension/src/features/video/project/motion';
import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { applyHarnessBootstrap, VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { createVideoClipFromAsset } from '../../../../apps/extension/src/features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../../apps/extension/src/features/video/project/types';
import { createVideoProjectAsset } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoProjectFromMultiSourceRecording } from '../../../../apps/extension/src/features/video/project/factories/multi-source-recording';
import { createTextClip } from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`video inspector presentation ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      const project = createEmptyVideoProject('Inspector');
      const clip = createTextClip(project.tracks[0]!.id, project.width, project.height, 0);
      const secondClip = createTextClip(project.tracks[0]!.id, project.width, project.height, 6);
      project.clips.push(clip, secondClip);
      const motion = createVideoProjectMotionRegion(project, 0);
      project.motionRegions = [motion];
      await applyHarnessBootstrap(page, {
        apiBehavior: { runtimeFallback: 'typed-success' },
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript(
        (value) => localStorage.setItem('sniptale-locale-preference', value),
        locale
      );
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(
        `${hostOrigin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const panel = page.locator('[data-ui="video-editor.inspector.content"]');
      await page.locator('[data-ui="video-editor.floating.context-inspector"]').evaluate((node) => {
        (node as HTMLElement).style.width = '320px';
      });
      const categories = panel.locator('[data-ui="video-editor.inspector.categories"]');
      const active = categories.locator('nav button[aria-pressed="true"]');
      const activeName = await active.getAttribute('aria-label');
      await categories.locator('nav button[aria-pressed="false"]').first().hover();
      await expect(active).toHaveAttribute('aria-label', activeName!);
      const headings = categories.locator(
        '[data-ui="shared.categorized-inspector.section-heading"]'
      );
      await expect(headings).toHaveCSS('font-size', '13px');
      await expect(headings).toHaveCSS('text-transform', 'none');
      const top = (await headings.boundingBox())!.y;
      for (const button of await categories.locator('nav button').all()) {
        await button.click();
        expect((await headings.boundingBox())!.y).toBeCloseTo(top, 0);
        await checkInspectorLabels(panel);
      }
      await checkInspectorUtility(
        page,
        page.locator('[data-ui="video-editor.inspector.presentation-toggle"]')
      );
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await expect(panel.locator('[data-presentation="all"]')).toBeVisible();
      await checkInspectorUtility(
        page,
        page.locator('[data-ui="video-editor.inspector.presentation-toggle"]')
      );
      await checkInspectorUtility(page, page.locator('[data-ui="video-editor.inspector.close"]'));
      const height = page.locator('[data-ui="video-editor.inspector.dock-toggle"]');
      await height.click();
      await checkInspectorUtility(page, height);
      await height.click();
      await page.screenshot({ path: info.outputPath('inspector-utilities.png') });
      const section = panel.locator('[data-presentation="all"] > section').first();
      const disclosure = section.locator(':scope > details');
      const summary = disclosure.locator(':scope > summary');
      await expect(disclosure).toHaveAttribute('open', '');
      await expect(summary).toHaveCSS('font-size', '13px');
      await expect(summary).toHaveCSS('font-weight', '600');
      await expect(disclosure).toHaveCSS('border-top-width', '0px');
      await expect(summary).toHaveCSS('min-height', '32px');
      const draft = section.getByRole('textbox').first();
      await draft.fill('Draft survives collapse');
      await summary.click();
      await expect(disclosure).not.toHaveAttribute('open', '');
      await expect(draft).toBeHidden();
      await summary.press('Enter');
      await expect(draft).toBeVisible();
      await expect(draft).toHaveValue('Draft survives collapse');
      const numeric = panel.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]').first();
      const input = numeric.getByRole('textbox');
      await input.click();
      await expect(
        numeric.locator('[data-ui="shared.ui.compact-inspector.numeric-value-field"]')
      ).toHaveAttribute('data-focus-appearance', 'accent-box');
      await input.press('Enter');
      const segment = panel
        .locator(
          '[data-ui="shared.ui.compact-inspector.segmented-row"] button[aria-pressed="true"]'
        )
        .first();
      await segment.hover();
      await expect(segment).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(segment).toHaveCSS('box-shadow', 'none');
      const color = panel.locator('[data-ui="shared.ui.color-selector.trigger"]').first();
      await expect(color).toHaveAttribute('data-variant', 'swatch');
      await color.scrollIntoViewIfNeeded();
      await expect(color).toContainText('#');
      await color.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
      const palette = page.locator('[data-ui="shared.ui.color-selector.picker"]');
      await expect(palette).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(palette).toHaveCount(0);
      const animation = panel.locator('[data-section="animation"]');
      const animationHeading = animation.locator(':scope > details > summary');
      const animationField = animation
        .locator('[data-ui="shared.ui.compact-inspector.numeric-row"]')
        .first();
      await animationField.scrollIntoViewIfNeeded();
      const headingBox = (await animationHeading.boundingBox())!;
      const fieldBox = (await animationField.boundingBox())!;
      expect(fieldBox.y - headingBox.y - headingBox.height).toBeLessThanOrEqual(9);
      for (const width of [420, 280]) {
        await page
          .locator('[data-ui="video-editor.floating.context-inspector"]')
          .evaluate((node, size) => {
            (node as HTMLElement).style.width = `${size}px`;
          }, width);
        await expect
          .poll(() => panel.evaluate((node) => node.scrollWidth - node.clientWidth))
          .toBeLessThanOrEqual(1);
        await info.attach(`inspector-${width}`, {
          body: await panel.screenshot(),
          contentType: 'image/png',
        });
      }
      await page.locator('[data-ui="video-editor.viewer.scene"]').click();
      const paint = panel.locator('[data-ui="shared.ui.paint-selector"]').first();
      await expect(paint).toHaveAttribute('data-trigger-variant', 'swatch');
      const paintButton = paint.locator('[data-ui="shared.ui.paint-selector.trigger"]');
      await expect(paintButton).toContainText('#');
      await expect(paintButton.locator('.lucide-palette')).toHaveCount(1);
      await expect(paintButton).toHaveCSS('border-top-width', '0px');
      await paintButton.click();
      await expect(page.locator('[data-ui="shared.ui.paint-selector.popup"]')).toBeVisible();
      await paintButton.click();
      await expect(page.locator('[data-ui="shared.ui.paint-selector.popup"]')).toHaveCount(0);
      await page.locator(`[data-timeline-effect-segment="${motion.id}"]`).click();
      const remove = panel.locator('[data-inspector-tone="danger"]').last();
      await page.mouse.move(0, 0);
      await expect(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(remove).toHaveCSS('justify-content', 'flex-start');
      await remove.hover();
      await expect(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await info.attach('motion-inspector', {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
      await page.locator('[data-ui="video-editor.timeline.track-select"]').first().click();
      await expect(panel.locator('[data-section="general"]')).toBeVisible();
      await expect(panel.locator('[data-section="display"]')).toBeVisible();
      await expect(panel.locator('[data-section="display"] details details')).toHaveCount(0);
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await expect(panel.locator('nav button')).toHaveCount(2);
      await panel.locator('nav button').nth(1).click();
      await expect(panel.locator('[data-ui="video-editor.inspector.track-layout"]')).toBeVisible();
      await info.attach('track-inspector', {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
      await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      const remembered = panel.locator('[data-presentation="all"] > section > details').first();
      await remembered.locator(':scope > summary').click();
      await expect(remembered).not.toHaveAttribute('open', '');
      await page.locator('[data-ui="video-editor.viewer.scene"]').click();
      await expect(
        panel.locator('[data-presentation="all"] > section > details').first()
      ).toHaveAttribute('open', '');
      await page.locator(`[data-project-timeline-clip="${secondClip.id}"]`).click();
      await expect(remembered).not.toHaveAttribute('open', '');
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await expect(remembered).not.toHaveAttribute('open', '');
    });
  }
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`video camera inspector narrow geometry ${locale} ${theme}`, async ({
      page,
      hostOrigin,
    }, info) => {
      const project = createVideoProjectFromMultiSourceRecording({
        name: 'Camera inspector',
        videos: [
          {
            duration: 12,
            filename: 'screen.webm',
            height: 1080,
            mimeType: 'video/webm',
            recordingId: 'screen',
            size: 1024,
            width: 1920,
          },
        ],
        webcamVideo: {
          duration: 12,
          filename: 'camera.webm',
          height: 720,
          mimeType: 'video/webm',
          recordingId: 'camera',
          size: 512,
          width: 1280,
        },
      });
      const track = project.tracks.find((item) => item.role === 'CAMERA')!;
      const clip = project.clips.find((item) => item.trackId === track.id)!;
      await page.emulateMedia({ colorScheme: theme });
      await applyHarnessBootstrap(page, {
        apiBehavior: { runtimeFallback: 'typed-success' },
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript(
        (value) => localStorage.setItem('sniptale-locale-preference', value),
        locale
      );
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(`${hostOrigin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`);
      await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
      const panel = page.locator('[data-ui="video-editor.inspector.content"]');
      const controls = panel.locator('[data-ui="video-editor.camera-placement-controls"]');
      await expect(controls).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(
        controls.locator('[data-ui="video-editor.camera-layout-fullframe"]')
      ).toHaveAttribute('aria-label', locale === 'ru' ? 'На весь кадр' : 'Full frame');
      const nested = panel.locator('[data-ui="video-editor.inspector.disclosure"]').first();
      const nestedHeading = nested.locator(':scope > summary');
      await expect(nested).not.toHaveAttribute('open', '');
      await expect(nestedHeading).toHaveCSS('font-weight', '500');
      await expect(nestedHeading).toHaveCSS('font-size', '12px');
      await expect(nested).toHaveCSS('border-top-width', '0px');
      await nestedHeading.hover();
      await expect(nestedHeading).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const textBox = (await nestedHeading.locator('h4').boundingBox())!;
      const iconBox = (await nestedHeading.locator('svg').last().boundingBox())!;
      expect(
        Math.abs(textBox.y + textBox.height / 2 - iconBox.y - iconBox.height / 2)
      ).toBeLessThanOrEqual(1);
      await nestedHeading.press('Space');
      await expect(nested).toHaveAttribute('open', '');
      await nestedHeading.click();
      await expect(nested).not.toHaveAttribute('open', '');
      for (const width of [420, 280]) {
        await page
          .locator('[data-ui="video-editor.floating.context-inspector"]')
          .evaluate((node, size) => {
            (node as HTMLElement).style.width = `${size}px`;
          }, width);
        await expect
          .poll(() =>
            controls.evaluate((node) => {
              const bounds = node.getBoundingClientRect();
              return Math.max(
                ...[...node.querySelectorAll('button')].map(
                  (button) => button.getBoundingClientRect().right - bounds.right
                )
              );
            })
          )
          .toBeLessThanOrEqual(1);
        await info.attach(`camera-${width}`, {
          body: await panel.screenshot(),
          contentType: 'image/png',
        });
      }
      const full = controls.locator('[data-ui="video-editor.camera-layout-fullframe"]');
      await full.click();
      await expect(full).toHaveAttribute('aria-pressed', 'true');
      await full.hover();
      await expect(full).toHaveCSS('box-shadow', 'none');
      await panel
        .getByRole('navigation')
        .getByRole('button', {
          name: locale === 'ru' ? 'Стиль' : 'Style',
          exact: true,
        })
        .click();
      for (const width of [420, 380, 360, 340, 320, 280]) {
        await page
          .locator('[data-ui="video-editor.floating.context-inspector"]')
          .evaluate((node, size) => {
            (node as HTMLElement).style.width = `${size}px`;
          }, width);
        await checkInspectorLabels(panel);
        await panel.screenshot({ path: info.outputPath(`camera-style-${width}.png`) });
      }
    });
  }
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
  { width: 1100, height: 560 },
]) {
  test(`video window header controls ${viewport.width}x${viewport.height}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: 'dark' });
    const project = createEmptyVideoProject('Window header proof');
    const asset = createVideoProjectAsset(
      'Landscape',
      VideoProjectAssetType.IMAGE,
      { kind: 'recording', recordingId: 'header-image' },
      {
        width: 1280,
        height: 720,
        duration: 5,
        mimeType: 'image/svg+xml',
        size: 200,
        hasAudio: false,
        audioPeaks: null,
      }
    );
    project.assets.push(asset);
    const first = createVideoClipFromAsset(
      project.tracks[0]!.id,
      asset,
      project.width,
      project.height
    );
    const second = createVideoClipFromAsset(
      project.tracks[0]!.id,
      asset,
      project.width,
      project.height,
      6
    );
    project.clips.push(first, second);
    await applyHarnessBootstrap(page, {
      apiBehavior: { runtimeFallback: 'typed-success' },
      videoProjects: [project],
      recordings: [
        {
          id: 'header-image',
          filename: 'landscape.svg',
          mimeType: 'image/svg+xml',
          bytes:
            '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#286b8a"/><circle cx="640" cy="360" r="160" fill="#edc777"/></svg>',
        },
      ],
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'dark' },
    });
    await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
    await page.goto(`${hostOrigin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=dark`);
    await page.locator(`[data-project-timeline-clip="${first.id}"]`).click();
    const settings = page.locator('[data-ui="window-header-settings"]');
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('button', { name: 'Off', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await settings.getByRole('button', { name: 'Browser', exact: true }).click();
    const segmentGeometry = await settings.getByRole('button').evaluateAll((buttons) =>
      buttons
        .filter((button) =>
          ['Windows', 'macOS', 'Linux', 'Light', 'Dark'].includes(button.textContent ?? '')
        )
        .map((button) => {
          const css = getComputedStyle(button);
          return {
            label: button.textContent,
            height: button.getBoundingClientRect().height,
            paddingTop: css.paddingTop,
            paddingBottom: css.paddingBottom,
            lineHeight: css.lineHeight,
            fontSize: css.fontSize,
            minHeight: css.minHeight,
          };
        })
    );
    await writeFile(
      info.outputPath('window-header-segment-geometry.json'),
      JSON.stringify(segmentGeometry, null, 2)
    );
    expect(segmentGeometry).toHaveLength(5);
    for (const geometry of segmentGeometry) {
      expect(geometry.height).toBe(segmentGeometry[0]!.height);
      expect(geometry.paddingTop).toBe(segmentGeometry[0]!.paddingTop);
      expect(geometry.paddingBottom).toBe(segmentGeometry[0]!.paddingBottom);
      expect(geometry.lineHeight).toBe(segmentGeometry[0]!.lineHeight);
    }

    await settings
      .getByRole('textbox', { name: 'Tab title', exact: true })
      .fill('Full editor browser');
    await settings
      .getByRole('textbox', { name: 'Website address', exact: true })
      .fill('example.com');
    await expect(
      settings.getByRole('button', { name: 'Use website icon', exact: true })
    ).toHaveAttribute('aria-pressed', 'false');
    await settings.getByRole('button', { name: 'macOS', exact: true }).click();
    await settings.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(settings.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await settings
      .getByRole('textbox', { name: 'Website address', exact: true })
      .scrollIntoViewIfNeeded();
    await checkLocalWindowIcon(page, settings, 'en');
    await checkRenderedWindowIcon(
      page,
      page.locator('[data-preview-stage-canvas]'),
      info.outputPath('full-icon-detail.png')
    );
    await page.screenshot({ path: info.outputPath('window-header-browser.png'), fullPage: false });
    await page.locator(`[data-project-timeline-clip="${second.id}"]`).click();
    await expect(settings.getByRole('button', { name: 'Off', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.locator(`[data-project-timeline-clip="${first.id}"]`).click();
    await expect(settings.getByRole('textbox', { name: 'Tab title', exact: true })).toHaveValue(
      'Full editor browser'
    );
    await expect(
      settings.getByRole('button', { name: 'Upload icon from computer', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await settings.getByRole('button', { name: 'Application', exact: true }).click();
    await expect(
      settings.getByRole('textbox', { name: 'Website address', exact: true })
    ).toHaveCount(0);
    await expect(
      settings.getByRole('button', { name: 'Use website icon', exact: true })
    ).toHaveCount(0);
    await settings
      .getByRole('textbox', { name: 'Window title', exact: true })
      .fill('Full editor application');
    await settings.getByRole('button', { name: 'Linux', exact: true }).click();
    await settings.getByRole('button', { name: 'Dark', exact: true }).click();
    await settings
      .getByRole('textbox', { name: 'Window title', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath('window-header-application.png'),
      fullPage: false,
    });
    await expect
      .poll(() => settings.evaluate((node) => node.scrollWidth - node.clientWidth))
      .toBeLessThanOrEqual(1);
    if (viewport.width < 1280) {
      const scrollOwner = page.locator('[data-ui="video-editor.workspace.root"]');
      await expect
        .poll(() => scrollOwner.evaluate((node) => node.scrollWidth))
        .toBeGreaterThan(viewport.width);
      await scrollOwner.evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
      });
      await expect.poll(() => scrollOwner.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      await page.screenshot({
        path: info.outputPath('window-header-horizontal-scroll.png'),
        fullPage: false,
      });
    }
    await settings.getByRole('button', { name: 'Off', exact: true }).click();
    await expect(settings.getByRole('textbox')).toHaveCount(0);
  });
}
