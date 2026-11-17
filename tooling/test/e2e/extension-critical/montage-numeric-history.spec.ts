import { expect, test } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { isHydratableVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { createTextClip } from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Montage numeric gestures create separate history actions ${viewport.name}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize(viewport.size);
      const project = createEmptyVideoProject('Montage history');
      project.duration = 12;
      const clip = createTextClip(project.tracks[0]!.id, project.width, project.height, 0);
      clip.name = 'Caption';
      clip.text = 'Montage history';
      clip.duration = 12;
      clip.style.fontSize = 40;
      clip.fadeInMs = 1000;
      clip.playbackWindow = {
        offset: 0.5,
        holdAt: 12,
        fadePhase: { offset: 0.5, duration: 14 },
        gainPhase: { offset: 0.5, duration: 14 },
      };
      project.version = 43;
      project.clips = [clip];
      expect(isHydratableVideoProject(project)).toBe(true);
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`);
      await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
      const navigation = page.getByRole('navigation', { name: 'Project inspector' });
      const undo = page.locator('[data-ui="video-editor.timeline.toolbar.undo"]');
      const redo = page.locator('[data-ui="video-editor.timeline.toolbar.redo"]');
      await navigation.getByRole('button', { name: 'Style', exact: true }).click();
      const draftSize = page.getByRole('textbox', { name: 'Size', exact: true });
      const weight = page.getByRole('textbox', { name: 'Weight', exact: true });
      await draftSize.fill('80');
      await weight.hover();
      await page.getByRole('button', { name: 'Weight increase', exact: true }).hover();
      await page.mouse.down();
      await expect.poll(async () => Number(await weight.inputValue())).toBeGreaterThan(600);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(weight).toHaveValue('600');
      await expect(draftSize).toHaveValue('80');
      await expect(undo).toBeEnabled();
      await undo.click();
      await expect(draftSize).toHaveValue('40');
      for (const field of [
        { section: 'Style', label: 'Size' },
        { section: 'Placement', label: 'Rotation' },
      ]) {
        await navigation.getByRole('button', { name: field.section, exact: true }).click();
        const input = page.getByRole('textbox', { name: field.label, exact: true });
        const increase = page.getByRole('button', { name: `${field.label} increase`, exact: true });
        const original = Number(await input.inputValue());
        if (field.label === 'Size') {
          const stage = page.locator('[data-ui="video.preview.stage.root"]');
          const before = await stage.screenshot();
          await input.hover();
          const range = page.getByRole('slider', { name: 'Size range', exact: true });
          const box = await range.boundingBox();
          if (!box) throw new Error('Missing Size range geometry');
          await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
          await expect.poll(async () => Number(await input.inputValue())).toBeGreaterThan(90);
          await expect.poll(async () => (await stage.screenshot()).equals(before)).toBe(false);
          const during = await stage.screenshot();
          await page.screenshot({
            path: info.outputPath('live-range-preview.png'),
            fullPage: false,
          });
          await page.mouse.up();
          await expect.poll(async () => (await stage.screenshot()).equals(during)).toBe(true);
          await undo.click();
          await expect(input).toHaveValue(String(original));
        }
        await input.hover();
        await increase.hover();
        await page.mouse.down();
        await expect
          .poll(async () => Number(await input.inputValue()))
          .toBeGreaterThanOrEqual(original + 3);
        await expect(undo).toBeDisabled();
        if (field.label === 'Size' && viewport.name === '1920x900')
          await page.screenshot({
            path: info.outputPath('live-text-preview.png'),
            fullPage: false,
          });
        await page.mouse.up();
        const first = Number(await input.inputValue());
        await input.hover();
        await increase.hover();
        await page.mouse.down();
        await page.mouse.up();
        await expect(input).toHaveValue(String(first + 1));
        await undo.click();
        await expect(input).toHaveValue(String(first));
        await undo.click();
        await expect(input).toHaveValue(String(original));
        await redo.click();
        await expect(input).toHaveValue(String(first));
        await redo.click();
        await expect(input).toHaveValue(String(first + 1));
        await undo.click();
        await input.hover();
        await increase.hover();
        await page.mouse.down();
        await expect.poll(async () => Number(await input.inputValue())).toBeGreaterThan(first + 1);
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(input).toHaveValue(String(first));
        await expect(redo).toBeEnabled();
        await redo.click();
        await expect(input).toHaveValue(String(first + 1));
        await undo.click();
        await input.hover();
        await increase.hover();
        await page.mouse.down();
        await page.mouse.up();
        await expect(input).toHaveValue(String(first + 1));
        await expect(redo).toBeDisabled();
        await undo.click();
        await expect(input).toHaveValue(String(first));
        await page.screenshot({
          path: info.outputPath(`${field.label.toLowerCase()}-history.png`),
          fullPage: false,
        });
      }
      await navigation.getByRole('button', { name: 'Style', exact: true }).click();
      const size = page.getByRole('textbox', { name: 'Size', exact: true });
      const sizeIncrease = page.getByRole('button', { name: 'Size increase', exact: true });
      const beforeTab = Number(await size.inputValue());
      await size.hover();
      await sizeIncrease.hover();
      await page.mouse.down();
      await expect
        .poll(async () => Number(await size.inputValue()))
        .toBeGreaterThanOrEqual(beforeTab + 3);
      await page.keyboard.press('Tab');
      const acceptedTab = await size.inputValue();
      await expect(undo).toBeEnabled();
      const title = page.getByRole('textbox', { name: 'Video editor', exact: true });
      await title.fill('Next field edit');
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(title).toHaveValue('Next field edit');
      await expect(size).toHaveValue(acceptedTab);
      await undo.click();
      await expect(title).toHaveValue('Montage history');
      await expect(size).toHaveValue(acceptedTab);
      await undo.click();
      await expect(size).toHaveValue(String(beforeTab));
      await navigation.getByRole('button', { name: 'Animation', exact: true }).click();
      const fade = page.getByRole('textbox', { name: 'Fade in', exact: true });
      const fadeIncrease = page.getByRole('button', { name: 'Fade in increase', exact: true });
      const stage = page.locator('[data-ui="video.preview.stage.root"]');
      await expect(fade).toHaveValue('1');
      await expect(redo).toBeEnabled();
      const beforeFade = await stage.screenshot();
      await fade.hover();
      await fadeIncrease.hover();
      await page.mouse.down();
      await expect.poll(async () => Number(await fade.inputValue())).toBeGreaterThanOrEqual(1.15);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(fade).toHaveValue('1');
      await expect(redo).toBeEnabled();
      await expect.poll(async () => (await stage.screenshot()).equals(beforeFade)).toBe(true);
      await page.screenshot({ path: info.outputPath('cancelled-fade-clock.png'), fullPage: false });
      await redo.click();
      await expect(fade).toHaveValue('1');
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
