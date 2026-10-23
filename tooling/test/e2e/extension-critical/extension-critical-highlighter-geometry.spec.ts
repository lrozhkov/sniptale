import { build } from 'esbuild';
import { resolve } from 'node:path';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { expect, test } from '../support/extension-fixture';
import type { Locator, Page } from '@playwright/test';

const HARNESS_PATH = '/tooling/test/harness/highlighter-geometry.html';
const ZOOM_LEVELS = [80, 100, 125, 200] as const;

type Rect = { x: number; y: number; width: number; height: number };

type DynamicScenario = 'carousel' | 'iframe' | 'nested';
type DynamicAction =
  | 'ambiguous'
  | 'detach'
  | 'moveIn'
  | 'moveOut'
  | 'recycle'
  | 'reinsert'
  | 'reloadIframe'
  | 'replace'
  | 'settleReplacement'
  | 'scrollNestedIn'
  | 'scrollNestedOut'
  | 'unloadIframe';

type DynamicFrameState = {
  borderSettings: {
    color: string;
    padding: { bottom: number; left: number; right: number; top: number };
    radius: number;
    sourcePresetId: string;
    width: number;
  };
  effectMode: string;
  height: number;
  id: string;
  linkedElementSelector: string;
  offset: { height: number; width: number; x: number; y: number };
  pagePlacement: { iframePath: string[]; pageX: number; pageY: number };
  width: number;
  x: number;
  y: number;
};

type DynamicHarnessSnapshot = {
  frame: DynamicFrameState;
  frameCount: number;
  frameId: string;
  presentation: string;
  scenario: string;
};

type DynamicHarnessStatus = {
  connected: boolean;
  context: DynamicScenario;
  iframeRevision: string | null;
  instance: string | null;
  sameAsOriginal: boolean;
};

type OpenedDynamicHarness = {
  frameRect: Rect;
  harness: Locator;
  snapshot: DynamicHarnessSnapshot;
};

function expectRectClose(actual: Rect, expected: Rect, tolerance: number): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(tolerance);
}

async function runDynamicAnchorAction(page: Page, action: DynamicAction, fixtureEvent: string) {
  await page.evaluate(
    ({ actionName, eventName }) =>
      new Promise<void>((resolve) => {
        window.addEventListener(`sniptale-fixture:${eventName}`, () => resolve(), { once: true });
        const harness = (
          window as Window & {
            __sniptaleDynamicAnchorHarness?: Record<string, () => void>;
          }
        ).__sniptaleDynamicAnchorHarness;
        if (!harness?.[actionName]) {
          throw new Error(`Dynamic anchor fixture action is unavailable: ${actionName}`);
        }
        harness[actionName]();
      }),
    { actionName: action, eventName: fixtureEvent }
  );
}

async function readDynamicHarnessSnapshot(harness: Locator): Promise<DynamicHarnessSnapshot> {
  return harness.evaluate((element) => {
    const frameState = element.getAttribute('data-frame-state');
    if (!frameState) throw new Error('Dynamic frame state is unavailable.');
    return {
      frame: JSON.parse(frameState) as DynamicFrameState,
      frameCount: Number(element.getAttribute('data-frame-count')),
      frameId: element.getAttribute('data-frame-id') ?? '',
      presentation: element.getAttribute('data-presentation') ?? '',
      scenario: element.getAttribute('data-scenario') ?? '',
    };
  });
}

async function readDynamicHarnessStatus(page: Page): Promise<DynamicHarnessStatus> {
  return page.evaluate(() => {
    const harness = (
      window as Window & {
        __sniptaleDynamicAnchorHarness?: { status(): DynamicHarnessStatus };
      }
    ).__sniptaleDynamicAnchorHarness;
    if (!harness) throw new Error('Dynamic anchor fixture API is unavailable.');
    return harness.status();
  });
}

function expectFrameIntentPreserved(
  actual: DynamicHarnessSnapshot,
  initial: DynamicHarnessSnapshot
): void {
  expect(actual.frameCount).toBe(1);
  expect(actual.frameId).toBe(initial.frameId);
  expect(actual.frame.id).toBe(initial.frame.id);
  expect(actual.frame.width).toBe(initial.frame.width);
  expect(actual.frame.height).toBe(initial.frame.height);
  expect(actual.frame.offset).toEqual(initial.frame.offset);
  expect(actual.frame.borderSettings).toEqual(initial.frame.borderSettings);
  expect(actual.frame.effectMode).toBe(initial.frame.effectMode);
  expect(actual.frame.linkedElementSelector).toBe(initial.frame.linkedElementSelector);
}

function expectLastGoodGeometryPreserved(
  actual: DynamicHarnessSnapshot,
  initial: DynamicHarnessSnapshot
): void {
  expect(actual.frame.x).toBe(initial.frame.x);
  expect(actual.frame.y).toBe(initial.frame.y);
  expect(actual.frame.pagePlacement).toEqual(initial.frame.pagePlacement);
}

async function expectNoGhostOverlays(page: Page): Promise<void> {
  await expect(page.locator('[data-ui="dynamic-frame"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="dynamic-toolbar"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="dynamic-focus"]')).toHaveCount(0);
}

async function expectRecovery(page: Page, status: 'ambiguous' | 'missing' | null): Promise<void> {
  const recovery = page.locator('[data-ui="dynamic-recovery"]');
  if (status === null) {
    await expect(recovery).toHaveCount(0);
    return;
  }
  await expect.poll(() => recovery.count()).toBe(1);
  await expect(recovery).toHaveAttribute('data-status', status);
}

