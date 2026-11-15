import type { BrowserContext, Locator, Page, TestInfo, ViewportSize } from '@playwright/test';
import { createCanvas } from 'canvas';
import { test, expect } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import {
  grantNativeSimplifyCapture,
  prepareNativeSimplifySource,
} from './extension-critical-simplify-native.helpers';
import {
  startSimplifyRecording,
  stopAndSaveDrawingRecording,
} from './extension-critical-simplify-recording.helpers';

type Surface = 'editor' | 'drawing' | 'crop' | 'video-recording';
type Tool = 'pencil' | 'marker';
type Point = { x: number; y: number };
type Sample = Point & { t: number };
type ObservedPointer = Sample & {
  type: string;
  buttons: number;
  trusted: boolean;
  canvasHit: boolean;
  coalesced: Sample[];
};
type PixelSnapshot = { hash: number; ink: number; right: number };
type InputTrace = { events: ObservedPointer[]; loadFrame: number; stopLoad: boolean };

declare global {
  interface Window {
    __freehandTailTrace?: InputTrace;
  }
}

const STROKE_START = { x: 500, y: 260 };
const STROKE_POINTS = Array.from({ length: 24 }, (_, index) => {
  const step = index + 1;
  return {
    x: STROKE_START.x + step * 12,
    y: STROKE_START.y + (step > 20 ? -(step - 20) * 8 : Math.round(Math.sin(step / 5) * 15)),
  };
});
const READ_REGION = { x: 480, y: 210, width: 340, height: 110 };

function canvasSelector(surface: Surface) {
  if (surface === 'editor') return '[data-ui="editor.canvas.layer"] canvas';
  const host = surface === 'crop' ? 'content.crop.drawing-layer' : 'content.drawing.surface';
  return `[data-ui="${host}"] canvas.sniptale-drawing-canvas[tabindex="0"]`;
}

async function openDrawingSurface(
  context: BrowserContext,
  hostOrigin: string,
  extensionId: string,
  size: ViewportSize,
  surface: Surface
) {
  if (surface === 'editor') {
    const page = await context.newPage();
    await page.setViewportSize(size);
    const source = createCanvas(800, 500);
    const drawing = source.getContext('2d');
    drawing.fillStyle = '#ffffff';
    drawing.fillRect(0, 0, source.width, source.height);
    await applyHarnessBootstrap(page, {
      editorBootstrapPayload: { dataUrl: source.toDataURL(), title: 'Freehand source' },
      storage: { 'sniptale-theme-preference': 'light' },
    });
    await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
    await expect
      .poll(() =>
        page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
      )
      .toBeGreaterThan(0);
    return { page, popup: null };
  }
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
  if (surface === 'video-recording') await grantNativeSimplifyCapture(popup);
  await prepareNativeSimplifySource(page, surface, async () => {
    await page.evaluate(() => {
      const source = document.getElementById('simplify-source-proof');
      if (!source) throw new Error('White drawing source missing');
      source.textContent = '';
      source.style.background = '#ffffff';
    });
  });
  if (surface === 'video-recording') await startSimplifyRecording(context, extensionId, page);
  return { page, popup };
}

async function selectTool(page: Page, surface: Surface, tool: Tool) {
  const scope =
    surface === 'editor'
      ? page.locator('[data-ui="editor.floating.tool-rail"]')
      : surface === 'crop'
        ? page.locator('[data-ui="content.crop.drawing-slot"]')
        : page.locator('[data-ui="content.toolbar.root"]');
  const name =
    surface === 'editor' ? `editor.floating.tool-rail.${tool}` : `content.toolbar.drawing.${tool}`;
  const button = scope.locator(`[data-ui="${name}"]`);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  if (surface !== 'editor')
    await expect(page.locator(canvasSelector(surface))).toHaveCSS('pointer-events', 'auto');
}

async function readPixels(canvases: Locator): Promise<PixelSnapshot> {
  return canvases.evaluateAll((nodes, region) => {
    const composite = document.createElement('canvas');
    composite.width = region.width;
    composite.height = region.height;
    const context = composite.getContext('2d');
    if (!context) throw new Error('Freehand proof canvas missing');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, region.width, region.height);
    for (const node of nodes) {
      if (!(node instanceof HTMLCanvasElement)) throw new Error('Drawing surface is not a canvas');
      const bounds = node.getBoundingClientRect();
      context.drawImage(
        node,
        bounds.x - region.x,
        bounds.y - region.y,
        bounds.width,
        bounds.height
      );
    }
    const pixels = context.getImageData(0, 0, region.width, region.height).data;
    let hash = 2166136261;
    let ink = 0;
    let right = -1;
    for (let index = 0; index < pixels.length; index++) {
      hash = Math.imul(hash ^ pixels[index]!, 16777619);
      if (
        index % 4 === 0 &&
        Math.min(pixels[index]!, pixels[index + 1]!, pixels[index + 2]!) < 240
      ) {
        ink++;
        right = Math.max(right, (index / 4) % region.width);
      }
    }
    return { hash: hash >>> 0, ink, right };
  }, READ_REGION);
}

