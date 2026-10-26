import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { writeFile } from 'node:fs/promises';

test('scene lenses stay centered and clip naturally at every frame edge', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/optical-lens-render-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const results = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return (await import(url)).lensEdgeProbe();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('lens-edge-pixels.json'), JSON.stringify(results, null, 2));
  expect(results).toHaveLength(36);
  for (const row of results) {
    expect(row.maximum, JSON.stringify(row)).toBe(0);
    expect(row.outsideChanged, JSON.stringify(row)).toBe(0);
    expect(row.insideChanged, JSON.stringify(row)).toBeGreaterThan(0);
    if (row.shape === 'circle') {
      expect(row.opening.width).toBe(row.opening.height);
      expect(row.radius).toBe(row.opening.width / 2);
    }
  }
  await page.screenshot({ path: info.outputPath('lens-edge-clipping.png'), fullPage: false });
});

test('managed magnify matches shared export composition through spatial and fragment dissolve', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/click-lens-render-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.woff2': 'dataurl', '.svg': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const results = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      const module: typeof import('../support/click-lens-render-probe') = await import(url);
      return await module.probe();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(
    info.outputPath('lens-render-allocations.json'),
    JSON.stringify(results, null, 2)
  );
  expect(results).toHaveLength(5);
  for (const result of results) {
    expect(result.parity, result.mode).toEqual({ maximum: 0, changed: 0 });
    expect(result.headerWidth, result.mode).toBe(result.mode === 'header-off' ? null : 640);
    expect(result.peak, result.mode).toBeGreaterThan(0);
    expect(result.peak, result.mode).toBeLessThanOrEqual(result.budget);
    expect(result.remaining, result.mode).toBe(0);
  }
  await page.screenshot({ path: info.outputPath('lens-render-flat-reduced.png'), fullPage: false });
  await page.locator('body > div').last().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('lens-render-spatial-fragment.png'),
    fullPage: false,
  });
});