async function expectHiddenLifecyclePhase(
  page: Page,
  opened: OpenedDynamicHarness,
  presentation: 'ambiguous' | 'missing' | 'offscreen' | 'suspended',
  recovery: 'ambiguous' | 'missing' | null
): Promise<DynamicHarnessSnapshot> {
  await expect.poll(() => opened.harness.getAttribute('data-presentation')).toBe(presentation);
  const current = await readDynamicHarnessSnapshot(opened.harness);
  expectFrameIntentPreserved(current, opened.snapshot);
  expectLastGoodGeometryPreserved(current, opened.snapshot);
  await expectNoGhostOverlays(page);
  await expectRecovery(page, recovery);
  return current;
}

async function detachAndExpectMissing(page: Page, opened: OpenedDynamicHarness): Promise<void> {
  await runDynamicAnchorAction(page, 'detach', 'detached');
  await expectHiddenLifecyclePhase(page, opened, 'missing', 'missing');
  expect(await readDynamicHarnessStatus(page)).toMatchObject({
    connected: false,
    instance: 'original',
    sameAsOriginal: true,
  });
}

async function expectToolbarInsideViewport(page: Page): Promise<void> {
  const toolbar = page.locator('[data-ui="dynamic-toolbar"]');
  await expect(toolbar).toBeVisible();
  const box = await toolbar.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThan(0);
  expect(box!.x + box!.width).toBeLessThan(viewport!.width);
  expect(box!.y).toBeGreaterThan(0);
  expect(box!.y + box!.height).toBeLessThan(viewport!.height);
}

async function openDynamicHarness(
  page: Page,
  hostOrigin: string,
  scenario: DynamicScenario
): Promise<OpenedDynamicHarness> {
  await page.setViewportSize({ width: 1040, height: 900 });
  await page.goto(`${hostOrigin}${HARNESS_PATH}?dynamic=${scenario}`, {
    waitUntil: 'domcontentloaded',
  });
  const harness = page.locator('[data-ui="dynamic-anchor-lifecycle"]');
  await expect(harness).toHaveAttribute('data-scenario', scenario);
  await expect.poll(() => harness.getAttribute('data-presentation')).toBe('visible');
  await expect.poll(() => harness.getAttribute('data-frame-count')).toBe('1');
  const frame = page.locator('[data-ui="dynamic-frame"]');
  await expect(frame).toHaveAttribute('data-frame-id', 'dynamic-frame');
  const frameRect = await frame.boundingBox();
  expect(frameRect).not.toBeNull();
  const snapshot = await readDynamicHarnessSnapshot(harness);
  expect(snapshot.frame.id).toBe('dynamic-frame');
  expect(snapshot.frame.offset).not.toEqual({ height: 0, width: 0, x: 0, y: 0 });
  expect(snapshot.frame.borderSettings.sourcePresetId).toBe('dynamic-anchor-border');
  const status = await readDynamicHarnessStatus(page);
  expect(status).toMatchObject({ connected: true, context: scenario });
  await expectRecovery(page, null);
  await expectToolbarInsideViewport(page);
  return { frameRect: frameRect!, harness, snapshot };
}

