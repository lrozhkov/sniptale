import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';

test('opaque lens live pixels match export, with identity endpoints and moving source', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents: `
 import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import {ReviewClickOverlay} from './apps/extension/src/gallery/video-review/click-animation-overlay';
 import {drawReviewClicks} from './apps/extension/src/workflows/video-review/render-click-animation';
 import {evaluateReviewClicks} from './apps/extension/src/features/video/review/click-animation';
 import {REVIEW_CLICK_DEFAULT} from './apps/extension/src/features/video/review/advanced/click-animation';
 export async function probe(){
 const source=document.createElement('canvas');source.width=400;source.height=240;
 const s=source.getContext('2d');s.fillStyle='#246';s.fillRect(0,0,400,240);s.fillStyle='#ff0000';s.fillRect(190,110,20,20);
 const rect={x:0,y:0,width:400,height:240};
 const settings={...REVIEW_CLICK_DEFAULT,effect:'magnify',radius:60,magnification:2,before:1,after:1,lensShadow:0,color:'#00000000'};
 const cue={settings,point:{x:.5,y:.5},anchor:1,start:0,end:2};
 const host=document.createElement('div');document.body.append(host);host.style='position:relative;width:400px;height:240px';const root=createRoot(host);
 const render=async(time,shape)=>{cue.settings.lensShape=shape;flushSync(()=>root.render(React.createElement(ReviewClickOverlay,{cues:[cue],time,output:rect,video:rect,sourceWidth:400,clip:{rect,radius:0},getFrame:()=>source})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return host.querySelector('canvas');};
 const samples=[];
 for(const shape of ['circle','rounded']){
  const live=await render(1,shape);const exportCanvas=document.createElement('canvas');exportCanvas.width=400;exportCanvas.height=240;document.body.append(exportCanvas);
  drawReviewClicks(exportCanvas.getContext('2d'),evaluateReviewClicks([cue],1),rect,400,{rect,radius:0},{draw:(c,x,y,w,h)=>c.drawImage(source,x,y,w,h)});
  const a=live.getContext('2d').getImageData(0,0,400,240).data,b=exportCanvas.getContext('2d').getImageData(0,0,400,240).data;
  samples.push({mismatch:a.reduce((n,v,i)=>n+(v!==b[i]),0),enlarged:Array.from(live.getContext('2d').getImageData(184,120,1,1).data)});
 }
 s.fillStyle='#00ff00';s.fillRect(190,110,20,20);const updated=await render(1,'circle');const current=Array.from(updated.getContext('2d').getImageData(200,120,1,1).data);
 const identity=await render(0,'circle');const alpha=identity.getContext('2d').getImageData(200,120,1,1).data[3];
 root.unmount();return {samples,current,alpha};}
 `,
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
  for (const sample of result.samples) {
    expect(sample.mismatch).toBe(0);
    expect(sample.enlarged).toEqual([255, 0, 0, 255]);
  }
  expect(result.current).toEqual([0, 255, 0, 255]);
  expect(result.alpha).toBe(0);
  await page.screenshot({ path: info.outputPath('lens-pixels.png'), fullPage: false });
});

for (const [width, height, locale, theme] of [
  [1280, 560, 'ru', 'dark'],
  [1920, 900, 'en', 'light'],
] as const) {
  test(`lens controls and persistence ${width}`, async ({ page }, info) => {
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
              id: 'lens-click',
              kind: 'CLICK',
              time: 1,
              duration: 0,
              point: { x: 80, y: 45 },
              recordingPoint: { x: 0.5, y: 0.5 },
              label: 'Save',
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
        page.locator('dialog').getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      const marker = page.locator('[data-ui="gallery.videoReview.historyStrip"] button').first();
      await marker.click();
      await button('gallery.videoReview.clickEffect').click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.click_magnify'), exact: true })
        .click();
      await page
        .locator('[data-ui="gallery.videoReview.clickFields"] summary')
        .filter({ hasText: label('gallery.videoReview.clickAppearance') })
        .click();
      const amount = page.getByRole('textbox', {
        name: label('gallery.videoReview.clickMagnification'),
        exact: true,
      });
      await expect(amount).toHaveValue('1.6');
      await amount.fill('2');
      await amount.press('Enter');
      await expect(page.locator('[data-ui="gallery.videoReview.clickAnimation"]')).toBeVisible();
      await amount.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('lens-inspector.png'), fullPage: false });
      await button('common.actions.close').click();
      await expect(page.locator('[data-ui="gallery.videoReview.enter"]')).toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await marker.click();
      const appearance = page
        .locator('[data-ui="gallery.videoReview.clickFields"] details')
        .filter({
          has: page.getByRole('heading', {
            name: label('gallery.videoReview.clickAppearance'),
            exact: true,
          }),
        });
      if (!(await appearance.evaluate((node) => (node as HTMLDetailsElement).open)))
        await appearance.locator('summary').click();
      await expect(amount).toHaveValue('2');
    } finally {
      await new Promise<void>((r) => host.server.close(() => r()));
    }
  });
}
