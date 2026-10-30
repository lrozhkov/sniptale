import { persistedReviewContent } from './voiceover-speech-fixture';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { readNativeVideoProject } from './native-video-project';
import { captureQuickPreviewPerformanceEnvironment } from './quick-preview-performance-probe';
import { performancePercentiles, validPerformanceDrag } from './preview-performance-report';

/** Transfer through the product command so both editors measure the same authored scene. */
export async function openFullPerformanceEditor(page: Page, origin: string) {
  const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
  await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
  const count = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs().length ?? 0);
  await dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs().length ?? 0))
    .toBe(count + 1);
  const tab = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs().at(-1));
  if (!tab?.url) throw new Error('Full-editor performance transfer did not create a route');
  const query = new URL(tab.url).searchParams;
  query.set('theme', 'dark');
  await page.goto(`${origin}${VIDEO_EDITOR_HARNESS_PATH}?${query}`);
  await page.locator('[data-ui="video-editor.timeline.surface"]').waitFor();
  await expect(page.locator('[data-preview-stage-canvas]')).toBeVisible();
  const project = await readNativeVideoProject(page);
  if (!project) throw new Error('Full-editor performance project is unavailable');
  return {
    width: project.width,
    height: project.height,
    regions: project.motionRegions?.length ?? 0,
    clips: project.clips.length,
  };
}