async function expectRestoredLifecyclePhase(
  page: Page,
  opened: OpenedDynamicHarness,
  expected: { instance: string; sameAsOriginal: boolean }
): Promise<void> {
  await expect.poll(() => opened.harness.getAttribute('data-presentation')).toBe('visible');
  const restored = await readDynamicHarnessSnapshot(opened.harness);
  expectFrameIntentPreserved(restored, opened.snapshot);
  expect(Math.abs(restored.frame.x - opened.snapshot.frame.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(restored.frame.y - opened.snapshot.frame.y)).toBeLessThanOrEqual(2);
  expect(restored.frame.pagePlacement.iframePath).toEqual(
    opened.snapshot.frame.pagePlacement.iframePath
  );
  expect(
    Math.abs(restored.frame.pagePlacement.pageX - opened.snapshot.frame.pagePlacement.pageX)
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(restored.frame.pagePlacement.pageY - opened.snapshot.frame.pagePlacement.pageY)
  ).toBeLessThanOrEqual(2);
  const restoredFrame = page.locator('[data-ui="dynamic-frame"]');
  await expect(restoredFrame).toHaveAttribute('data-frame-id', opened.snapshot.frame.id);
  const restoredRect = await restoredFrame.boundingBox();
  expect(restoredRect).not.toBeNull();
  expectRectClose(restoredRect!, opened.frameRect, 2);
  await expectRecovery(page, null);
  await expectToolbarInsideViewport(page);
  await expect
    .poll(async () => (await readDynamicHarnessStatus(page)).instance)
    .toBe(expected.instance);
  expect((await readDynamicHarnessStatus(page)).sameAsOriginal).toBe(expected.sameAsOriginal);
}

for (const zoomPercent of ZOOM_LEVELS) {
  test(`highlighter layers share canonical geometry at ${zoomPercent}% zoom`, async ({
    page,
    hostOrigin,
  }) => {
    await page.setViewportSize({ width: 1040, height: 900 });
    await page.goto(`${hostOrigin}${HARNESS_PATH}?zoom=${zoomPercent}`, {
      waitUntil: 'domcontentloaded',
    });
    const cases = page.locator('[data-ui="geometry-case"]');
    await expect(cases).toHaveCount(8);
    const scale = zoomPercent / 100;
    const tolerance = Math.max(0.5, 1 / (await page.evaluate(() => window.devicePixelRatio || 1)));

    for (let index = 0; index < 8; index += 1) {
      const testCase = cases.nth(index);
      const frameRect = await testCase.locator('[data-layer="frame"]').boundingBox();
      const fillRect = await testCase.locator('[data-layer="fill"]').boundingBox();
      const strokeRect = await testCase.locator('[data-layer="stroke"]').boundingBox();
      expect(frameRect).not.toBeNull();
      expect(fillRect).not.toBeNull();
      expect(strokeRect).not.toBeNull();
      expectRectClose(fillRect!, frameRect!, tolerance * scale);
      const strokeWidth = 20 * scale;
      expectRectClose(
        strokeRect!,
        {
          x: frameRect!.x - strokeWidth,
          y: frameRect!.y - strokeWidth,
          width: frameRect!.width + strokeWidth * 2,
          height: frameRect!.height + strokeWidth * 2,
        },
        tolerance * scale
      );

      const effect = testCase.locator('[data-layer="effect"]');
      if ((await effect.count()) > 0) {
        const effectRect = await effect.boundingBox();
        expect(effectRect).not.toBeNull();
        expectRectClose(effectRect!, frameRect!, tolerance * scale);
      }

      const northwest = await testCase
        .locator('[data-layer="handle"][data-direction="nw"]')
        .boundingBox();
      const southeast = await testCase
        .locator('[data-layer="handle"][data-direction="se"]')
        .boundingBox();
      expect(northwest).not.toBeNull();
      expect(southeast).not.toBeNull();
      expect(Math.abs(northwest!.x + northwest!.width / 2 - frameRect!.x)).toBeLessThanOrEqual(
        tolerance * scale
      );
      expect(Math.abs(northwest!.y + northwest!.height / 2 - frameRect!.y)).toBeLessThanOrEqual(
        tolerance * scale
      );
      expect(
        Math.abs(southeast!.x + southeast!.width / 2 - (frameRect!.x + frameRect!.width))
      ).toBeLessThanOrEqual(tolerance * scale);
      expect(
        Math.abs(southeast!.y + southeast!.height / 2 - (frameRect!.y + frameRect!.height))
      ).toBeLessThanOrEqual(tolerance * scale);
    }
  });
}

test('viewer capture keeps the thick outward stroke around the canonical surface', async ({
  page,
  hostOrigin,
}) => {
  await page.goto(`${hostOrigin}${HARNESS_PATH}?zoom=100`, { waitUntil: 'domcontentloaded' });
  const capture = page.locator('[data-ui="geometry-viewer-capture"]');
  await expect(capture).toBeVisible();

  const scan = await capture.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Viewer parity scan canvas is unavailable.');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset]! > 245 && pixels[offset + 1]! < 10 && pixels[offset + 2]! > 245) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    const surface = image.dataset['surface']!.split(',').map(Number);
    return {
      bounds: { minX, minY, maxX, maxY },
      dpr: image.naturalWidth / image.width,
      strokeWidth: Number(image.dataset['strokeWidth']),
      surface,
    };
  });

  const [x, y, width, height] = scan.surface;
  const tolerance = Math.max(0.5, 1 / scan.dpr);
  expect(Math.abs(scan.bounds.minX / scan.dpr - (x! - scan.strokeWidth))).toBeLessThanOrEqual(
    tolerance
  );
  expect(Math.abs(scan.bounds.minY / scan.dpr - (y! - scan.strokeWidth))).toBeLessThanOrEqual(
    tolerance
  );
  expect(
    Math.abs((scan.bounds.maxX + 1) / scan.dpr - (x! + width! + scan.strokeWidth))
  ).toBeLessThanOrEqual(tolerance);
  expect(
    Math.abs((scan.bounds.maxY + 1) / scan.dpr - (y! + height! + scan.strokeWidth))
  ).toBeLessThanOrEqual(tolerance);
});

test('thick frame, effect, and fill matrix matches the visual baseline', async ({
  page,
  hostOrigin,
}) => {
  await page.setViewportSize({ width: 520, height: 760 });
  await page.goto(`${hostOrigin}${HARNESS_PATH}?zoom=100`, { waitUntil: 'domcontentloaded' });
  const matrix = page.locator('[data-ui="geometry-matrix"]');
  await expect(matrix).toBeVisible();
  await expect(matrix).toHaveScreenshot('highlighter-geometry-matrix.png', {
    animations: 'disabled',
  });
});

test('dynamic carousel hides transform ghosts and restores the exact linked frame', async ({
  page,
  hostOrigin,
}) => {
  const initial = await openDynamicHarness(page, hostOrigin, 'carousel');

  await runDynamicAnchorAction(page, 'moveOut', 'carousel-out');
  await expectHiddenLifecyclePhase(page, initial, 'suspended', null);

  await page.evaluate(() => window.scrollTo(0, 100));
  await expectHiddenLifecyclePhase(page, initial, 'suspended', null);

  await page.evaluate(() => window.scrollTo(0, 0));
  await runDynamicAnchorAction(page, 'moveIn', 'carousel-in');
  await expectRestoredLifecyclePhase(page, initial, {
    instance: 'original',
    sameAsOriginal: true,
  });
});

const REACQUIRE_CASES = [
  {
    action: 'reinsert',
    event: 'reinserted',
    instance: 'original',
    name: 'detached anchor reinsert restores the same DOM instance without changing intent',
    sameAsOriginal: true,
  },
] as const;

for (const lifecycleCase of REACQUIRE_CASES) {
  test(lifecycleCase.name, async ({ page, hostOrigin }) => {
    const initial = await openDynamicHarness(page, hostOrigin, 'carousel');
    await detachAndExpectMissing(page, initial);
    await runDynamicAnchorAction(page, lifecycleCase.action, lifecycleCase.event);
    await expectRestoredLifecyclePhase(page, initial, lifecycleCase);
  });
}

