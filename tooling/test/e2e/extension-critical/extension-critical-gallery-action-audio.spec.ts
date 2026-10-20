import { chooseInspectorValue } from '../support/inspector-utilities';
import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { ACTION_SOUND_CATALOG } from '../../../../apps/extension/src/features/video/review/action-audio-catalog';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo, clickReviewExport } from '../support/quick-editor-media-fixture';
import { seedActionAudioFacts } from '../support/action-audio-fixture';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { persistedReviewContent } from '../support/voiceover-speech-fixture';

async function probeText() {
  const result = await build({
    entryPoints: ['tooling/test/e2e/support/action-audio-native-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.woff2': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  });
  return result.outputFiles[0]!.text;
}

test('all bundled action sounds decode at native rate with exact PCM and bounded peaks', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    const result = await page.evaluate(
      async (text) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try {
          return (await import(url)).samples();
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      await probeText()
    );
    await writeFile(info.outputPath('action-native-samples.json'), JSON.stringify(result, null, 2));
    expect(result.map((sample) => sample.id).sort()).toEqual(
      Object.keys(ACTION_SOUND_CATALOG).sort()
    );
    for (const sample of result) {
      const expected = Object.entries(ACTION_SOUND_CATALOG).find(([id]) => id === sample.id)?.[1];
      expect(expected).toBeDefined();
      expect(sample).toMatchObject({
        frames: expected!.durationFrames,
        rate: 44100,
        channels: 1,
        error: 0,
      });
      expect(sample.peak).toBeLessThanOrEqual(0.5);
    }
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('native action tails and typing retain PCM phase across export windows', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    const result = await page.evaluate(
      async (text) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try {
          const probe = await import(url),
            results = [];
          for (const kind of ['plain', 'half', 'double', 'cut', 'fragment', 'bookends'])
            results.push(await probe.nativeWindows(kind));
          return results;
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      await probeText()
    );
    await writeFile(info.outputPath('action-native-windows.json'), JSON.stringify(result, null, 2));
    for (const item of result) {
      expect(item.maximumError, item.kind).toBeLessThan(0.0001);
      expect(item.snr, item.kind).toBeGreaterThan(80);
      expect(item.bufferCount).toBeLessThanOrEqual(10);
      expect(item.bookendsSilent).toBe(true);
    }
    expect(result[0]!.frames).toBe(96000);
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`typed action audio inspector persists family batches and Undo/Redo at ${viewport.width}`, async ({
    page,
  }, info) => {
    const host = await startHostServer(),
      locale = viewport.width === 1280 ? 'ru' : 'en';
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    try {
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        let starts = 0;
        const active = new Set<AudioBufferSourceNode>();
        const originalStart = AudioBufferSourceNode.prototype.start;
        const originalStop = AudioBufferSourceNode.prototype.stop;
        AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
          originalStart.call(this, when, offset, duration);
          if (this.buffer?.sampleRate === 44100) {
            starts++;
            active.add(this);
            this.addEventListener('ended', () => active.delete(this), { once: true });
          }
        };
        AudioBufferSourceNode.prototype.stop = function (when = 0) {
          originalStop.call(this, when);
          if (when <= this.context.currentTime) active.delete(this);
        };
        Object.defineProperty(window, 'actionAudioNativeProbe', {
          value: () => ({ starts, active: active.size }),
        });
      });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': locale === 'ru' ? 'light' : 'dark',
        },
      });
      await page.goto(
        `${host.origin}${GALLERY_HARNESS_PATH}?theme=${locale === 'ru' ? 'light' : 'dark'}`
      );
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      const container = viewport.width === 1280 ? 'mp4' : 'webm';
      const fixtureName = container === 'mp4' ? 'review-avc-aac.mp4' : 'review-vp8-opus.webm';
      const text = await probeText();
      const silent = await page.evaluate(
        async ({ text, encoded, container }) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          try {
            return await (await import(url)).silentSource(encoded, container);
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        {
          text,
          encoded: (
            await readFile(new URL(`../fixtures/${fixtureName}`, import.meta.url))
          ).toString('base64'),
          container,
        }
      );
      expect(silent.index.audioCodec).toBeNull();
      await seedReviewVideo(
        page,
        fixtureName,
        { width: 160, height: 90, duration: silent.index.duration },
        false,
        false,
        {
          bytes: Buffer.from(silent.encoded, 'base64'),
          mimeType: container === 'mp4' ? 'video/mp4' : 'video/webm',
        }
      );
      await seedActionAudioFacts(page);
      await page.reload();
      await open(page);
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await expect.poll(async () => (await persistedReviewContent(page))?.zoom.enabled).toBe(true);
      await button('gallery.videoReview.scene').click();
      const presentation = dialog.locator('[data-ui="gallery.videoReview.presentationInspector"]');
      for (const key of [
        'gallery.videoReview.presentationIntro',
        'gallery.videoReview.presentationOutro',
      ] as const) {
        await presentation
          .locator(`section[aria-label="${label(key)}"]`)
          .getByRole('button', {
            name: label('gallery.videoReview.presentationNoEffect'),
            exact: true,
          })
          .click();
        await expect(presentation).toHaveAttribute('aria-busy', 'false');
      }
      await expect
        .poll(async () => (await persistedReviewContent(page))?.presentation?.outroControl?.mode)
        .toBe('none');
      const before = (await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))!;
      await button('gallery.videoReview.historyOpen').click();
      const history = dialog.locator('[data-ui="gallery.videoReview.actionHistory"]');
      await expect(history.locator('li')).toHaveCount(3);
      await expect(history.locator('li input[type="checkbox"]')).toHaveCount(3);
      await history
        .getByRole('checkbox', { name: label('gallery.videoReview.historySelectAll'), exact: true })
        .check();
      await history
        .getByRole('button', { name: label('gallery.videoReview.historyConfigure'), exact: true })
        .click();
      const audio = history.locator('[data-ui="gallery.videoReview.actionAudioFields"]');
      if (!(await audio.isVisible()))
        await history
          .getByRole('button', { name: label('gallery.videoReview.actionAudio'), exact: true })
          .click();
      await audio.scrollIntoViewIfNeeded();
      await expect(
        audio.getByRole('button', {
          name: label('gallery.videoReview.actionAudioEnabled'),
          exact: false,
        })
      ).toHaveCount(0);
      for (const [family, preset] of [
        ['mouse', 'gallery.videoReview.actionAudioMouseClassic'],
        ['keyboard', 'gallery.videoReview.actionAudioKeyboardNatural'],
        ['typing', 'gallery.videoReview.actionAudioTypingNatural'],
      ] as const) {
        const row = audio.locator(`[data-family="${family}"]`);
        const choiceName = await row
          .locator('[data-audio-choice-row] [aria-label]')
          .first()
          .getAttribute('aria-label');
        await chooseInspectorValue(page, row, choiceName!, label(preset));
        const listen = row.getByRole('button', {
          name: label('gallery.videoReview.actionAudioListen'),
          exact: true,
        });
        await expect(listen).toBeEnabled();
        const choiceBox = (await row
          .locator('[data-audio-choice-row]')
          .locator('.sniptale-property-choice')
          .boundingBox())!;
        const listenBox = (await listen.boundingBox())!;
        expect(listenBox.x).toBeGreaterThanOrEqual(choiceBox.x + choiceBox.width);
        expect(
          Math.abs(choiceBox.y + choiceBox.height / 2 - listenBox.y - listenBox.height / 2)
        ).toBeLessThanOrEqual(1);
      }
      for (const [key, minimum, maximum] of [
        ['gallery.videoReview.actionAudioVolume', '0', '100'],
        ['gallery.videoReview.actionAudioOffset', '-2', '2'],
      ] as const) {
        const number = audio.getByRole('textbox', { name: label(key), exact: true });
        const row = number.locator(
          'xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.numeric-row"][1]'
        );
        await row.hover();
        const slider = row.locator('input[type="range"]');
        await expect(slider).toBeVisible();
        await expect(slider).toHaveAttribute('min', minimum);
        await expect(slider).toHaveAttribute('max', maximum);
      }
      await expect
        .poll(async () => (await persistedReviewContent(page))?.actionAudio?.length)
        .toBe(3);
      const saved = (await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))!;
      const content = (await persistedReviewContent(page))!;
      expect(content.actionAudio?.map((item) => item.ref)).toEqual([
        { kind: 'action', id: 'key' },
        { kind: 'action', id: 'same' },
        { kind: 'signal', id: 'same' },
      ]);
      expect(content.audio.voiceover).toEqual([]);
      expect(content.audio.music).toEqual([]);
      const configured = await page.evaluate(
        async ({ text, index, advanced }) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          try {
            return (await import(url)).configuredPlan(index, advanced);
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { text, index: silent.index, advanced: { ...content, ui: saved.advanced.ui } }
      );
      await writeFile(
        info.outputPath('configured-action-export.json'),
        JSON.stringify({ ...configured, index: silent.index, advanced: content }, null, 2)
      );
      expect(configured.plan).toMatchObject({ kind: 'ready', video: 'copy', audio: 'process' });
      expect(saved.history.slice(before.history.length)).toMatchObject(
        Array.from({ length: 3 }, () => ({ target: 'advancedContent' }))
      );
      await page.screenshot({ path: info.outputPath('mixed-action-audio.png'), fullPage: false });
      const video = dialog.locator('[data-ui="gallery.videoReview.stage"] video');
      const probe = () =>
        page.evaluate(() => {
          const read = Reflect.get(window, 'actionAudioNativeProbe');
          if (typeof read !== 'function') throw new Error('Native schedule probe is missing.');
          return read();
        });
      if (viewport.width === 1920) {
        let missingRequests = 0;
        page.on('requestfailed', (request) => {
          if (request.url().includes('/action-sounds/v1/')) missingRequests++;
        });
        await page.route('**/action-sounds/v1/**', (route) => route.abort());
        await audio
          .locator('[data-family="mouse"]')
          .getByRole('button', {
            name: label('gallery.videoReview.actionAudioListen'),
            exact: true,
          })
          .click();
        await expect(
          dialog
            .locator('p[role="status"]')
            .filter({ hasText: label('gallery.videoReview.actionAudioResource') })
        ).toBeVisible();
        await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
        await expect.poll(() => missingRequests).toBeGreaterThanOrEqual(2);
        await expect(
          dialog
            .getByRole('status')
            .filter({ hasText: label('gallery.videoReview.actionAudioResource') })
        ).toBeVisible();
        expect((await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))!.cursor).toBe(
          saved.cursor
        );
        await page.unroute('**/action-sounds/v1/**');
        await button('gallery.videoReview.historyOpen').click();
      }
      const listen = audio
        .locator('[data-family="mouse"]')
        .getByRole('button', { name: label('gallery.videoReview.actionAudioListen'), exact: true });
      await listen.focus();
      await listen.press('Enter');
      await expect.poll(async () => (await probe()).starts).toBeGreaterThan(0);
      expect(await video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
      expect((await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))!.cursor).toBe(
        saved.cursor
      );
      await button('gallery.videoReview.play').click();
      await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(false);
      await button('gallery.videoReview.pause').click();
      await expect.poll(async () => (await probe()).active).toBe(0);
      const download = page.waitForEvent('download');
      await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
      const output = (await readFile(await (await download).path())).toString('base64');
      const exported = await page.evaluate(
        async ({ text, source, output }) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          try {
            return await (await import(url)).inspectActionExport(source, output);
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { text, source: silent.encoded, output }
      );
      expect(exported.outputPackets).toEqual(exported.sourcePackets);
      expect(exported.index.audioCodec).toBe(silent.index.outputAudioCodecs?.[container]);
      expect(exported.mouseEnergy).toBeGreaterThan(0.01);
      expect(exported.typingEnergy).toBeGreaterThan(0.1);
      expect(exported.keyEnergy).toBeGreaterThan(0.01);
      expect(exported.silenceEnergy).toBeLessThan(0.0001);
      expect(exported.peak).toBeLessThan(0.65);
      await writeFile(
        info.outputPath('action-export-proof.json'),
        JSON.stringify(
          {
            ...exported,
            sourcePackets: undefined,
            outputPackets: undefined,
            identicalVideoPackets: true,
          },
          null,
          2
        )
      );
      for (let count = 1; count <= 3; count += 1) {
        await button('gallery.videoReview.undo').click();
        await expect
          .poll(
            async () =>
              (await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))?.cursor
          )
          .toBe(saved.cursor - count);
      }
      expect((await persistedReviewContent(page))?.actionAudio).toBeUndefined();
      for (let count = 1; count <= 3; count += 1) {
        await button('gallery.videoReview.redo').click();
        await expect
          .poll(
            async () =>
              (await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))?.cursor
          )
          .toBe(saved.cursor - 3 + count);
      }
      await page.reload();
      await expect(page.locator('[data-ui="gallery.videoReview.dialog"]')).toBeVisible();
      expect((await persistedReviewContent(page))?.actionAudio).toEqual(content.actionAudio);
      if (viewport.width === 1920) {
        await button('gallery.videoReview.historyOpen').click();
        await history
          .locator('li')
          .filter({ hasText: 'Point-free click' })
          .getByRole('button')
          .first()
          .click();
        const single = dialog.locator('[data-ui="gallery.videoReview.actionAudioFields"]:visible');
        await expect(single.locator('[data-family]')).toHaveCount(1);
        const inspector = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
        const scroll = inspector.locator('.review-inspector-scroll');
        const handle = inspector.locator('[data-review-panel-resize="inspector"]');
        const width = () =>
          scroll.evaluate(
            (node) =>
              node.clientWidth -
              parseFloat(getComputedStyle(node).paddingLeft) -
              parseFloat(getComputedStyle(node).paddingRight)
          );
        for (const target of [523, 524, 525]) {
          const current = await width(),
            box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + 20);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + current - target, box.y + 20, { steps: 4 });
          await page.mouse.up();
          await expect.poll(width).toBe(target);
          await single
            .getByRole('button', {
              name: label('gallery.videoReview.actionAudioReset'),
              exact: true,
            })
            .scrollIntoViewIfNeeded();
          await expect(
            single.getByRole('button', {
              name: label('gallery.videoReview.actionAudioReset'),
              exact: true,
            })
          ).toBeInViewport();
          await page.screenshot({
            path: info.outputPath(`single-audio-${target}.png`),
            fullPage: false,
          });
        }
        await page.setViewportSize({ width: 1200, height: 560 });
        const horizontal = dialog.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
        expect(await horizontal.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await single.scrollIntoViewIfNeeded();
        await expect(
          single.getByRole('button', {
            name: label('gallery.videoReview.actionAudioReset'),
            exact: true,
          })
        ).toBeInViewport();
        await page.screenshot({
          path: info.outputPath('single-audio-horizontal-1200.png'),
          fullPage: false,
        });
      }
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

async function open(page: Page) {
  await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
  await page.locator('[data-ui="gallery.videoReview.enter"]').click();
}