test('magnify joins native-density header and video in both live and scene rendering', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {flushSync} from 'react-dom';
        import {ReviewClickOverlay} from './apps/extension/src/gallery/video-review/click-animation-overlay';
        import {drawReviewClicks} from './apps/extension/src/workflows/video-review/render-click-animation';
        import {drawReviewSceneFrame} from './apps/extension/src/workflows/video-review/scene-frame';
        import {evaluateReviewClicks} from './apps/extension/src/features/video/review/click-animation';
        import {REVIEW_CLICK_DEFAULT} from './apps/extension/src/features/video/review/advanced/click-animation';
        export async function probe() {
          const source=document.createElement('canvas'); source.width=800; source.height=400;
          const video=source.getContext('2d'); video.fillStyle='#0022ff'; video.fillRect(0,0,800,400);
          for(let x=360;x<440;x++) {video.fillStyle=x%2?'#fff':'#000';video.fillRect(x,40,1,300);}
          const header=document.createElement('canvas');header.width=800;header.height=80;
          const h=header.getContext('2d');h.fillStyle='#ff0000';h.fillRect(0,0,800,80);
          h.fillStyle='#00ff00';h.fillRect(0,76,800,4);
          const windowRect={x:0,y:0,width:400,height:240};
          const videoRect={x:0,y:40,width:400,height:200};
          const output=document.createElement('canvas');output.width=400;output.height=240;
          const settings={...REVIEW_CLICK_DEFAULT,effect:'magnify',radius:120,magnification:2,
            before:1,after:1,lensShadow:0,color:'#00000000'};
          const cue={settings,point:{x:.5,y:.025},anchor:1,start:0,end:2};
          const host=document.createElement('div');document.body.append(host);
          host.style='position:relative;width:400px;height:240px';const root=createRoot(host);
          const sample={draw:(c,x,y,w,h)=>c.drawImage(source,x,y,w,h)};
          const results=[];
          for(const shape of ['circle','rounded']) {
            cue.settings.lensShape=shape;
            flushSync(()=>root.render(React.createElement(ReviewClickOverlay,{cues:[cue],time:1,
              output:windowRect,video:videoRect,sourceWidth:800,clip:{rect:windowRect,radius:0},
              headerImage:header,window:{videoRect,windowRect},getFrame:()=>source})));
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            const live=host.querySelector('canvas').getContext('2d');
            const pixels=c=>[33,36].map(y=>Array.from(c.getImageData(200,y,1,1).data));
            const context=output.getContext('2d');context.clearRect(0,0,400,240);
            drawReviewSceneFrame(context,{canvas:output,
              layout:{videoRect,windowRect,videoTransform:videoRect},background:{enabled:false},
              image:null,headerImage:header,sample,windowRasterBacking:{width:800,height:480},
              drawOverlays:raster=>drawReviewClicks(context,evaluateReviewClicks([cue],1),
                videoRect,800,{rect:windowRect,radius:0},{rect:windowRect,
                  draw:(c,x,y,w,h)=>c.drawImage(raster.image,0,0,raster.width,raster.height,x,y,w,h)})});
            results.push({shape,live:pixels(live),scene:pixels(context)});
          }
          cue.point.y=.5;
          flushSync(()=>root.render(React.createElement(ReviewClickOverlay,{cues:[cue],time:1,
            output:windowRect,video:videoRect,sourceWidth:800,clip:{rect:windowRect,radius:0},
            headerImage:header,window:{videoRect,windowRect},getFrame:()=>source})));
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          const live=host.querySelector('canvas').getContext('2d');
          const density=[200,201,202,203].map(x=>live.getImageData(x,140,1,1).data[0]);
          root.unmount();document.body.append(output);return {results,density};
        }
      `,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.woff2': 'dataurl' },
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
  for (const row of result.results) {
    expect(row.live, row.shape).toEqual([
      [0, 255, 0, 255],
      [0, 34, 255, 255],
    ]);
    expect(row.scene, row.shape).toEqual(row.live);
  }
  expect(result.density).toEqual([0, 255, 0, 255]);
  await page.screenshot({ path: info.outputPath('joined-lens-seam.png'), fullPage: false });
});

test('opaque lens live pixels match export, with identity endpoints and moving source', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents:
        "\n import React from 'react';import {createRoot} from 'react-dom/client';impo" +
        "rt {flushSync} from 'react-dom';\n import {ReviewClickOverlay} from './apps/e" +
        "xtension/src/gallery/video-review/click-animation-overlay';\n import {drawRev" +
        "iewClicks} from './apps/extension/src/workflows/video-review/render-click-an" +
        "imation';\n import {evaluateReviewClicks} from './apps/extension/src/features" +
        "/video/review/click-animation';\n import {REVIEW_CLICK_DEFAULT} from './apps/" +
        "extension/src/features/video/review/advanced/click-animation';\n export async" +
        " function probe(){\n const source=document.createElement('canvas');source.wid" +
        "th=400;source.height=240;\n const s=source.getContext('2d');s.fillStyle='#246" +
        "';s.fillRect(0,0,400,240);s.fillStyle='#ff0000';s.fillRect(190,110,20,20);\n " +
        'const rect={x:0,y:0,width:400,height:240};\n const settings={...REVIEW_CLICK_' +
        "DEFAULT,effect:'magnify',lensOptics:'optical',radius:60,magnification:2,before:1,after:1,lensShad" +
        "ow:0,color:'#00000000'};\n const cue={settings,point:{x:.5,y:.5},anchor:1,sta" +
        "rt:0,end:2};\n const host=document.createElement('div');document.body.append(" +
        "host);host.style='position:relative;width:400px;height:240px';const root=cre" +
        'ateRoot(host);\n const render=async(time,shape)=>{cue.settings.lensShape=shap' +
        'e;flushSync(()=>root.render(React.createElement(ReviewClickOverlay,{cues:[cu' +
        'e],time,output:rect,video:rect,sourceWidth:400,clip:{rect,radius:0},getFrame' +
        ':()=>source})));await new Promise(r=>requestAnimationFrame(()=>requestAnimat' +
        "ionFrame(r)));return host.querySelector('canvas');};\n const samples=[];\n for" +
        "(const shape of ['circle','rounded']){\n  const live=await render(1,shape);co" +
        "nst exportCanvas=document.createElement('canvas');exportCanvas.width=400;exp" +
        'ortCanvas.height=240;document.body.append(exportCanvas);\n  drawReviewClicks(' +
        "exportCanvas.getContext('2d'),evaluateReviewClicks([cue],1),rect,400,{rect,r" +
        'adius:0},{rect,draw:(c,x,y,w,h)=>c.drawImage(source,x,y,w,h)});\n  const a=live.ge' +
        "tContext('2d').getImageData(0,0,400,240).data,b=exportCanvas.getContext('2d'" +
        ').getImageData(0,0,400,240).data;\n  samples.push({mismatch:a.reduce((n,v,i)=' +
        ">n+(v!==b[i]),0),enlarged:Array.from(live.getContext('2d').getImageData(184," +
        "120,1,1).data)});\n }\n s.fillStyle='#00ff00';s.fillRect(190,110,20,20);const " +
        "updated=await render(1,'circle');const current=Array.from(updated.getContext" +
        "('2d').getImageData(200,120,1,1).data);\n const identity=await render(0,'circ" +
        "le');const alpha=identity.getContext('2d').getImageData(200,120,1,1).data[3]" +
        ';\n root.unmount();return {samples,current,alpha};}\n ',
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.woff2': 'dataurl' },
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
      await page
        .locator(`[data-gallery-keyboard-id="${betaV1Fixture.records.media_library[0].id}"]`)
        .getByRole('button', { name: 'beta-v1.webm', exact: true })
        .first()
        .click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const button = (key: Parameters<typeof translate>[0]) =>
        page.locator('dialog').getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      const marker = page
        .locator(
          '[data-ui="gallery.videoReview.historyStrip"] [data-history-family="mouse"] button'
        )
        .first();
      await marker.click();
      const effectSelect = button('gallery.videoReview.clickEffect');
      if (await effectSelect.count()) {
        await effectSelect.click();
        await page
          .getByRole('option', { name: label('gallery.videoReview.click_magnify'), exact: true })
          .click();
      } else {
        await page
          .getByRole('group', { name: label('gallery.videoReview.clickEffect'), exact: true })
          .getByRole('button', { name: label('gallery.videoReview.click_magnify'), exact: true })
          .click();
      }
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
      const amount = page.getByRole('textbox', {
        name: label('gallery.videoReview.clickMagnification'),
        exact: true,
      });
      await expect(amount).toHaveValue('1.6');
      await amount.fill('2');
      await amount.press('Enter');
      await expect(page.locator('[data-ui="gallery.videoReview.clickAnimation"]')).toBeVisible();
      await page
        .getByRole('group', { name: label('gallery.videoReview.clickLensOptics') })
        .getByRole('button', { name: label('gallery.videoReview.clickLensOptics_optical') })
        .click();
      const edge = page.getByRole('textbox', {
        name: label('gallery.videoReview.clickLensEdgeWidth'),
        exact: true,
      });
      await expect(edge).toHaveValue('8');
      await edge.fill('4');
      await edge.press('Enter');
      await expect(edge).toHaveValue('4');
      await amount.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('lens-inspector.png'), fullPage: false });
      await button('common.actions.close').click();
      await expect(page.locator('[data-ui="gallery.videoReview.enter"]')).toBeVisible();
      await page.reload();
      await page
        .locator(`[data-gallery-keyboard-id="${betaV1Fixture.records.media_library[0].id}"]`)
        .getByRole('button', { name: 'beta-v1.webm', exact: true })
        .first()
        .click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await marker.click();
      if (!(await appearance.evaluate((node) => (node as HTMLDetailsElement).open)))
        await appearance.locator('summary').click();
      await expect(amount).toHaveValue('2');
      await expect(edge).toHaveValue('4');
    } finally {
      await new Promise<void>((r) => host.server.close(() => r()));
    }
  });
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`optical glass keeps central text sharp and confines dispersion to its rim ${viewport.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const bundle = await build({
      entryPoints: ['tooling/test/e2e/support/optical-lens-render-probe.ts'],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
    });
    const results = await page.evaluate(async (text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try {
        return (await import(url)).opticalLensProbe();
      } finally {
        URL.revokeObjectURL(url);
      }
    }, bundle.outputFiles[0]!.text);
    await writeFile(info.outputPath('optical-glass-proof.json'), JSON.stringify(results, null, 2));
    for (const row of results) {
      expect(row.centralMaximum, row.shape).toBeLessThanOrEqual(1);
      expect(row.fringePixels, row.shape).toBeGreaterThan(100);
    }
    await page.screenshot({ path: info.outputPath('optical-glass.png'), fullPage: false });
  });
}