test('one proven replacement stays hidden until stable samples restore the existing frame', async ({
  page,
  hostOrigin,
}) => {
  const initial = await openDynamicHarness(page, hostOrigin, 'carousel');
  await detachAndExpectMissing(page, initial);

  await runDynamicAnchorAction(page, 'replace', 'replacement-mounted');
  await expectHiddenLifecyclePhase(page, initial, 'suspended', null);
  expect(await readDynamicHarnessStatus(page)).toMatchObject({
    connected: true,
    instance: 'replacement',
    sameAsOriginal: false,
  });

  await runDynamicAnchorAction(page, 'settleReplacement', 'replacement-settled');
  await expectRestoredLifecyclePhase(page, initial, {
    instance: 'replacement',
    sameAsOriginal: false,
  });
});

test('ambiguous replacement clones retain one hidden frame and safe recovery', async ({
  page,
  hostOrigin,
}) => {
  const initial = await openDynamicHarness(page, hostOrigin, 'carousel');
  await detachAndExpectMissing(page, initial);
  await runDynamicAnchorAction(page, 'ambiguous', 'ambiguous');
  await expectHiddenLifecyclePhase(page, initial, 'ambiguous', 'ambiguous');
  await expect(page.locator('#dynamic-anchor')).toHaveCount(2);
  await expect(page.locator('[data-fixture-instance="ambiguous-a"]')).toHaveCount(1);
  await expect(page.locator('[data-fixture-instance="ambiguous-b"]')).toHaveCount(1);
});

test('a connected recycled node with changed identity is rejected', async ({
  page,
  hostOrigin,
}) => {
  const initial = await openDynamicHarness(page, hostOrigin, 'carousel');
  await runDynamicAnchorAction(page, 'recycle', 'recycled');
  await expectHiddenLifecyclePhase(page, initial, 'missing', 'missing');
  expect(await readDynamicHarnessStatus(page)).toMatchObject({
    connected: true,
    instance: 'original',
  });
  const recycled = page.locator('#dynamic-anchor');
  await expect(recycled).toHaveCount(1);
  await expect(recycled).toHaveAttribute('href', '/different-action');
  await expect(recycled).toHaveAttribute('aria-label', 'Different action');
});

test('nested scrolling suspends the genuinely nested anchor and restores it', async ({
  page,
  hostOrigin,
}) => {
  const initial = await openDynamicHarness(page, hostOrigin, 'nested');
  await expect(page.locator('[data-ui="nested-scroll"] #dynamic-anchor')).toHaveCount(1);

  await runDynamicAnchorAction(page, 'scrollNestedOut', 'nested-out');
  await expectHiddenLifecyclePhase(page, initial, 'offscreen', null);

  await runDynamicAnchorAction(page, 'scrollNestedIn', 'nested-in');
  await expectRestoredLifecyclePhase(page, initial, {
    instance: 'original',
    sameAsOriginal: true,
  });
});