/** Measures completed canvas publication, independently from RAF and source video callbacks. */
export async function measureFullEditorPlayback(
  page: Page,
  info: TestInfo,
  options: {
    recipe: string;
    repetitions: number;
    warmupMs: number;
    sampleMs: number;
    sourceProfile: { width: number; height: number; fps: number; name: string };
    fixtureManifest: unknown;
    composition: { width: number; height: number };
    mode: 'native' | 'manual720p30' | 'manual1080p30';
    runtimeErrors: () => {
      consoleErrorCount: number;
      pageErrorNames: string[];
      pageErrorOverflow: boolean;
    };
  }
) {
  const environment = await captureQuickPreviewPerformanceEnvironment(page);
  const toolbar = page.locator('[data-ui="video-editor.timeline.toolbar"]');
  const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
  const control = (key: 'videoEditor.timeline.play' | 'videoEditor.timeline.pause') =>
    toolbar.getByRole('button', { name: translate(key, 'en'), exact: true });
  await expect
    .poll(() =>
      page.evaluate(
        ({ width, height }) =>
          [...document.querySelectorAll('video')].some(
            (video) => video.videoWidth === width && video.videoHeight === height
          ),
        options.sourceProfile
      )
    )
    .toBe(true);
  for (let repeat = 0; repeat < options.repetitions; repeat++) {
    if (repeat > 0) {
      await page.reload();
      await page.locator('[data-ui="video-editor.timeline.surface"]').waitFor();
      await expect(page.locator('[data-preview-stage-canvas]')).toBeVisible();
    }
    await toolbar
      .getByRole('button', {
        name: translate('videoEditor.timeline.seekToStart', 'en'),
        exact: true,
      })
      .click();
    await expect
      .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
      .toBeLessThan(0.05);
    await control('videoEditor.timeline.play').click();
    await page.waitForTimeout(options.warmupMs);
    const started = Number(await playhead.getAttribute('aria-valuenow'));
    const handle = await page.evaluateHandle(() => {
      const canvas = document.querySelector('[data-preview-stage-canvas]');
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing native preview canvas');
      const samples: { now: number; width: number; height: number }[] = [];
      const rafIntervals: number[] = [];
      const start = performance.now();
      let previous = start,
        overflow = false,
        stopped = false,
        expired = false;
      const publication = () => {
        if (samples.length < 10000)
          samples.push({ now: performance.now(), width: canvas.width, height: canvas.height });
        else overflow = true;
      };
      canvas.addEventListener('sniptale-preview-frame', publication);
      let frame = 0;
      const raf = (now: number) => {
        if (stopped) return;
        if (rafIntervals.length < 10000) rafIntervals.push(now - previous);
        else overflow = true;
        previous = now;
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
      const sources = [...document.querySelectorAll('video')].slice(0, 8).map((video) => {
        const frames: { now: number; mediaTime: number; presented: number }[] = [];
        let callback = 0;
        const onFrame: VideoFrameRequestCallback = (now, metadata) => {
          if (stopped) return;
          if (frames.length < 10000)
            frames.push({
              now,
              mediaTime: metadata.mediaTime,
              presented: metadata.presentedFrames,
            });
          else overflow = true;
          callback = video.requestVideoFrameCallback(onFrame);
        };
        callback = video.requestVideoFrameCallback(onFrame);
        return { video, frames, cancel: () => video.cancelVideoFrameCallback(callback) };
      });
      const finish = () => {
        stopped = true;
        canvas.removeEventListener('sniptale-preview-frame', publication);
        cancelAnimationFrame(frame);
        clearTimeout(timeout);
        for (const source of sources) source.cancel();
        return {
          expired,
          sourceFrames: sources.map(({ video, frames }) => ({
            width: video.videoWidth,
            height: video.videoHeight,
            frames,
          })),
          start,
          stop: performance.now(),
          durationMs: performance.now() - start,
          overflow,
          samples,
          rafIntervals,
          valid:
            canvas.isConnected && canvas === document.querySelector('[data-preview-stage-canvas]'),
          visibility: document.visibilityState,
          sourceDimensions: [...document.querySelectorAll('video')].map((video) => ({
            width: video.videoWidth,
            height: video.videoHeight,
          })),
          backing: { width: canvas.width, height: canvas.height },
        };
      };
      const timeout = setTimeout(() => {
        expired = true;
        finish();
      }, 120000);
      return { stop: finish };
    });
    try {
      await page.waitForTimeout(options.sampleMs);
      const metrics = await handle.evaluate((probe) => probe.stop());
      const ended = Number(await playhead.getAttribute('aria-valuenow'));
      const playingAtEnd = await control('videoEditor.timeline.pause').isVisible();
      if (playingAtEnd) await control('videoEditor.timeline.pause').click();
      const errors = options.runtimeErrors();
      const runtimeFailure =
        (await page.locator('[data-ui="video.preview.effect-runtime-error"]').count()) > 0;
      const samples = metrics.samples;
      const first = samples[0],
        last = samples.at(-1);
      const expectedHeight = options.mode === 'manual720p30' ? 720 : 1080;
      const rasterValid = [metrics.backing, ...samples].every(
        (surface) => surface.width > 0 && surface.height === expectedHeight
      );
      const summary = {
        editor: 'native',
        recipe: options.recipe,
        repeat: repeat + 1,
        environment,
        errors,
        runtimeFailure,
        requestedPreview: {
          rasterPreset: options.mode === 'manual720p30' ? '720p' : '1080p',
          fps: 30,
          mode: 'live',
        },
        sourceProfile: options.sourceProfile,
        composition: options.composition,
        fixture: options.fixtureManifest,
        protocol: {
          repetitions: options.repetitions,
          warmupMs: options.warmupMs,
          sampleMs: options.sampleMs,
          purpose: options.sampleMs < 30000 ? 'qualification' : 'measurement',
        },
        repeatIsolation: 'Fresh editor lifecycle before each repeat',
        compositionFps: (1000 * samples.length) / metrics.durationMs,
        activePublicationFps:
          first && last && last.now > first.now
            ? (1000 * (samples.length - 1)) / (last.now - first.now)
            : null,
        trailingPublicationGapMs: metrics.stop - (last?.now ?? metrics.start),
        compositionIntervalMs: performancePercentiles(
          samples.slice(1).map((sample, index) => sample.now - samples[index]!.now)
        ),
        rafIntervalMs: performancePercentiles(metrics.rafIntervals),
        valid:
          rasterValid &&
          !runtimeFailure &&
          metrics.valid &&
          !metrics.overflow &&
          !metrics.expired &&
          playingAtEnd &&
          ended > started &&
          metrics.visibility === 'visible' &&
          !errors.pageErrorOverflow &&
          errors.pageErrorNames.length === 0,
        durationMs: metrics.durationMs,
        backing: metrics.backing,
        interpretation:
          'Completed native canvas publication, not GPU scanout. RAF measures jank. No performance threshold is enforced.',
      };
      await writeFile(
        info.outputPath(`native-sample-${repeat + 1}.json`),
        JSON.stringify({ summary, metrics, started, ended }, null, 2)
      );
      await info.attach('preview-performance-sample', {
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify(summary)),
      });
      expect(
        summary.valid,
        'Full editor measurement identity, transport or visibility is invalid'
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`native-sample-${repeat + 1}.png`),
        fullPage: false,
      });
    } finally {
      await handle.evaluate((probe) => probe.stop()).catch(() => undefined);
      await handle.dispose();
    }
  }
}