async function beginInputTrace(page: Page) {
  return page.evaluateHandle(() => {
    const trace: InputTrace = { events: [], loadFrame: 0, stopLoad: false };
    window.__freehandTailTrace = trace;
    const observe = (event: PointerEvent) => {
      const target = event.composedPath()[0];
      trace.events.push({
        type: event.type,
        x: event.clientX,
        y: event.clientY,
        t: event.timeStamp,
        buttons: event.buttons,
        trusted: event.isTrusted,
        canvasHit: target instanceof HTMLCanvasElement,
        coalesced: event.getCoalescedEvents().map((sample) => ({
          x: sample.clientX,
          y: sample.clientY,
          t: sample.timeStamp,
        })),
      });
    };
    for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const)
      window.addEventListener(type, observe, { capture: true });
    const lightLoad = () => {
      if (trace.stopLoad) return;
      const deadline = performance.now() + 3;
      while (performance.now() < deadline) {
        /* Bounded light main-thread load. */
      }
      trace.loadFrame = requestAnimationFrame(lightLoad);
    };
    trace.loadFrame = requestAnimationFrame(lightLoad);
    return () => {
      trace.stopLoad = true;
      cancelAnimationFrame(trace.loadFrame);
      for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const)
        window.removeEventListener(type, observe, { capture: true });
      delete window.__freehandTailTrace;
    };
  });
}