test('same-origin iframe document reload loses and safely reacquires its real anchor', async ({
  page,
  hostOrigin,
}) => {
  const initial = await openDynamicHarness(page, hostOrigin, 'iframe');
  expect(await readDynamicHarnessStatus(page)).toMatchObject({
    connected: true,
    context: 'iframe',
    iframeRevision: '0',
    instance: 'iframe-0',
  });
  await expect(
    page.frameLocator('#dynamic-same-origin-iframe').locator('#dynamic-anchor')
  ).toHaveCount(1);

  await runDynamicAnchorAction(page, 'unloadIframe', 'iframe-empty');
  await expectHiddenLifecyclePhase(page, initial, 'missing', 'missing');
  expect(await readDynamicHarnessStatus(page)).toMatchObject({
    connected: false,
    context: 'iframe',
    iframeRevision: null,
    instance: null,
  });
  await expect(
    page.frameLocator('#dynamic-same-origin-iframe').locator('#dynamic-anchor')
  ).toHaveCount(0);

  await runDynamicAnchorAction(page, 'reloadIframe', 'iframe-reloaded');
  await expectRestoredLifecyclePhase(page, initial, {
    instance: 'iframe-2',
    sameAsOriginal: false,
  });
  expect(await readDynamicHarnessStatus(page)).toMatchObject({
    connected: true,
    context: 'iframe',
    iframeRevision: '2',
    instance: 'iframe-2',
  });
});

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`annotation geometry editing remains movable and contextual controls fit at ${viewport.width}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
    try {
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.highlighter"]').click();
      const target = page.locator('#measurement-target');
      const targetRect = await target.boundingBox();
      if (!targetRect) throw new Error('Target geometry unavailable');
      await page.mouse.click(
        targetRect.x + targetRect.width / 2,
        targetRect.y + targetRect.height / 2
      );
      const frame = page.locator('.sniptale-interactive-frame').first();
      await expect(frame).toBeVisible();
      await page.mouse.move(15, 220);
      const frameRect = await frame.boundingBox();
      if (!frameRect) throw new Error('Created frame geometry unavailable');
      await expect
        .poll(async () => {
          await page.mouse.move(frameRect.x, frameRect.y + frameRect.height / 2 - 3);
          await page.mouse.move(frameRect.x, frameRect.y + frameRect.height / 2 + 3);
          return page.locator('.sniptale-frame-toolbar-bridge').count();
        })
        .toBeGreaterThan(0);
      await page.screenshot({
        path: info.outputPath('annotation-before-edit.png'),
        fullPage: false,
      });
      const existingEdit = page
        .locator(
          '.sniptale-action-toolbar .lucide-pencil, .sniptale-action-toolbar .lucide-scaling'
        )
        .locator('..');
      if (await existingEdit.count()) await existingEdit.click();
      else {
        const bridge = page.locator('.sniptale-frame-toolbar-bridge').first();
        await expect(bridge).toBeVisible();
        const edit = bridge.locator('[data-quick-action="edit"]');
        if (await edit.count()) await edit.click();
        else {
          await bridge.locator('.sniptale-frame-toolbar-trigger').click();
          await existingEdit.click();
        }
      }
      await expect(frame).toHaveCSS('cursor', 'move');
      expect(
        await frame.evaluate((element) => {
          const root = element.getRootNode() as ShadowRoot;
          return root
            .elementFromPoint(innerWidth - 5, innerHeight - 5)
            ?.classList.contains('sniptale-editing-blocking-overlay');
        }),
        'The page outside the edited frame remains shielded'
      ).toBe(true);
      const sizePanel = page.locator('.sniptale-content-size-tooltip');
      await expect.soft(sizePanel).toHaveCSS('border-radius', '4px', { timeout: 100 });
      const alpha = await sizePanel.evaluate((element) => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.fillStyle = getComputedStyle(element).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return context.getImageData(0, 0, 1, 1).data[3];
      });
      expect.soft(alpha, 'Geometry toolbar occludes host-page text').toBe(255);
      for (const input of await sizePanel.locator('input').all()) {
        await expect.soft(input).toHaveCSS('height', '32px', { timeout: 100 });
        await expect.soft(input).toHaveCSS('border-radius', '4px', { timeout: 100 });
        await expect.soft(input).toHaveCSS('font-size', '13px', { timeout: 100 });
        await expect.soft(input).toHaveCSS('font-weight', '400', { timeout: 100 });
        await expect.soft(input).toHaveCSS('font-family', /Sniptale Interface/u, { timeout: 100 });
      }
      for (const button of await sizePanel.locator('button').all())
        await expect.soft(button).toHaveCSS('border-radius', '4px', { timeout: 100 });
      await page.screenshot({
        path: info.outputPath('annotation-geometry-mode.png'),
        fullPage: false,
      });
      const before = await frame.boundingBox();
      if (!before) throw new Error('Frame geometry unavailable');
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      await info.attach('frame-hit-target', {
        body: JSON.stringify(
          await frame.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const root = element.getRootNode() as ShadowRoot;
            const hit = root.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return { frame: element.outerHTML, hit: hit?.outerHTML };
          })
        ),
        contentType: 'application/json',
      });
      await page.mouse.down();
      await page.mouse.move(before.x + before.width / 2 + 32, before.y + before.height / 2 - 24, {
        steps: 5,
      });
      await page.mouse.up();
      await page.screenshot({
        path: info.outputPath('annotation-after-drag.png'),
        fullPage: false,
      });
      await expect.poll(async () => (await frame.boundingBox())?.x).toBeCloseTo(before.x + 32, 0);
      await expect.poll(async () => (await frame.boundingBox())?.y).toBeCloseTo(before.y - 24, 0);
      await page.screenshot({ path: info.outputPath('annotation-moved.png'), fullPage: false });
      await page
        .locator('.sniptale-content-size-tooltip')
        .getByRole('button', { name: 'Save', exact: true })
        .click();
      await expect(page.locator('.sniptale-content-size-tooltip')).toHaveCount(0);
      await expect.poll(async () => (await frame.boundingBox())?.x).toBeCloseTo(before.x + 32, 0);
      await target.evaluate((element) => {
        element.style.left = '60px';
      });
      await expect.poll(async () => (await frame.boundingBox())?.x).toBeCloseTo(before.x + 52, 0);
      await page.screenshot({
        path: info.outputPath('annotation-linked-anchor-moved.png'),
        fullPage: false,
      });
    } finally {
      await page.close();
      await popup.close();
    }
  });
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`annotation settings keep labels clear of contextual sliders and use opaque material at ${viewport.width}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
    try {
      await popup.evaluate(async () => {
        await chrome.storage.local.set({ 'sniptale-locale-preference': 'ru' });
      });
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.highlighter"]').click();
      for (const menu of [
        'future-frame-style',
        'future-frame-step-badge',
        'future-frame-callout',
      ]) {
        await page.locator(`[data-ui="content.toolbar.${menu}.menu"]`).click();
        const popover = page.locator('.sniptale-content-appearance-surface:visible').last();
        await expect(popover).toBeVisible();
        const alpha = await popover.evaluate((element) => {
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas unavailable');
          context.fillStyle = getComputedStyle(element).backgroundColor;
          context.fillRect(0, 0, 1, 1);
          return context.getImageData(0, 0, 1, 1).data[3];
        });
        expect.soft(alpha, `${menu} fully occludes page text`).toBe(255);
        const fork = popover.locator('[data-template-fork-source]').first();
        await fork.focus();
        await fork.press('Enter');
        if (menu === 'future-frame-step-badge') {
          await popover.getByRole('button', { name: /^(Size|Размер)$/u, exact: true }).click();
          await popover.getByRole('button', { name: /^(Custom|Свой)$/u, exact: true }).click();
        }
        if (menu === 'future-frame-callout')
          await popover
            .getByRole('button', { name: /^(Size & spacing|Размер и отступы)$/u, exact: true })
            .click();
        const rows = popover.locator(
          '[data-ui="shared.ui.compact-inspector.numeric-row"][data-has-scrub="true"]'
        );
        expect(await rows.count()).toBeGreaterThan(0);
        for (const row of await rows.all()) {
          await row.hover();
          const gap = await row.evaluate((element) => {
            const label = element.querySelector('.sniptale-parameter-name');
            const track = element.querySelector(
              '[data-ui="shared.ui.compact-inspector.numeric-range-track"]'
            );
            if (!label || !track) throw new Error('Numeric row geometry unavailable');
            const range = document.createRange();
            range.selectNodeContents(label);
            return track.getBoundingClientRect().top - range.getBoundingClientRect().bottom;
          });
          expect
            .soft(gap, 'Slider track leaves the complete parameter label readable')
            .toBeGreaterThanOrEqual(2);
        }
        await page.screenshot({ path: info.outputPath(`${menu}-parameters.png`), fullPage: false });
        const categories = popover.locator('nav button');
        for (let index = 0; index < (await categories.count()); index += 1) {
          const category = categories.nth(index);
          await category.scrollIntoViewIfNeeded();
          await category.click();
          await expect(category).toHaveAttribute('aria-pressed', 'true');
          if (menu === 'future-frame-callout') {
            const enable = popover.locator(
              '[data-ui="shared.categorized-inspector.section-heading"] .sniptale-glass-switch:not(.sniptale-glass-switch--on)'
            );
            if (await enable.count()) await enable.click();
          }
          for (const disclosure of await popover.locator('details:not([open]) > summary').all())
            await disclosure.click();
          const escapedControls = await popover
            .locator('.sniptale-parameter-value > *')
            .evaluateAll((elements) =>
              elements.flatMap((element) => {
                const bounds = element.getBoundingClientRect();
                const surface = element
                  .closest('.sniptale-content-appearance-surface')
                  ?.getBoundingClientRect();
                if (!surface || bounds.width === 0 || bounds.height === 0) return [];
                return bounds.right > surface.right - 4 || bounds.left < surface.left + 4
                  ? [
                      {
                        label: element.closest('.sniptale-parameter-row')?.textContent,
                        left: bounds.left,
                        right: bounds.right,
                        surfaceLeft: surface.left,
                        surfaceRight: surface.right,
                      },
                    ]
                  : [];
              })
            );
          expect(
            escapedControls,
            'Visible value constructions remain inside the inspector material'
          ).toEqual([]);
          await page.screenshot({
            path: info.outputPath(`${menu}-category-${index}.png`),
            fullPage: false,
          });
        }
        const saveCategory = popover.locator('nav button').last();
        await saveCategory.scrollIntoViewIfNeeded();
        await saveCategory.click();
        await expect(saveCategory).toHaveAttribute('aria-pressed', 'true');
        await page.screenshot({
          path: info.outputPath(`${menu}-save-controls.png`),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
      }
    } finally {
      await popup.evaluate(async () => {
        await chrome.storage.local.set({ 'sniptale-locale-preference': 'en' });
      });
      await page.close();
      await popup.close();
    }
  });
}

