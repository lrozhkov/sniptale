import { chooseInspectorValue } from '../support/inspector-utilities';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';

for (const [width, height, locale, theme] of [
  [1280, 560, 'ru', 'dark'],
  [1920, 900, 'en', 'light'],
  [960, 560, 'en', 'dark'],
] as const) {
  test(`keyboard caption controls and persistence ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.evaluate(async (fixture) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open(fixture.databaseName);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        const tx = db.transaction('recording_telemetry', 'readwrite');
        tx.objectStore('recording_telemetry').put({
          recordingId: fixture.records.recordings[0]!.id,
          captureMode: 'TAB',
          createdAt: 1,
          updatedAt: 1,
          viewport: null,
          cursorTrack: null,
          signals: [],
          actionEvents: [
            {
              id: 'key-command',
              kind: 'KEY',
              time: 1,
              duration: 0,
              point: null,
              label: 'Ctrl+C',
              data: {},
              preset: 'NONE',
            },
          ],
        });
        await new Promise<void>((r, j) => {
          tx.oncomplete = () => r();
          tx.onabort = () => j(tx.error);
        });
        db.close();
      }, betaV1Fixture);
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const button = (key: Parameters<typeof translate>[0]) =>
        page.getByRole('dialog').getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      const marker = page.locator('[data-ui="gallery.videoReview.historyStrip"] button').first();
      await marker.click();
      await chooseInspectorValue(
        page,
        page.getByRole('dialog'),
        label('gallery.videoReview.keyDisplay'),
        label('gallery.videoReview.keyCaption')
      );
      const appearance = page
        .getByRole('dialog')
        .locator('nav')
        .getByRole('button', { name: label('gallery.videoReview.clickAppearance'), exact: true });
      if (await appearance.count()) await appearance.click();
      const amount = page.getByRole('textbox', {
        name: label('gallery.videoReview.key_fontSize'),
        exact: true,
      });
      await expect(amount).toHaveValue('24');
      await amount.fill('32');
      await amount.press('Enter');
      await expect(page.locator('[data-ui="gallery.videoReview.keyAnimation"]')).toBeVisible();
      await page.locator('[data-ui="gallery.videoReview.stage"] video').evaluate((element) => {
        const video = element as HTMLVideoElement;
        video.currentTime = 1.3;
        video.dispatchEvent(new Event('timeupdate'));
      });
      await expect
        .poll(() =>
          page.locator('[data-ui="gallery.videoReview.keyAnimation"]').evaluate((element) => {
            const canvas = element as HTMLCanvasElement;
            return canvas
              .getContext('2d')!
              .getImageData(0, 0, canvas.width, canvas.height)
              .data.some((value) => value > 0);
          })
        )
        .toBe(true);
      const effects = button('gallery.videoReview.historyEffectsEnabled');
      const hasCaption = () =>
        page.locator('[data-ui="gallery.videoReview.keyAnimation"]').evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          return canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height)
            .data.some((value) => value > 0);
        });
      await effects.click();
      await expect(effects).toHaveAttribute('aria-pressed', 'false');
      await expect(marker).toBeVisible();
      await expect.poll(hasCaption).toBe(false);
      await page.screenshot({
        path: info.outputPath('history-disabled-lane.png'),
        fullPage: false,
      });
      await effects.click();
      await expect.poll(hasCaption).toBe(true);
      await button('gallery.videoReview.trackSettings').click();
      await page.locator('[data-review-header-track="actions"] [role="switch"]').click();
      await button('gallery.videoReview.trackSettings').click();
      await expect(marker).toHaveCount(0);
      await expect.poll(hasCaption).toBe(false);
      await button('gallery.videoReview.trackSettings').click();
      await page.locator('[data-review-header-track="actions"] [role="switch"]').click();
      await button('gallery.videoReview.trackSettings').click();
      await expect(marker).toBeVisible();
      await expect(effects).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(hasCaption).toBe(true);
      await marker.click();
      await amount.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('keyboard-inspector.png'), fullPage: false });
      await button('gallery.videoReview.keyReset').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('keyboard-footer.png'), fullPage: false });
      await button('common.actions.close').click();
      await expect(page.locator('[data-ui="gallery.videoReview.enter"]')).toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await button('gallery.preview.openInEditor').click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
        )
        .toBe(1);
      const [tab] = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
      const target = new URL(tab!.url!);
      expect(target.searchParams.get('mediaId')).toBe(betaV1Fixture.records.media_library[0]!.id);
      expect(target.searchParams.get('mode')).toBe('edit');
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}${target.search}`);
      await expect(button('gallery.videoReview.advancedEditing')).toBeVisible();
      await marker.click();
      await expect(amount).toHaveValue('32');
    } finally {
      await new Promise<void>((r) => host.server.close(() => r()));
    }
  });
}

test('keyboard preview pixels match the export painter and latest command replaces older labels', async ({
  page,
}) => {
  const { build } = await import('esbuild');
  const bundle = await build({
    stdin: {
      contents:
        "\n    import React from 'react';import {createRoot} from 'react-dom/client';i" +
        "mport {flushSync} from 'react-dom';\n    import {ReviewKeyOverlay} from './ap" +
        "ps/extension/src/gallery/video-review/key-animation-overlay';\n    import {dr" +
        "awReviewKeys} from './apps/extension/src/workflows/video-review/render-key-a" +
        "nimation';\n    import {REVIEW_KEY_DEFAULT} from './apps/extension/src/featur" +
        "es/video/project/action-feedback/key-animation';\n    export async function probe(){\n" +
        '      const output={width:640,height:360,x:100,y:50};\n      const style={...' +
        "REVIEW_KEY_DEFAULT.style,fontSize:60,entrance:'none'};\n      const cues=[{la" +
        "bel:'Ctrl+C',start:0,end:4,settings:{...REVIEW_KEY_DEFAULT,enabled:true,styl" +
        "e}},\n        {label:'Ctrl+V',start:1,end:2,settings:{...REVIEW_KEY_DEFAULT,e" +
        "nabled:true,style}}];\n      const host=document.createElement('div');documen" +
        't.body.append(host);const root=createRoot(host);\n      flushSync(()=>root.re' +
        'nder(React.createElement(ReviewKeyOverlay,{cues,time:1.5,output})));\n      a' +
        'wait new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));\n  ' +
        "    const live=host.querySelector('canvas');const exported=document.createEl" +
        "ement('canvas');exported.width=640;exported.height=360;\n      drawReviewKeys" +
        "(exported.getContext('2d'),cues,1.5,{width:640,height:360});\n      const a=l" +
        "ive.getContext('2d').getImageData(0,0,640,360).data,b=exported.getContext('2" +
        "d').getImageData(0,0,640,360).data;\n      const mismatch=a.reduce((n,v,i)=>n" +
        '+(v!==b[i]),0), visible=a.some(v=>v>0);\n      const labels=[];const ctx=expo' +
        "rted.getContext('2d');ctx.fillText=(label)=>labels.push(label);\n      drawRe" +
        'viewKeys(ctx,cues,1.5,output);drawReviewKeys(ctx,cues,2.5,output);\n      roo' +
        't.unmount();return {mismatch,visible,labels};\n    }',
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const result = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return await (await import(url)).probe();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  expect(result).toEqual({ mismatch: 0, visible: true, labels: ['Ctrl+V'] });
});