async function drawQueuedStroke(page: Page, holdBeforeRelease: boolean, yOffset = 0) {
  const start = { ...STROKE_START, y: STROKE_START.y + yOffset };
  const points = STROKE_POINTS.map((point) => ({ ...point, y: point.y + yOffset }));
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start });
    await session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      buttons: 1,
      clickCount: 1,
      ...start,
    });
    await Promise.all(
      points.map((point) =>
        session.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          button: 'left',
          buttons: 1,
          ...point,
        })
      )
    );
    if (holdBeforeRelease) await page.waitForTimeout(300);
    const end = points.at(-1);
    if (!end) throw new Error('Freehand endpoint missing');
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      buttons: 0,
      clickCount: 1,
      ...end,
    });
  } finally {
    await session.detach();
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function savedSamples(canvasJson: string, tool: Tool): Sample[] {
  const canvas: unknown = JSON.parse(canvasJson);
  if (!record(canvas) || !Array.isArray(canvas.objects)) throw new Error('Invalid saved canvas');
  for (const object of canvas.objects.toReversed()) {
    if (!record(object) || typeof object.sniptaleDrawingJson !== 'string') continue;
    const metadata: unknown = JSON.parse(object.sniptaleDrawingJson);
    if (!record(metadata) || !record(metadata.object) || metadata.object.kind !== tool) continue;
    if (!Array.isArray(metadata.object.samples)) throw new Error('Saved samples missing');
    return metadata.object.samples.map((sample: unknown) => {
      if (
        !record(sample) ||
        typeof sample.x !== 'number' ||
        typeof sample.y !== 'number' ||
        typeof sample.t !== 'number'
      )
        throw new Error('Invalid saved freehand sample');
      return { x: sample.x, y: sample.y, t: sample.t };
    });
  }
  throw new Error('Completed freehand stroke missing');
}

async function assertEditorSamples(page: Page, tool: Tool, events: ObservedPointer[]) {
  // Export updates source state. Only inspect this boundary after the stroke has completed.
  const completed = await page.evaluate(() => {
    const bridge = window.__sniptaleEditorHarness;
    if (!bridge) throw new Error('Editor bridge missing');
    return { document: bridge.exportDocument(), projection: bridge.getSceneProjection() };
  });
  const projection = completed.projection;
  if (!projection) throw new Error('Editor scene projection missing');
  const [a, b, c, d, e, f] = projection.viewport;
  if (
    a === undefined ||
    b === undefined ||
    c === undefined ||
    d === undefined ||
    e === undefined ||
    f === undefined
  )
    throw new Error('Editor transform missing');
  const determinant = a * d - b * c;
  expect(Math.abs(determinant)).toBeGreaterThan(0);
  const down = events.find((event) => event.type === 'pointerdown');
  if (!down) throw new Error('Accepted pointer down missing');
  const inputs = [
    down,
    ...events
      .filter((event) => event.type === 'pointermove' && event.buttons === 1)
      .flatMap((event) => (event.coalesced.length ? event.coalesced : [event])),
  ];
  const samples = savedSamples(completed.document.canvasJson, tool);
  // Each step is 12 CSS pixels, beyond the pencil's existing 2-scene-pixel distance filter.
  expect(inputs).toHaveLength(25);
  expect(samples).toHaveLength(inputs.length);
  for (const [index, input] of inputs.entries()) {
    const sample = samples[index];
    if (!sample) throw new Error('Saved sample missing');
    const x = ((input.x - projection.rect.left) * projection.width) / projection.rect.width - e;
    const y = ((input.y - projection.rect.top) * projection.height) / projection.rect.height - f;
    expect(sample.x).toBeCloseTo((d * x - c * y) / determinant, 1);
    expect(sample.y).toBeCloseTo((a * y - b * x) / determinant, 1);
    expect(Math.abs(sample.t - input.t)).toBeLessThanOrEqual(1);
  }
}

async function undoStroke(page: Page, surface: Surface) {
  if (surface === 'crop') await page.locator('[data-ui="content.crop.undo"]').click();
  else if (surface === 'editor') await page.keyboard.press('Control+z');
  else await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
}

async function assertStroke(
  page: Page,
  surface: Surface,
  tool: Tool,
  holdBeforeRelease: boolean,
  info: TestInfo
) {
  const canvases = page.locator(canvasSelector(surface));
  const baseline = await readPixels(canvases);
  const stopTrace = await beginInputTrace(page);
  try {
    const yOffset = surface === 'video-recording' && !holdBeforeRelease ? 40 : 0;
    await drawQueuedStroke(page, holdBeforeRelease, yOffset);
    const up = await readPixels(canvases);
    expect(up.ink - baseline.ink).toBeGreaterThan(100);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const frame = await readPixels(canvases);
    await page.waitForTimeout(250);
    const settled = await readPixels(canvases);
    expect(frame).toEqual(up);
    expect(settled).toEqual(up);
    const events = await page.evaluate(() => window.__freehandTailTrace?.events ?? []);
    expect(
      events
        .filter((event) => event.type !== 'pointermove' || event.buttons === 1)
        .every((event) => event.trusted && event.canvasHit)
    ).toBe(true);
    expect(
      events.some((event) => event.coalesced.length > 1),
      'Exercise a coalesced input batch'
    ).toBe(true);
    if (surface === 'editor') await assertEditorSamples(page, tool, events);
    await page.screenshot({
      path: info.outputPath(`${tool}-${holdBeforeRelease ? 'held' : 'rapid'}.png`),
      fullPage: false,
    });
    // Recording mode has no history controls or shortcuts, including while paused.
    if (surface !== 'video-recording') {
      await undoStroke(page, surface);
      await expect.poll(() => readPixels(canvases)).toEqual(baseline);
    }
  } finally {
    await stopTrace.evaluate((stop) => stop());
    await stopTrace.dispose();
  }
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const surface of ['editor', 'drawing', 'crop', 'video-recording'] as const) {
    for (const tool of ['pencil', 'marker'] as const) {
      test(`freehand ${surface} ${tool} retains the terminal stroke ${name}`, async ({
        context,
        hostOrigin,
        extensionId,
      }, info) => {
        test.setTimeout(surface === 'video-recording' ? 120_000 : 60_000);
        const { page, popup } = await openDrawingSurface(
          context,
          hostOrigin,
          extensionId,
          size,
          surface
        );
        try {
          await selectTool(page, surface, tool);
          const source =
            surface === 'editor'
              ? await page.evaluate(
                  () => window.__sniptaleEditorHarness?.exportDocument().sourceImageData
                )
              : await page.locator('#simplify-source-proof').evaluate((node) => node.outerHTML);
          await assertStroke(page, surface, tool, true, info);
          await assertStroke(page, surface, tool, false, info);
          const preserved =
            surface === 'editor'
              ? await page.evaluate(
                  () => window.__sniptaleEditorHarness?.exportDocument().sourceImageData
                )
              : await page.locator('#simplify-source-proof').evaluate((node) => node.outerHTML);
          expect(preserved).toEqual(source);
        } finally {
          if (surface === 'video-recording' && popup)
            await stopAndSaveDrawingRecording(page, popup);
          await page.close();
          await popup?.close();
        }
      });
    }
  }
}