for (const size of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`Gallery circular lens draft matches commit at the edge ${size.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(size);
    const host = await startHostServer();
    try {
      await applyHarnessBootstrap(page, {});
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      const bundle = await build({
        stdin: {
          contents:
            `
            import React from 'react';
            import {createRoot} from 'react-dom/client';
            import {flushSync} from 'react-dom';
            import {ReviewSpotlightPreview} from './apps/extension/src/gallery/video-review/spotlight-preview';
            import {ReviewStageFocusControl} from './apps/extension/src/gallery/video-review/stage-focus';
            import {createQuickEditSpotlight} from './apps/extension/src/features/video/project/scene/focus-appearance';
            import {createQuickEditZoomRegion} from './apps/extension/src/features/video/review/advanced/zoom';
            export function mount() {
              const host=document.createElement('div');host.id='circle-draft-proof';
              host.style='position:fixed;left:40px;top:40px;width:400px;height:200px;z-index:999999;background:white';
              document.body.append(host);const root=createRoot(host);
              const source=document.createElement('canvas');source.width=400;source.height=200;
              const c=source.getContext('2d');c.fillStyle='#252628';c.fillRect(0,0,400,200);
              c.fillStyle='white';c.font='18px Arial';for(let y=25;y<200;` +
            `y+=25)c.fillText('Readable text · lens preview · 0123456789',10,y);
              let region={...createQuickEditZoomRegion({id:'circle',at:0}),` +
            `spotlight:{...createQuickEditSpotlight(),effect:'magnify',lensShape:'circle'}};
              const rect={x:0,y:0,width:400,height:200};
              let stage=false;
              const accept=patch=>{region={...region,...patch};` +
            `host.dataset.saved=JSON.stringify(region.spotlight);render();};
              const layout={contentRect:rect,windowRect:rect,videoRect:rect,videoTransform:rect};
              function render(){flushSync(()=>{
                const preview=React.createElement(ReviewSpotlightPreview,{
                  region,camera:{scale:1,centerX:.5,centerY:.5},view:stage?'result':'area',` +
            `frame:{image:source,width:400,height:200},
                  output:rect,layout,cornerRadius:0,scale:1,disabled:false,onChange:accept
                });
                root.render(stage?React.createElement(React.Fragment,null,preview,` +
            `React.createElement(ReviewStageFocusControl,{
                  focus:{region,onChange:accept,onPreview:()=>{},onInteract:()=>{}},layout,output:rect
                })):preview);
              });}
              host.addEventListener('circle-proof-stage',()=>{stage=true;host.dispatchEvent(new ` +
            `CustomEvent('circle-proof-size',{detail:50}));});
              host.addEventListener('circle-proof-size',event=>{
                const d=event.detail/100;
                region={...region,spotlight:{...region.spotlight,area:{x:.5-d/2,y:.5-d/2,width:d,height:d}}};
                delete host.dataset.saved;render();
              });render();
            }
          `,
          resolveDir: process.cwd(),
          loader: 'tsx',
        },
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        loader: { '.woff2': 'dataurl', '.css': 'empty' },
        define: { 'process.env.NODE_ENV': '"production"' },
      });
      await page.evaluate(async (text) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try {
          (await import(url)).mount();
        } finally {
          URL.revokeObjectURL(url);
        }
      }, bundle.outputFiles[0]!.text);
      const surface = page.locator('#circle-draft-proof');
      const frame = surface.locator('[data-focus-frame]');
      await expect(frame).toHaveCSS('left', '150px');
      await page.mouse.move(240, 140);
      await page.mouse.down();
      await page.mouse.move(360, 140);
      await expect(frame).toHaveCSS('left', '250px');
      const before = await surface
        .locator('canvas')
        .first()
        .evaluate((node) => node.toDataURL());
      await page.screenshot({
        path: info.outputPath('gallery-circle-edge-draft.png'),
        fullPage: false,
      });
      await page.mouse.up();
      await expect(frame).toHaveCSS('left', '250px');
      await expect
        .poll(async () => JSON.parse((await surface.getAttribute('data-saved'))!).area.x)
        .toBe(0.5);
      expect(
        await surface
          .locator('canvas')
          .first()
          .evaluate((node) => node.toDataURL())
      ).toBe(before);
      await page.screenshot({
        path: info.outputPath('gallery-circle-edge-committed.png'),
        fullPage: false,
      });
      await surface.evaluate((node) =>
        node.dispatchEvent(new CustomEvent('circle-proof-size', { detail: 1 }))
      );
      await expect(frame).toHaveCSS('width', '2px');
      await page.mouse.move(240, 140);
      await page.mouse.down();
      await page.mouse.move(241, 141);
      await page.mouse.move(240, 140);
      await page.mouse.up();
      expect(await surface.getAttribute('data-saved')).toBeNull();
      await frame.press('ArrowRight');
      await expect
        .poll(async () => JSON.parse((await surface.getAttribute('data-saved'))!).area.x)
        .toBeCloseTo(0.505, 10);
      const minimum = JSON.parse((await surface.getAttribute('data-saved'))!).area;
      expect(minimum.width).toBeCloseTo(0.01, 12);
      expect(minimum.height).toBeCloseTo(0.01, 12);
      await expect(frame).toHaveCSS('width', '2px');
      await page.screenshot({
        path: info.outputPath('gallery-circle-minimum.png'),
        fullPage: false,
      });
      await surface.evaluate((node) => node.dispatchEvent(new Event('circle-proof-stage')));
      await expect(frame).toHaveCSS('width', '100px');
      await expect(frame).toHaveCSS('height', '100px');
      await page.mouse.move(240, 140);
      await page.mouse.down();
      await page.mouse.move(300, 140);
      await page.mouse.up();
      await expect
        .poll(async () => JSON.parse((await surface.getAttribute('data-saved'))!).area.x)
        .toBeCloseTo(0.4, 10);
      await expect(frame).toHaveCSS('left', '210px');
      await surface.evaluate((node) =>
        node.dispatchEvent(new CustomEvent('circle-proof-size', { detail: 1 }))
      );
      await expect(frame).toHaveCSS('width', '2px');
      await page.mouse.move(240, 140);
      await page.mouse.down();
      await page.mouse.move(241, 141);
      await page.mouse.move(240, 140);
      await page.mouse.up();
      expect(await surface.getAttribute('data-saved')).toBeNull();
      await frame.press('ArrowRight');
      await expect
        .poll(async () => JSON.parse((await surface.getAttribute('data-saved'))!).area.x)
        .toBeCloseTo(0.505, 10);
      await expect(frame).toHaveCSS('width', '2px');
      await expect(frame).toHaveCSS('height', '2px');
      await page.screenshot({
        path: info.outputPath('gallery-main-stage-circle.png'),
        fullPage: false,
      });
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('scene circular lens keeps a circular clip throughout enter and exit fade', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/optical-lens-render-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const results = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return (await import(url)).lensFadeProbe();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  expect(results).toHaveLength(20);
  for (const row of results) {
    expect(row.radius, JSON.stringify(row)).toBe(row.diameter / 2);
    expect(row.maximum, JSON.stringify(row)).toBe(0);
  }
  await writeFile(info.outputPath('lens-fade-pixels.json'), JSON.stringify(results, null, 2));
  await page.screenshot({ path: info.outputPath('lens-fade-circles.png'), fullPage: false });
});

test('mixed legacy and circle lens links preserve endpoint pixels and continuous contours', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/optical-lens-render-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const results = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return (await import(url)).lensLinkProbe();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('lens-link-pixels.json'), JSON.stringify(results, null, 2));
  expect(results).toHaveLength(20);
  for (const row of results) {
    if (row.time === 2) expect(row.start.maximum, JSON.stringify(row)).toBe(0);
    else if (row.time === 4) expect(row.end.maximum, JSON.stringify(row)).toBe(0);
    else if (row.time < 3)
      expect(row.start.interiorMaximum, JSON.stringify(row)).toBeLessThanOrEqual(2);
    else if (row.time > 3)
      expect(row.end.interiorMaximum, JSON.stringify(row)).toBeLessThanOrEqual(2);
    else {
      expect(row.arcMix).toBeGreaterThan(0);
      expect(row.arcMix).toBeLessThan(1);
      expect(row.start.changed).toBeGreaterThan(0);
      expect(row.end.changed).toBeGreaterThan(0);
    }
  }
  await page.screenshot({ path: info.outputPath('lens-link-mixed-contours.png'), fullPage: false });
});