/** Real pointer input; DOM geometry acknowledgement and canvas publication are separate metrics. */
export async function measurePerformanceDrag(
  page: Page,
  info: TestInfo,
  options: {
    editor: 'gallery' | 'native';
    recipe: string;
    target: 'border' | 'lens' | 'annotation';
    sourceProfile: { width: number; height: number; fps: number; name: string };
    composition: { width: number; height: number };
    fixtureManifest: unknown;
    purpose: 'qualification' | 'measurement';
    runtimeErrors: () => {
      consoleErrorCount: number;
      pageErrorNames: string[];
      pageErrorOverflow: boolean;
    };
  }
) {
  const key =
    options.target === 'border'
      ? 'gallery.videoReview.focusBorder'
      : 'gallery.videoReview.focusLens';
  if (options.editor === 'gallery' && options.target === 'annotation') {
    await page.locator('[data-review-removal-key="annotation:performance-annotation-0"]').click();
  } else if (options.editor === 'native' && options.target === 'annotation') {
    const project = await readNativeVideoProject(page);
    const clip = project?.clips.find((entry) => entry.type === 'EFFECT');
    if (!clip) throw new Error('Missing annotation performance clip');
    await page
      .locator(`[data-project-timeline-clip="${clip.id}"]`)
      .click({ position: { x: 25, y: 15 } });
  } else if (options.editor === 'gallery') {
    const id = options.target === 'border' ? 'border-0' : 'mask-0';
    await page.locator(`[data-review-removal-key="focus:${id}"]`).click();
  } else {
    await page
      .locator('[data-timeline-effect-segment]')
      .getByRole('button', {
        name: translate(key, 'en'),
        exact: true,
      })
      .first()
      .click();
  }
  if (options.editor === 'gallery') {
    const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
    await dialog
      .getByRole('button', { name: translate('gallery.videoReview.play', 'en'), exact: true })
      .click();
    await page.waitForTimeout(2000);
    await dialog
      .getByRole('button', { name: translate('gallery.videoReview.pause', 'en'), exact: true })
      .click();
    if (options.target !== 'annotation') {
      const id = options.target === 'border' ? 'border-0' : 'mask-0';
      await page.locator(`[data-review-removal-key="focus:${id}"]`).click();
    }
  } else {
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll('video')].some(
            (video) => video.readyState >= 2 && !video.seeking
          )
        )
      )
      .toBe(true);
    const toolbar = page.locator('[data-ui="video-editor.timeline.toolbar"]');
    await toolbar
      .getByRole('button', { name: translate('videoEditor.timeline.play', 'en'), exact: true })
      .click();
    await page.waitForTimeout(2000);
    await toolbar
      .getByRole('button', { name: translate('videoEditor.timeline.pause', 'en'), exact: true })
      .click();
    await page
      .locator('[data-ui="video-editor.timeline.toolbar"]')
      .getByRole('button', {
        name: translate('videoEditor.timeline.nextFrame', 'en'),
        exact: true,
      })
      .click();
  }
  if (options.editor === 'native')
    await page.locator('[data-ui="video.preview.stage.root"]').focus();
  const selector =
    options.target === 'annotation'
      ? options.editor === 'gallery'
        ? '[data-annotation-id="performance-annotation-0"]'
        : '[data-preview-selection-state="editable"]'
      : options.editor === 'gallery'
        ? '[data-ui="gallery.videoReview.stage"] [data-focus-frame]'
        : '[data-preview-stage-focus-area]';
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  const authoredGeometry = async () => {
    if (options.editor === 'gallery') {
      const content = await persistedReviewContent(page);
      if (!content) throw new Error('Missing authored Gallery performance content');
      return JSON.stringify(
        options.target === 'annotation'
          ? content.annotationEffects?.instances.map((entry) => entry.transform)
          : content.zoom.regions.map((entry) => entry.border?.area ?? entry.spotlight?.area)
      );
    }
    const project = await readNativeVideoProject(page);
    if (!project) throw new Error('Missing authored Native performance content');
    return JSON.stringify(
      options.target === 'annotation'
        ? project.clips.filter((entry) => entry.type === 'EFFECT').map((entry) => entry.transform)
        : project.motionRegions?.map((entry) => entry.border?.area ?? entry.spotlight?.area)
    );
  };
  const authoredBefore = await authoredGeometry();
  const before = await target.boundingBox();
  if (!before || before.width < 20 || before.height < 20)
    throw new Error('Drag performance target is too small');
  const previewSelector =
    options.editor === 'native'
      ? '[data-preview-stage-canvas]'
      : '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]';
  const visibleFixture = () =>
    page.locator(previewSelector).evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d');
      if (!context || !canvas.width || !canvas.height) return false;
      let colored = 0;
      for (let row = 1; row < 5; row++)
        for (let column = 1; column < 7; column++) {
          const pixel = context.getImageData(
            Math.floor((column * canvas.width) / 8),
            Math.floor((row * canvas.height) / 6),
            1,
            1
          ).data;
          if (pixel[0]! + pixel[1]! + pixel[2]! > 80) colored++;
        }
      return colored >= 4;
    });
  await expect
    .poll(visibleFixture, {
      message: 'Decoded performance fixture must be visible on the canvas before drag timing',
    })
    .toBe(true);
  const environment = await captureQuickPreviewPerformanceEnvironment(page);
  const preparation = await page.evaluate((selector) => {
    const canvas = document.querySelector(selector);
    return {
      previewBacking:
        canvas instanceof HTMLCanvasElement ? { width: canvas.width, height: canvas.height } : null,
      decodedSources: [...document.querySelectorAll('video')].map((video) => ({
        width: video.videoWidth,
        height: video.videoHeight,
        paused: video.paused,
        seeking: video.seeking,
        mediaTime: video.currentTime,
      })),
    };
  }, previewSelector);
  const probe = await page.evaluateHandle(
    ({ selector, editor }) => {
      const target = document.querySelector(selector);
      const canvas =
        editor === 'native' ? document.querySelector('[data-preview-stage-canvas]') : null;
      const host =
        editor === 'gallery'
          ? document.querySelector('[data-ui="gallery.videoReview.manualPreview"]')
          : null;
      if (!target) throw new Error('Missing drag measurement target');
      const stageSelector =
        editor === 'gallery'
          ? '[data-ui="gallery.videoReview.stage"]'
          : '[data-ui="video.preview.stage.root"]';
      const stage = document.querySelector(stageSelector);
      if (!stage) throw new Error('Missing drag measurement stage');
      let sequence = 0,
        geometryAck = 0,
        publicationAck = 0,
        inputAt = 0,
        releasedAt: number | null = null;
      const inputs: number[] = [],
        geometryLatency: number[] = [],
        publicationLatency: number[] = [],
        publications: number[] = [];
      const controller = new AbortController();
      const input = (event: PointerEvent) => {
        if (!event.isTrusted || !event.buttons) return;
        if (inputs.length >= 10000) return;
        inputAt = performance.now();
        sequence++;
        inputs.push(inputAt);
      };
      document.addEventListener('pointermove', input, { capture: true, signal: controller.signal });
      document.addEventListener(
        'pointerup',
        () => {
          releasedAt = performance.now();
        },
        { once: true, signal: controller.signal }
      );
      const geometry = new MutationObserver((records) => {
        const current = document.querySelector(selector);
        const relevant =
          current &&
          records.some(
            (record) =>
              record.target === current ||
              [...record.addedNodes].some((node) => node === current || node.contains(current))
          );
        if (relevant && sequence > geometryAck && geometryLatency.length < 10000) {
          geometryAck = sequence;
          geometryLatency.push(performance.now() - inputAt);
        }
      });
      geometry.observe(stage, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'points'],
      });
      const publish = () => {
        const now = performance.now();
        if (publications.length < 10000) publications.push(now);
        if (sequence > publicationAck && publicationLatency.length < 10000) {
          publicationAck = sequence;
          publicationLatency.push(now - inputAt);
        }
      };
      canvas?.addEventListener('sniptale-preview-frame', publish, { signal: controller.signal });
      const fronts = new MutationObserver((records) => {
        if (records.some((record) => record.type === 'childList' || record.oldValue !== 'true'))
          publish();
      });
      if (host)
        fronts.observe(host, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeOldValue: true,
          attributeFilter: ['data-preview-front'],
        });
      const started = performance.now();
      const stop = () => {
        controller.abort();
        geometry.disconnect();
        fronts.disconnect();
        clearTimeout(timeout);
        return {
          inputs,
          geometryLatency,
          publicationLatency,
          publications,
          releasedAt,
          durationMs: performance.now() - started,
          valid:
            stage.isConnected &&
            stage === document.querySelector(stageSelector) &&
            !!document.querySelector(selector)?.isConnected &&
            document.visibilityState === 'visible',
          publicationObservedAfterLatestInput: publicationAck === sequence,
          geometryUpdatesAfterInput: geometryLatency.length,
          publicationsAfterInput: publicationLatency.length,
          measurement:
            'Time from latest trusted input to next observed geometry mutation / canvas publication. Publication can contain earlier input. Physical display latency and causal frame attribution are not measured. Pointer delivery is paced by Playwright.',
        };
      };
      const timeout = setTimeout(stop, 30000);
      return { stop };
    },
    { selector, editor: options.editor }
  );
  try {
    const x = before.x + before.width * 0.5,
      y = before.y + before.height * 0.5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= 60; step++) {
      await page.mouse.move(x + (70 * step) / 60, y + (35 * step) / 60);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(1000);
    const metrics = await probe.evaluate((handle) => handle.stop());
    const after = await target.boundingBox();
    const authoredCommitted = await expect
      .poll(authoredGeometry, { message: 'Drag must commit authored geometry' })
      .not.toBe(authoredBefore)
      .then(
        () => true,
        () => false
      );
    const decodedFixtureVisible = await expect
      .poll(visibleFixture, { message: 'Decoded fixture must remain visible after drag' })
      .toBe(true)
      .then(
        () => true,
        () => false
      );
    const errors = options.runtimeErrors();
    const acceptance = {
      stageValid: metrics.valid,
      errorFree: errors.pageErrorNames.length === 0 && !errors.pageErrorOverflow,
      trustedInputsReceived: metrics.inputs.length > 0,
      geometryMoved: !!after && Math.hypot(after.x - before.x, after.y - before.y) > 2,
      authoredCommitted,
      decodedFixtureVisible,
    };
    const summary = {
      editor: options.editor,
      recipe: options.recipe,
      target: options.target,
      sourceProfile: options.sourceProfile,
      composition: options.composition,
      fixture: options.fixtureManifest,
      protocol: {
        purpose: options.purpose,
        warmupMs: 2000,
        movements: 60,
        pacingMs: 16,
        settlementMs: 1000,
      },
      environment,
      preparation,
      errors,
      operation: 'drag',
      valid: validPerformanceDrag(acceptance),
      acceptance,
      receivedInputs: metrics.inputs.length,
      inputIntervalMs: performancePercentiles(
        metrics.inputs.slice(1).map((time, index) => time - metrics.inputs[index]!)
      ),
      geometryLatencyMs: performancePercentiles(metrics.geometryLatency),
      publicationLatencyMs: performancePercentiles(metrics.publicationLatency),
      before,
      after,
      publicationObservedAfterLatestInput: metrics.publicationObservedAfterLatestInput,
      geometryUpdatesAfterInput: metrics.geometryUpdatesAfterInput,
      publicationsAfterInput: metrics.publicationsAfterInput,
      measurement: metrics.measurement,
    };
    await writeFile(info.outputPath('drag.json'), JSON.stringify({ summary, metrics }, null, 2));
    await info.attach('preview-performance-sample', {
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(summary)),
    });
    expect(summary.valid, `Drag acceptance: ${JSON.stringify(acceptance)}`).toBe(true);
    await page.screenshot({ path: info.outputPath('drag.png'), fullPage: false });
  } finally {
    await page.mouse.up().catch(() => undefined);
    await probe.evaluate((handle) => handle.stop()).catch(() => undefined);
    await probe.dispose();
  }
}