test('native comment handle hover has one soft halo', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  try {
    const target = page.locator('#measurement-target');
    await target.evaluate((element) => {
      element.style.width = '320px';
      element.style.height = '100px';
    });
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator('[data-ui="content.toolbar.mode-option.highlighter"]').click();
    const targetRect = await target.boundingBox();
    if (!targetRect) throw new Error('Target geometry unavailable');
    await page.mouse.click(
      targetRect.x + targetRect.width / 2,
      targetRect.y + targetRect.height / 2
    );
    const frame = page.locator('.sniptale-interactive-frame').first();
    await expect(frame).toBeVisible();
    const frameRect = await frame.boundingBox();
    if (!frameRect) throw new Error('Frame geometry unavailable');
    await expect
      .poll(async () => {
        await page.mouse.move(frameRect.x, frameRect.y + 30);
        await page.mouse.move(frameRect.x, frameRect.y + 36);
        return page.locator('[data-quick-action="callout"]').count();
      })
      .toBeGreaterThan(0);
    await page.locator('[data-quick-action="callout"]').click();
    const callout = page.locator('.sniptale-callout').first();
    await expect(callout).toBeVisible();
    const body = callout.locator('[contenteditable="true"]');
    await body.fill('Comment geometry feedback');
    await body.press('Escape');
    await callout.hover();
    const handle = page.locator('.sniptale-callout-drag-handle').first();
    await handle.hover();
    await page.screenshot({ path: info.outputPath('comment-handle-hover.png'), fullPage: false });
    const halo = await handle.evaluate((element) => {
      const css = getComputedStyle(element);
      const shadow = css.boxShadow.replace(/(?:rgba?|color|color-mix)\([^)]*\)/gu, '').trim();
      const lengths = shadow.match(/-?[\d.]+px/gu)?.map(Number.parseFloat) ?? [];
      return { shadow: css.boxShadow, blur: lengths[2] ?? 0, border: css.borderColor };
    });
    await info.attach('comment-handle-halo', {
      body: JSON.stringify(halo),
      contentType: 'application/json',
    });
    expect
      .soft(halo.blur, 'Hover halo has a positive blur instead of a hard spread ring')
      .toBeGreaterThan(0);
    await page.locator('.sniptale-callout-settings-handle').first().click();
    const popover = page.locator('[data-ui="content.callout-settings.popover"]');
    await expect(popover).toBeVisible();
    const fork = popover.locator('[data-template-fork-source]').first();
    if (await fork.count()) {
      await fork.focus();
      await fork.press('Enter');
    }
    const category = popover.getByRole('button', { name: 'Size & spacing', exact: true });
    await category.click();
    const focusPaint = await category.evaluate((element) => {
      const css = getComputedStyle(element);
      return {
        outline: css.outlineStyle,
        shadow: css.boxShadow,
        focused: element.matches(':focus-visible'),
        outlineColor: css.outlineColor,
      };
    });
    await info.attach('comment-category-pointer-focus', {
      body: JSON.stringify(focusPaint),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('comment-size-settings.png'), fullPage: false });
    expect.soft(focusPaint.outline).toBe('none');
    if (focusPaint.focused) expect.soft(focusPaint.shadow).toContain('inset');
  } finally {
    await page.close();
    await popup.close();
  }
});

for (const opening of [
  { name: 'new empty', html: '', editing: true },
  { name: 'existing editing', html: 'Existing comment text', editing: true },
  { name: 'existing viewing', html: 'Existing comment text', editing: false },
])
  test(`${opening.name} callout paints its measured width on the first animation frame`, async ({
    page,
  }, info) => {
    const calloutPath = 'apps/extension/src/features/highlighter/frame-annotation/callout';
    const bundled = await build({
      stdin: {
        contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useFrameCalloutEditing} from ${JSON.stringify(resolve(calloutPath, 'editing.ts'))};
import {FrameCalloutInteractiveSurface} from ${JSON.stringify(resolve(calloutPath, 'interactive-surface.tsx'))};
import {createDefaultCalloutSettings} from ${JSON.stringify(resolve(calloutPath, 'model.ts'))};
import {createFrameCalloutActions} from ${JSON.stringify(resolve(calloutPath, 'actions.ts'))};
const settings=createDefaultCalloutSettings();settings.content.bodyHtml=${JSON.stringify(opening.html)};
const noop=()=>{};
function Comment(){
 const editing=useFrameCalloutEditing({frameId:'probe',htmlContent:settings.content.bodyHtml,isEditing:${opening.editing},onContentChange:noop,onDelete:noop,onStartEditing:noop,onStopEditing:noop,settingsKey:'probe'});
 const actions=createFrameCalloutActions({apply:noop,callout:settings,onDelete:noop,onSettingsClick:noop,onStartEditing:noop,onStopEditing:noop});
 return <FrameCalloutInteractiveSurface {...actions} chrome="export" chromeScale={1} editing={editing} frameBorderWidth={0} frameId="probe" frameRect={{x:300,y:300,width:200,height:80}} isEditing={${opening.editing}} isFrameEditing={false} isSettingsOpen={false} portalTarget={document.body} portalTheme={null} settings={settings} settingsAnchorRef={{current:null}} showSettingsHandle={false} zIndex={10}/>;
}
function App(){const[open,setOpen]=useState(false);return <><button id="open" onClick={()=>setOpen(true)}>Add</button>{open&&<Comment/>}</>}
window.calloutOpeningFrames=[];
function sample(){const s=document.querySelector('[data-ui="content.callout.surface-compositor"]');if(s){const r=s.getBoundingClientRect();window.calloutOpeningFrames.push({time:performance.now(),width:r.width,height:r.height});}requestAnimationFrame(sample)}requestAnimationFrame(sample);
createRoot(document.getElementById('root')).render(<App/>);
`,
        resolveDir: process.cwd(),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    await page.setContent('<!doctype html><div id="root"></div>');
    await page.addScriptTag({ content: bundled.outputFiles[0]!.text });
    await page.locator('#open').click();
    const readFrames = () =>
      page.evaluate(() => {
        const host = window as typeof window & {
          calloutOpeningFrames: Array<{ width: number; height: number }>;
        };
        return host.calloutOpeningFrames;
      });
    await expect.poll(async () => (await readFrames()).length).toBeGreaterThanOrEqual(10);
    const frames = await readFrames();
    const settledWidth = frames.at(-1)!.width;
    expect(settledWidth).toBeGreaterThan(0);
    for (const frame of frames) {
      // One CSS pixel admits subpixel rounding, but cannot hide the 200 px fallback flash.
      expect(Math.abs(frame.width - settledWidth)).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: info.outputPath('callout-initial-width.png'), fullPage: false });
  });

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`annotation color transaction and compact controls at ${viewport.width}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
    try {
      const target = page.locator('#measurement-target');
      await target.evaluate((element) => {
        element.style.width = '320px';
        element.style.height = '100px';
      });
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.highlighter"]').click();
      const targetBox = await target.boundingBox();
      if (!targetBox) throw new Error('Annotation target is unavailable');
      await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      const frame = page.locator('.sniptale-interactive-frame').first();
      await expect(frame).toBeVisible();
      const frameBox = await frame.boundingBox();
      if (!frameBox) throw new Error('Annotation frame is unavailable');
      await expect
        .poll(async () => {
          await page.mouse.move(frameBox.x, frameBox.y + 30);
          await page.mouse.move(frameBox.x, frameBox.y + 36);
          return page.locator('[data-quick-action="callout"]').count();
        })
        .toBeGreaterThan(0);
      await expect(page.locator('[data-quick-action="settings"] .lucide-square')).toBeVisible();
      const iconGeometry = await page
        .locator('.sniptale-frame-toolbar-bridge button')
        .evaluateAll((buttons) =>
          buttons.map((button) => {
            const target = button.getBoundingClientRect();
            const icon = button.querySelector('svg')?.getBoundingClientRect();
            if (!icon) throw new Error('Frame action icon is unavailable');
            return {
              width: icon.width,
              height: icon.height,
              dx: icon.x + icon.width / 2 - target.x - target.width / 2,
              dy: icon.y + icon.height / 2 - target.y - target.height / 2,
            };
          })
        );
      for (const icon of iconGeometry) {
        expect(icon.width).toBe(16);
        expect(icon.height).toBe(16);
        expect(Math.abs(icon.dx)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(icon.dy)).toBeLessThanOrEqual(0.5);
      }
      await page.screenshot({
        path: info.outputPath('frame-circular-actions.png'),
        fullPage: false,
      });
      await page.locator('[data-quick-action="callout"]').click();
      const callout = page.locator('.sniptale-callout').first();
      const editable = callout.locator('[contenteditable="true"]');
      await editable.fill('Color transaction acceptance');
      await editable.press('Escape');
      await page.mouse.move(viewport.width - 1, viewport.height - 1);
      await callout.hover();
      await expect(page.locator('.sniptale-callout-settings-handle').first()).toHaveCSS(
        'pointer-events',
        'auto'
      );
      await expect(page.locator('.sniptale-callout-settings-handle').first()).toHaveCSS(
        'opacity',
        '1'
      );
      await page.locator('.sniptale-callout-settings-handle').first().click();
      const settings = page.locator('[data-ui="content.callout-settings.popover"]');
      await expect(settings).toBeVisible();
      const fork = settings.locator('[data-template-fork-source]').first();
      if (await fork.count()) {
        await fork.focus();
        await fork.press('Enter');
      }
      const colorRow = settings
        .locator('.sniptale-parameter-row')
        .filter({ has: page.getByRole('button', { name: 'Text color', exact: true }) })
        .first();
      const swatch = colorRow.locator('[data-ui="shared.ui.color-selector.picker-trigger"]');
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
      const body = callout.locator('[data-sniptale-callout-body-layout]');
      const originalColor = await body.evaluate((element) => getComputedStyle(element).color);
      await page.screenshot({
        path: info.outputPath('comment-color-before-transaction.png'),
        fullPage: false,
      });
      await swatch.click();
      await expect(picker).toBeVisible();
      await picker
        .locator('[data-ui="shared.ui.color-selector.picker-palette"] button')
        .first()
        .click();
      await expect(body).toHaveCSS('color', originalColor);
      await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(body).toHaveCSS('color', originalColor);
      await swatch.click();
      await picker
        .locator('[data-ui="shared.ui.color-selector.picker-palette"] button')
        .first()
        .click();
      await picker.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect(body).toHaveCSS('color', 'rgb(248, 250, 252)');
      await swatch.click();
      const plane = picker.getByRole('slider', { name: 'Choose color', exact: true }).first();
      await plane.focus();
      await plane.press('ArrowRight');
      await page.keyboard.press('Escape');
      await expect(picker).toBeHidden();
      await expect(settings).toBeVisible();
      const neutralFocus = await swatch.evaluate((element) => {
        const sample = document.createElement('span');
        sample.style.color = 'var(--sniptale-color-border-strong)';
        element.append(sample);
        const color = getComputedStyle(sample).color;
        sample.remove();
        return color;
      });
      await expect(swatch).toHaveCSS('outline-color', neutralFocus);
      await expect(swatch).toHaveCSS('outline-width', '1px');
      await expect(body).toHaveCSS('color', 'rgb(248, 250, 252)');
      await expect(colorRow).toHaveAttribute('data-layout', 'inline');
      const manualSurface = settings.locator(
        '[data-ui="shared.highlighter-manual-inspector-surface"]'
      );
      await expect(manualSurface).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(manualSurface).toHaveCSS('border-top-width', '0px');
      await page.screenshot({
        path: info.outputPath('annotation-text-controls.png'),
        fullPage: false,
      });
      await swatch.click();
      await expect(picker).toBeVisible();
      await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(settings).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(settings).toBeHidden();
      await body.click();
      await expect(editable).toBeVisible();
      await expect(body).toHaveCSS('color', 'rgb(248, 250, 252)');
      await editable.press('Escape');
      await page.mouse.move(viewport.width - 1, viewport.height - 1);
      await callout.hover();
      await expect(page.locator('.sniptale-callout-settings-handle').first()).toHaveCSS(
        'pointer-events',
        'auto'
      );
      await expect(page.locator('.sniptale-callout-settings-handle').first()).toHaveCSS(
        'opacity',
        '1'
      );
      await page.locator('.sniptale-callout-settings-handle').first().click();
      await expect(settings).toBeVisible();
      await swatch.click();
      const pointerPlane = picker
        .getByRole('slider', { name: 'Choose color', exact: true })
        .first();
      const planeBox = await pointerPlane.boundingBox();
      if (!planeBox) throw new Error('Text color plane is unavailable');
      const previousSelection = await pointerPlane.getAttribute('aria-valuetext');
      await page.mouse.click(
        planeBox.x + planeBox.width * 0.75,
        planeBox.y + planeBox.height * 0.4
      );
      await expect(pointerPlane).not.toHaveAttribute('aria-valuetext', previousSelection ?? '');
      await picker.getByRole('textbox', { name: 'HEX', exact: true }).fill('#12ab34');
      await picker.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect(body).toHaveCSS('color', 'rgb(18, 171, 52)');
      await expect(body).toContainText('Color transaction acceptance');
      await swatch.click();
      await expect(picker.getByRole('textbox', { name: 'HEX', exact: true })).toHaveValue(
        /12ab34/i
      );
      const eyedropper = picker.locator('[data-ui="shared.ui.color-selector.eyedropper"]');
      if (await eyedropper.count()) {
        await eyedropper.click();
        await page.keyboard.press('Escape');
        await expect(settings).toBeVisible();
      }
      if (await picker.isVisible())
        await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(body).toHaveCSS('color', 'rgb(18, 171, 52)');
      await page.keyboard.press('Escape');
      await expect(settings).toBeHidden();
      await body.click();
      await expect(editable).toBeVisible();
      await expect(body).toHaveCSS('color', 'rgb(18, 171, 52)');
      await page.screenshot({
        path: info.outputPath('editing-comment-committed-color.png'),
        fullPage: false,
      });
    } finally {
      await page.close();
      await popup.close();
    }
  });
}
