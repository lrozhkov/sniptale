import { mkdir } from 'node:fs/promises';
import { CONTENT_APP_CONTAINER_ID, CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createTextClip } from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';
import { createVideoProjectFromMultiSourceRecording } from '../../../../apps/extension/src/features/video/project/factories/multi-source-recording';
import {
  VideoTrackKind,
  VideoProjectClipType,
  VideoProjectTrackRole,
} from '../../../../apps/extension/src/features/video/project/types';
import { test, expect, resolveExtensionServiceWorkerUrl } from '../support/extension-fixture';
import {
  captureDesignSystemScreenshot,
  expectFloatingPreviewContained,
  expectThemeSurfaceToggle,
} from './extension-smoke.helpers';
import { verifyPopupStartupLifecycle } from './extension-smoke.popup-startup';

const SETTINGS_AI_NAV_LABEL = translate('settings.navigation.aiConnections', 'ru');
const SETTINGS_AI_PROMPTS_NAV_LABEL = translate('settings.navigation.aiPrompts', 'ru');
const SETTINGS_AI_PROVIDERS_TITLE = translate('settings.aiProviders.providersTitle', 'ru');
const SETTINGS_AI_MODELS_TITLE = translate('settings.aiProviders.modelsTitle', 'ru');
const SETTINGS_AI_SAVED_PROMPTS_LABEL = translate('templates.section.savedLabel', 'ru');
const POPUP_HARNESS_PATH = '/tooling/test/harness/popup.html';
const POPUP_HOME_TAB_LABEL = translate('popup.tabs.home', 'ru');
const POPUP_VIDEO_TAB_LABEL = translate('popup.tabs.video', 'ru');
const POPUP_EXPORT_TAB_LABEL = translate('popup.tabs.export', 'ru');
const VIDEO_EDITOR_HARNESS_PATH = '/tooling/test/harness/video-editor.html';

const builtExtensionPages = [
  {
    name: 'popup',
    path: '/apps/extension/src/popup/index.html',
    selector: '[data-ui="popup.app.root"]',
    viewport: { width: 420, height: 760 },
  },
  {
    name: 'settings',
    path: '/apps/extension/src/settings/index.html',
    selector: '[data-ui="settings.page.root"]',
    viewport: { width: 1440, height: 1100 },
  },
  {
    name: 'gallery',
    path: '/apps/extension/src/gallery/index.html',
    selector: '[data-ui="gallery.page.root"]',
    viewport: { width: 1440, height: 1100 },
  },
  {
    name: 'editor',
    path: '/apps/extension/src/editor/index.html',
    selector: '[data-ui="editor.page.root"]',
    viewport: { width: 1600, height: 1100 },
  },
  {
    name: 'video-editor',
    path: '/apps/extension/src/video-editor/index.html',
    selector: '[data-ui="video-editor.workspace.root"]',
    viewport: { width: 1600, height: 1100 },
  },
  {
    name: 'scenario-editor',
    path: '/apps/extension/src/scenario-editor/index.html',
    selector: '[data-ui="scenario.editor.v3-page.root"]',
    viewport: { width: 1600, height: 1100 },
  },
] as const;

async function expectBuiltSurfaceLayout(
  page: import('@playwright/test').Page,
  selector: string,
  viewport: { width: number; height: number }
): Promise<void> {
  const root = page.locator(selector).first();
  await expect(root).toBeVisible();
  const bounds = await root.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(Math.min(380, viewport.width * 0.9));
  expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(Math.min(540, viewport.height * 0.9));
  await expect
    .poll(() => page.evaluate(() => document.styleSheets.length))
    .toBeGreaterThanOrEqual(1);
}

async function expectBuiltVideoEditorGeometry(
  page: import('@playwright/test').Page,
  effectsDockScreenshotPath: string
): Promise<void> {
  const canvasShell = page.locator('[data-ui="video-editor.workspace.canvas-shell"]');
  const documentBar = page.locator('[data-ui="video-editor.floating.document-bar"]');
  const effectsDock = page.locator('[data-ui="video-editor.effects-library.dock"]');
  const effectsToggle = page.locator('[data-ui="video-editor.floating.insert-panel.templates"]');
  const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
  const preview = page.locator('[data-ui="video.preview.viewport"]');
  const timeline = page.locator('[data-ui="video-editor.timeline.surface"]');

  await expect(canvasShell).toBeVisible();
  await expect(documentBar).toBeVisible();
  await expect(effectsDock).toHaveCount(0);
  await expect(effectsToggle).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(timeline).toBeVisible();

  await expect
    .poll(() =>
      canvasShell.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          paddingRight: style.paddingRight,
          paddingTop: style.paddingTop,
        };
      })
    )
    .toEqual({
      paddingRight: '12px',
      paddingTop: '0px',
    });

  const defaultPreviewWidth = await preview.evaluate(
    (element) => element.getBoundingClientRect().width
  );

  await effectsToggle.click();
  await expect(effectsDock).toBeVisible();

  const geometry = await page.evaluate(() => {
    const getBounds = (selector: string) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      const bounds = element.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
      };
    };
    return {
      documentBar: getBounds('[data-ui="video-editor.floating.document-bar"]'),
      effectsDock: getBounds('[data-ui="video-editor.effects-library.dock"]'),
      inspector: getBounds('[data-ui="video-editor.floating.context-inspector"]'),
      preview: getBounds('[data-ui="video.preview.viewport"]'),
      timeline: getBounds('[data-ui="video-editor.timeline.surface"]'),
    };
  });

  expect(geometry.effectsDock.top).toBeGreaterThanOrEqual(geometry.documentBar.bottom);
  expect(geometry.effectsDock.right - geometry.effectsDock.left).toBeLessThanOrEqual(448);
  expect(geometry.preview.right).toBeLessThanOrEqual(geometry.inspector.left);
  expect(geometry.timeline.right).toBeGreaterThanOrEqual(geometry.inspector.right);
  expect(geometry.inspector.bottom).toBeLessThanOrEqual(geometry.timeline.top);
  const dock = inspector.locator('[data-ui="video-editor.inspector.dock-toggle"]');
  await dock.click();
  await expect(dock).toHaveAttribute('aria-pressed', 'true');
  const fullInspector = await inspector.boundingBox();
  const fullTimeline = await page
    .locator('[data-ui="video-editor.timeline.surface"]')
    .boundingBox();
  if (!fullInspector || !fullTimeline) throw new Error('Missing full-height workspace bounds');
  expect(fullTimeline.x + fullTimeline.width).toBeLessThanOrEqual(fullInspector.x);
  expect(fullInspector.y + fullInspector.height).toBeCloseTo(
    fullTimeline.y + fullTimeline.height,
    0
  );
  await dock.click();
  await expect(dock).toHaveAttribute('aria-pressed', 'false');

  expect(geometry.preview.right - geometry.preview.left).toBeLessThan(defaultPreviewWidth);

  const divider = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
  await divider.focus();
  await divider.press('ArrowLeft');
  await expect(divider).toHaveAttribute('aria-valuenow', '344');
  await expect
    .poll(() => preview.evaluate((element) => element.getBoundingClientRect().right))
    .toBe(geometry.preview.right - 24);
  await expect
    .poll(() => timeline.evaluate((element) => element.getBoundingClientRect().right))
    .toBe(geometry.timeline.right);
  await divider.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '320');
  const dividerBox = await divider.boundingBox();
  if (!dividerBox) throw new Error('Missing inspector divider');
  expect(dividerBox.x).toBeGreaterThanOrEqual(geometry.preview.right);
  expect(dividerBox.x + dividerBox.width).toBeLessThanOrEqual(geometry.inspector.left);
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(dividerBox.x + dividerBox.width / 2 - 80, dividerBox.y + 100);
  await page.mouse.up();
  await expect(divider).toHaveAttribute('aria-valuenow', '400');
  await expect
    .poll(() => timeline.evaluate((element) => element.getBoundingClientRect().right))
    .toBe(geometry.timeline.right);

  await page.screenshot({
    fullPage: true,
    path: effectsDockScreenshotPath,
  });

  await page.evaluate(() => chrome.storage.local.set({ 'sniptale-theme-preference': 'dark' }));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: effectsDockScreenshotPath.replace('.png', '-dark.png'),
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(inspector).toBeVisible();
  await expect(divider).toBeVisible();
  await expect(canvasShell).toHaveCSS('padding-right', '12px');
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: effectsDockScreenshotPath.replace('.png', '-compact.png'),
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await expect(divider).toHaveAttribute('aria-valuenow', '400');
  await expect
    .poll(() => timeline.evaluate((element) => element.getBoundingClientRect().right))
    .toBe(geometry.timeline.right);
  await page.evaluate(() => chrome.storage.local.set({ 'sniptale-theme-preference': 'light' }));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await divider.focus();
  const resizedBox = await divider.boundingBox();
  if (!resizedBox) throw new Error('Missing resized inspector divider');
  await page.mouse.move(resizedBox.x + resizedBox.width / 2, resizedBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(resizedBox.x + resizedBox.width / 2 + 80, resizedBox.y + 100);
  await page.mouse.up();
  await expect(divider).toHaveAttribute('aria-valuenow', '320');

  await effectsToggle.click();
  await expect(effectsDock).toHaveCount(0);
  await expect
    .poll(() => preview.evaluate((element) => element.getBoundingClientRect().width))
    .toBe(defaultPreviewWidth);
}

async function verifyVideoEditorAddTrackMenu(
  page: import('@playwright/test').Page,
  screenshotPath: string
): Promise<void> {
  const addTrackButton = page.locator('[data-ui="video-editor.timeline.toolbar.add-track"]');
  await addTrackButton.click();
  const addTrackMenu = page.locator('[data-ui="video-editor.timeline.toolbar.add-track.choices"]');
  await expect(
    addTrackMenu.locator('[data-ui="video-editor.timeline.toolbar.add-track.primary"]')
  ).toBeVisible();
  for (const key of [
    'videoEditor.timeline.addVideoTrackNote',
    'videoEditor.timeline.addAudioTrackNote',
    'videoEditor.timeline.addOverlayTrackNote',
  ] as const) {
    await expect(addTrackMenu.getByText(translate(key, 'ru'), { exact: true })).toBeVisible();
  }
  await expect(addTrackMenu.locator('.sniptale-toolbar-menu-item')).toHaveCount(3);
  await expect(
    addTrackMenu.getByText(translate('videoEditor.timeline.addSubtitleTrack', 'ru'), {
      exact: true,
    })
  ).toHaveCount(0);
  await page.screenshot({ fullPage: true, path: screenshotPath });
  await page.keyboard.press('Escape');
  await expect(addTrackMenu).toHaveCount(0);
  await expect(addTrackButton).toBeFocused();
}

async function verifyVideoEditorTrackRename(
  page: import('@playwright/test').Page,
  screenshotPath: string
): Promise<void> {
  const cameraTrackButton = page
    .locator('[data-ui="video-editor.timeline.track-select"]')
    .filter({ hasText: 'Camera' });
  await cameraTrackButton.click();

  const nameInput = page.getByRole('textbox', {
    name: translate('videoEditor.sidebar.trackNameLabel', 'ru'),
  });
  await nameInput.fill('Face cam');
  await nameInput.press('Enter');

  await expect(
    page.locator('[data-ui="video-editor.timeline.track-select"]').filter({ hasText: 'Face cam' })
  ).toBeVisible();
  await expect(
    page
      .locator('[data-ui="video-editor.workspace.sidebar-header-title-row"]')
      .getByText('Face cam', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('group', {
      name: translate('videoEditor.sidebar.inspectorGroupSwitcherLabel', 'ru'),
    })
  ).toHaveCount(0);
  const visibilityToggle = page.getByRole('button', {
    name: translate('videoEditor.sidebar.trackVisibilityLabel', 'ru'),
  });
  const lockToggle = page.getByRole('button', {
    name: translate('videoEditor.sidebar.trackLockLabel', 'ru'),
  });
  await expect(visibilityToggle).toHaveAttribute('aria-pressed', 'true');
  await visibilityToggle.click();
  await expect(visibilityToggle).toHaveAttribute('aria-pressed', 'false');
  await visibilityToggle.click();
  await expect(visibilityToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(lockToggle).toHaveAttribute('aria-pressed', 'false');
  await lockToggle.click();
  await expect(lockToggle).toHaveAttribute('aria-pressed', 'true');
  await lockToggle.click();
  await expect(lockToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('OVERLAY', { exact: true })).toHaveCount(0);
  await expect(page.getByText('PRIMARY', { exact: true })).toHaveCount(0);
  await page.screenshot({ fullPage: true, path: screenshotPath });
}

async function verifyVideoEditorTimelineBoundaries(
  page: import('@playwright/test').Page,
  screenshotPath: string,
  compactScreenshotPath: string,
  scrolledScreenshotPath: string
): Promise<void> {
  const counter = page.locator('[data-playback-counter="true"]');
  const seekToStart = page.getByRole('button', {
    name: translate('videoEditor.timeline.seekToStart', 'ru'),
  });
  const seekToEnd = page.getByRole('button', {
    exact: true,
    name: translate('videoEditor.timeline.seekToEnd', 'ru'),
  });
  const previousFrame = page.getByRole('button', {
    name: translate('videoEditor.timeline.previousFrame', 'ru'),
  });
  const nextFrame = page.getByRole('button', {
    name: translate('videoEditor.timeline.nextFrame', 'ru'),
  });
  const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');

  for (let step = 0; step < 3; step += 1) await nextFrame.click();
  await expect(counter).toContainText('0:00.1 / 0:12.0');
  for (let step = 0; step < 3; step += 1) await page.keyboard.press(',');
  await expect(counter).toContainText('0:00.0 / 0:12.0');
  await seekToEnd.click();
  await expect(counter).toContainText('0:12.0 / 0:12.0');
  await page.keyboard.press('Home');
  await expect(counter).toContainText('0:00.0 / 0:12.0');
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-timeline-hover-preview="true"]')).toHaveCount(0);
  await page.keyboard.press('End');
  await expect(counter).toContainText('0:12.0 / 0:12.0');
  await seekToStart.click();
  await expect(counter).toContainText('0:00.0 / 0:12.0');
  const playheadBox = await playhead.boundingBox();
  if (!playheadBox) throw new Error('Expected a visible timeline playhead handle');
  await page.mouse.move(playheadBox.x + playheadBox.width / 2, playheadBox.y + 8);
  await page.mouse.down();
  await page.mouse.move(playheadBox.x + playheadBox.width / 2 + 90, playheadBox.y + 8);
  await page.mouse.up();
  await expect(counter).not.toContainText('0:00.0 / 0:12.0');
  await page.keyboard.press('Home');
  await expect(counter).toContainText('0:00.0 / 0:12.0');
  await page.screenshot({ fullPage: true, path: screenshotPath });

  for (let index = 0; index < 3; index++) {
    await page.locator('[data-ui="video-editor.timeline.toolbar.add-track"]').click();
    await page.locator('[data-ui="video-editor.timeline.toolbar.add-track.primary"]').click();
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  const materialsToggle = page.getByRole('button', {
    name: translate('videoEditor.app.materialsTitle', 'ru'),
    exact: true,
  });
  const materials = page.locator('[data-ui="video-editor.materials"]');
  const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
  const inspectorToggle = page.locator('[data-ui="video-editor.floating.document-bar.inspector"]');
  const workspace = page.locator('[data-ui="video-editor.workspace.root"]');
  await expect(materials).toBeVisible();
  await expect(inspector).toBeVisible();
  const inspectorNode = await inspector.elementHandle();
  const materialSource = materials.locator('button[aria-pressed]').first();
  await expect(materialSource).toBeVisible();
  await expect
    .poll(() =>
      materialSource.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        );
      })
    )
    .toBe(true);
  await page.setViewportSize({ width: 900, height: 720 });
  await expect(workspace).toHaveCSS('overflow-x', 'auto');
  expect(await workspace.evaluate((element) => element.scrollWidth)).toBe(1280);
  await expect(inspectorToggle).toHaveAttribute('aria-pressed', 'true');
  expect(await inspector.evaluate((element, original) => element === original, inspectorNode)).toBe(
    true
  );
  await workspace.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect.poll(() => workspace.evaluate((element) => element.scrollLeft)).toBe(380);
  expect(
    (await inspector.boundingBox())!.x + (await inspector.boundingBox())!.width
  ).toBeLessThanOrEqual(900);
  await workspace.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await inspectorToggle.click();
  await expect(inspector).toHaveCount(0);
  await expect(materials).toBeVisible();
  await inspectorToggle.click();
  await expect(inspector).toBeVisible();
  await materialsToggle.click();
  await expect(materials).toHaveCount(0);
  await expect(inspector).toBeVisible();
  await materialsToggle.click();
  await expect(materials).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(seekToStart).toBeVisible();
  await expect(seekToEnd).toBeVisible();
  await expect(previousFrame).toBeVisible();
  await expect(nextFrame).toBeVisible();
  await expect(playhead).toBeVisible();
  await expect(counter).toBeVisible();
  const timelineScroll = page.locator('[data-ui="video-editor.timeline.canvas-scroll"]');
  const ruler = page.locator('[data-ui="video-editor.timeline.ruler"]');
  const handleTopBeforeScroll = (await playhead.boundingBox())?.y;
  const rulerTopBeforeScroll = (await ruler.boundingBox())?.y;
  const verticalScrollTop = await timelineScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  expect(verticalScrollTop).toBeGreaterThan(0);
  await expect(playhead).toBeVisible();
  expect((await playhead.boundingBox())?.y).toBeCloseTo(handleTopBeforeScroll ?? 0, 0);
  expect((await ruler.boundingBox())?.y).toBeCloseTo(rulerTopBeforeScroll ?? 0, 0);
  await page.screenshot({ fullPage: true, path: scrolledScreenshotPath });
  await timelineScroll.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ fullPage: true, path: compactScreenshotPath });
  await page.setViewportSize({ width: 1600, height: 1100 });
}

async function verifyVideoEditorClipMagnet(
  page: import('@playwright/test').Page,
  timelineClip: import('@playwright/test').Locator,
  screenshotPath: string
): Promise<void> {
  const magnet = page.getByRole('button', {
    name: translate('videoEditor.app.magnetButton', 'ru'),
  });
  await expect(magnet).toHaveAttribute('aria-pressed', 'true');
  const clipBox = await timelineClip.boundingBox();
  if (!clipBox) throw new Error('Expected a visible clip for magnetic drag proof');
  await page.mouse.move(clipBox.x + clipBox.width / 2, clipBox.y + clipBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(clipBox.x + clipBox.width / 2 + 6, clipBox.y + clipBox.height / 2);
  await expect(page.locator('[data-ui="video-editor.timeline.snap-guide"]')).toBeVisible();
  await page.screenshot({ fullPage: true, path: screenshotPath });
  await page.mouse.up();
  await expect(page.locator('[data-ui="video-editor.timeline.snap-guide"]')).toHaveCount(0);
}

async function verifyVideoEditorMinimalInsertTools(
  page: import('@playwright/test').Page,
  screenshotPath: string
): Promise<void> {
  for (const kind of ['text', 'shape', 'arrow', 'line']) {
    await expect(
      page.locator(`[data-ui="video-editor.floating.insert-panel.${kind}"]`)
    ).toHaveCount(0);
  }
  for (const kind of ['select-move', 'media', 'templates']) {
    await expect(
      page.locator(`[data-ui="video-editor.floating.insert-panel.${kind}"]`)
    ).toBeVisible();
  }
  await page.screenshot({ fullPage: true, path: screenshotPath });
}

test('background service worker boots', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`, {
    waitUntil: 'domcontentloaded',
  });
  const serviceWorkerUrl = await resolveExtensionServiceWorkerUrl(context);
  await expect(serviceWorkerUrl).toContain(extensionId);
  await page.close();
});

test('video editor focused timeline reveals contextual clip actions', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const project = createEmptyVideoProject('Focused timeline proof');
  const overlayTrack = createVideoProjectTrack('Titles', 0, VideoTrackKind.OVERLAY);
  project.tracks.push(overlayTrack);
  const clip = createTextClip(overlayTrack.id, project.width, project.height, 0.5);
  clip.name = 'Intro title';
  project.clips = [clip];
  project.duration = 6;

  await page.addInitScript((videoProject) => {
    window.__sniptaleHarnessBootstrap = {
      apiBehavior: { runtimeFallback: 'typed-success' },
      videoProjects: [videoProject],
    };
  }, project);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto(`${hostOrigin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`, {
    waitUntil: 'domcontentloaded',
  });

  const timeline = page.locator('[data-ui="video-editor.timeline.surface"]');
  const timelineClip = page.locator(`[data-project-timeline-clip="${clip.id}"]`);
  const sceneButton = page.locator('[data-ui="video-editor.floating.workspace-panel.scene"]');
  await expect(timeline).toBeVisible();
  await expect(page.getByText('Titles', { exact: true })).toBeVisible();
  await expect(timelineClip).toBeVisible();
  await sceneButton.click();
  await expect(timeline.getByText(translate('videoEditor.timeline.split', 'ru'))).toHaveCount(0);

  await timelineClip.click();

  const splitButton = timeline.getByRole('button', {
    name: translate('videoEditor.timeline.split', 'ru'),
  });
  await expect(splitButton).toBeVisible();
  await expect(splitButton).toBeDisabled();
  await expect(splitButton).toHaveAttribute(
    'title',
    translate('videoEditor.timeline.splitUnavailableTitle', 'ru')
  );
  const duplicateButton = timeline.getByRole('button', {
    name: translate('videoEditor.timeline.duplicate', 'ru'),
  });
  const deleteButton = timeline.getByRole('button', {
    name: translate('videoEditor.timeline.delete', 'ru'),
  });
  await expect(duplicateButton).toBeEnabled();
  await expect(deleteButton).toBeEnabled();
  await expect(duplicateButton).toHaveAttribute(
    'title',
    `${translate('videoEditor.timeline.duplicate', 'ru')} (${translate(
      'videoEditor.timeline.duplicateShortcut',
      'ru'
    )})`
  );
  await expect(deleteButton).toHaveAttribute(
    'title',
    `${translate('videoEditor.timeline.delete', 'ru')} (${translate(
      'videoEditor.timeline.deleteShortcut',
      'ru'
    )})`
  );

  const titleTrackRow = timeline
    .locator('[data-ui="video-editor.timeline.track-select"]')
    .filter({ hasText: 'Titles' })
    .locator('..');
  await titleTrackRow
    .getByRole('button', { name: translate('videoEditor.timeline.trackEditable', 'ru') })
    .click();
  await expect(splitButton).toBeDisabled();
  await expect(duplicateButton).toBeDisabled();
  await expect(deleteButton).toBeDisabled();
  await expect(splitButton).toHaveAttribute(
    'title',
    translate('videoEditor.timeline.clipLockedTitle', 'ru')
  );
  await titleTrackRow
    .getByRole('button', { name: translate('videoEditor.timeline.trackLocked', 'ru') })
    .click();

  const clipBox = await timelineClip.boundingBox();
  const rulerBox = await timeline.locator('[data-ui="video-editor.timeline.ruler"]').boundingBox();
  if (!clipBox || !rulerBox) throw new Error('Expected clip and ruler bounds for Split proof');
  await page.mouse.click(clipBox.x + clipBox.width / 2, rulerBox.y + rulerBox.height / 2);
  await expect(splitButton).toBeEnabled();
  await expect(splitButton).toHaveAttribute(
    'title',
    `${translate('videoEditor.timeline.split', 'ru')} (${translate(
      'videoEditor.timeline.splitShortcut',
      'ru'
    )})`
  );
  await splitButton.click();
  await expect(page.locator('[data-project-timeline-clip]')).toHaveCount(2);
  const splitPartName = `Intro title · ${translate('shared.projectActions.splitPartSuffix', 'ru')} 2`;
  await expect(
    page
      .locator('[data-ui="video-editor.floating.context-inspector"]')
      .getByText(splitPartName, { exact: true })
      .first()
  ).toBeVisible();
  await page.keyboard.press('Control+D');
  await expect(page.locator('[data-project-timeline-clip]')).toHaveCount(3);
  await expect(
    page
      .locator('[data-ui="video-editor.floating.context-inspector"]')
      .getByText(`${splitPartName} ${translate('shared.projectActions.copySuffix', 'ru')}`, {
        exact: true,
      })
      .first()
  ).toBeVisible();
  await page.keyboard.press('Control+K');
  const commandPaletteClose = page.getByRole('button', {
    name: translate('shared.ui.commandPaletteCloseTitle', 'ru'),
  });
  await expect(commandPaletteClose).toBeVisible();
  await commandPaletteClose.focus();
  await page.keyboard.press('Control+D');
  await expect(page.locator('[data-project-timeline-clip]')).toHaveCount(3);
  await commandPaletteClose.click();
  await mkdir(testInfo.outputDir, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('video-editor-focused-timeline.png'),
  });
});

test('video editor keeps webcam independent with camera timeline and inspector controls', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const project = createVideoProjectFromMultiSourceRecording({
    name: 'Camera overlay proof',
    videos: [
      {
        duration: 12,
        filename: 'screen.webm',
        height: 1080,
        mimeType: 'video/webm',
        recordingId: 'screen-recording',
        size: 1024,
        width: 1920,
      },
    ],
    webcamVideo: {
      duration: 12,
      filename: 'webcam.webm',
      height: 720,
      mimeType: 'video/webm',
      recordingId: 'webcam-recording',
      size: 512,
      width: 1280,
    },
  });
  const cameraTrack = project.tracks.find((track) => track.role === VideoProjectTrackRole.CAMERA);
  if (!cameraTrack) throw new Error('Missing camera track in video editor fixture');
  cameraTrack.name = 'Camera';
  const cameraClip = project.clips.find(
    (clip) => clip.type === VideoProjectClipType.VIDEO && clip.trackId === cameraTrack.id
  );
  if (!cameraClip) throw new Error('Missing camera clip in video editor fixture');

  await page.addInitScript((videoProject) => {
    window.__sniptaleHarnessBootstrap = {
      apiBehavior: { runtimeFallback: 'typed-success' },
      videoProjects: [videoProject],
    };
  }, project);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto(`${hostOrigin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`, {
    waitUntil: 'domcontentloaded',
  });

  const timelineClip = page.locator(`[data-project-timeline-clip="${cameraClip.id}"]`);
  await expect(page.getByText('C1', { exact: true })).toBeVisible();
  await expect(page.getByText('Camera', { exact: true })).toBeVisible();
  await expect(page.locator('[data-camera-track-icon]')).toBeVisible();
  await expect(timelineClip).toBeVisible();
  await timelineClip.click();

  const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
  const cameraGroup = inspector.getByRole('button', {
    name: translate('videoEditor.sidebar.inspectorGroupCamera', 'ru'),
    exact: true,
  });
  await expect(cameraGroup).toHaveAttribute('aria-pressed', 'true');
  await cameraGroup.focus();
  await page.keyboard.press('ArrowRight');
  await expect(cameraGroup).toHaveAttribute('aria-pressed', 'false');
  await cameraGroup.focus();
  await page.keyboard.press('Enter');
  await expect(cameraGroup).toHaveAttribute('aria-pressed', 'true');
  await expect(
    inspector.getByText(translate('videoEditor.sidebar.cameraPlacementDescription', 'ru'))
  ).toBeVisible();
  await inspector
    .getByRole('button', {
      name: translate('videoEditor.sidebar.cameraPlacementBottomLeft', 'ru'),
    })
    .click();
  await expect(page.locator('[data-ui="video-editor.camera-placement-controls"]')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      return element.getBoundingClientRect().toJSON();
    };
    return {
      inspector: bounds('[data-ui="video-editor.floating.context-inspector"]'),
      preview: bounds('[data-ui="video.preview.viewport"]'),
      timeline: bounds('[data-ui="video-editor.timeline.surface"]'),
    };
  });
  expect(geometry.preview.right).toBeLessThanOrEqual(geometry.inspector.left);
  expect(geometry.timeline.right).toBeGreaterThanOrEqual(geometry.inspector.right);
  expect(geometry.inspector.bottom).toBeLessThanOrEqual(geometry.timeline.top);
  const dock = inspector.getByRole('button', {
    name: translate('videoEditor.sidebar.fullHeightInspector', 'ru'),
    exact: true,
  });
  await dock.click();
  await expect(dock).toHaveAttribute('aria-pressed', 'true');
  await expect(cameraGroup).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 1280, height: 720 });
  const divider = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
  await divider.focus();
  for (let step = 0; step < 12; step++) await page.keyboard.press('ArrowLeft');
  await expect(divider).toHaveAttribute('aria-valuenow', '520');
  const zoomButtonBounds = await page
    .locator('[data-ui="video-editor.timeline.toolbar.add-zoom"]')
    .evaluate((element) => {
      const button = element.getBoundingClientRect();
      const label = element.querySelector('span')?.getBoundingClientRect();
      const icon = element.querySelector('svg')?.getBoundingClientRect();
      return {
        left: button.left,
        right: button.right,
        labelLeft: label?.left,
        labelRight: label?.right,
        iconWidth: icon?.width,
      };
    });
  expect(zoomButtonBounds.labelLeft).toBeGreaterThanOrEqual(zoomButtonBounds.left);
  expect(zoomButtonBounds.labelRight).toBeLessThanOrEqual(zoomButtonBounds.right);
  expect(zoomButtonBounds.iconWidth).toBeGreaterThanOrEqual(12);
  const fullInspector = await inspector.boundingBox();
  const fullTimeline = await page
    .locator('[data-ui="video-editor.timeline.surface"]')
    .boundingBox();
  if (!fullInspector || !fullTimeline) throw new Error('Missing full-height workspace bounds');
  expect(fullTimeline.x + fullTimeline.width).toBeLessThanOrEqual(fullInspector.x);
  expect(fullInspector.y + fullInspector.height).toBeCloseTo(
    fullTimeline.y + fullTimeline.height,
    0
  );
  await dock.click();
  await expect(dock).toHaveAttribute('aria-pressed', 'false');

  await mkdir(testInfo.outputDir, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('video-editor-camera-overlay.png'),
  });

  await verifyVideoEditorTimelineBoundaries(
    page,
    testInfo.outputPath('video-editor-timeline-transport.png'),
    testInfo.outputPath('video-editor-timeline-transport-compact.png'),
    testInfo.outputPath('video-editor-timeline-transport-scrolled.png')
  );

  await verifyVideoEditorClipMagnet(
    page,
    timelineClip,
    testInfo.outputPath('video-editor-timeline-clip-magnet.png')
  );

  await verifyVideoEditorTrackRename(page, testInfo.outputPath('video-editor-track-inspector.png'));

  await verifyVideoEditorAddTrackMenu(page, testInfo.outputPath('video-editor-add-track-menu.png'));

  const addZoomButton = page.locator('[data-ui="video-editor.timeline.toolbar.add-zoom"]');
  await expect(
    page.getByText(translate('videoEditor.timeline.motionLane', 'ru'), { exact: true })
  ).toHaveCount(0);
  await expect(addZoomButton).toBeEnabled();
  await addZoomButton.click();
  await expect(page.locator('[data-ui="video-editor.timeline.add-zoom"]')).toBeVisible();
  const groupLabels = inspector.locator('[data-ui="video-editor.inspector.sections"] nav button');
  await expect(groupLabels).not.toHaveCount(0);
  expect(
    await groupLabels.evaluateAll((nodes) =>
      nodes
        .filter((node) => node.scrollWidth > node.clientWidth + 1)
        .map((node) => node.textContent)
    )
  ).toEqual([]);
  await expect(
    inspector.getByText(translate('videoEditor.sidebar.motionScaleLabel', 'ru'), { exact: true })
  ).toBeVisible();
  await expect(
    inspector.getByText(translate('videoEditor.sidebar.motionFocusLabel', 'ru'), { exact: true })
  ).toBeVisible();
  await expect(
    inspector.getByText(translate('videoEditor.sidebar.motionDurationLabel', 'ru'), { exact: true })
  ).toHaveCount(0);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('video-editor-zoom-flow.png'),
  });

  await verifyVideoEditorMinimalInsertTools(
    page,
    testInfo.outputPath('video-editor-minimal-insert-tools.png')
  );
});

for (const extensionPage of builtExtensionPages) {
  test(`built ${extensionPage.name} UI loads with owned layout`, async ({
    context,
    extensionId,
  }, testInfo) => {
    const page = await context.newPage();
    await page.setViewportSize(extensionPage.viewport);
    await page.goto(`chrome-extension://${extensionId}${extensionPage.path}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(
      (url) =>
        url.protocol === 'chrome-extension:' &&
        url.host === extensionId &&
        url.pathname === extensionPage.path
    );
    await expectBuiltSurfaceLayout(page, extensionPage.selector, extensionPage.viewport);
    if (extensionPage.name === 'video-editor') {
      await expectBuiltVideoEditorGeometry(
        page,
        testInfo.outputPath('built-video-editor-effects-dock.png')
      );
    }
    if (extensionPage.name === 'settings') {
      const layout = page.locator('[data-ui="settings.page.layout"]');
      const layoutBox = await layout.boundingBox();
      expect(layoutBox?.x ?? 0).toBeGreaterThanOrEqual(24);
      expect(await layout.evaluate((element) => getComputedStyle(element).paddingInlineStart)).toBe(
        '32px'
      );
    }
    await mkdir(testInfo.outputDir, { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`built-${extensionPage.name}.png`),
    });
    await page.close();
  });
}

test('content runtime is not injected before explicit site access', async ({
  page,
  hostOrigin,
}) => {
  await page.goto(`${hostOrigin}/fixtures/host-page.html`);
  await expect(page.getByTestId('host-page-title')).toBeVisible();
  await expect(page.locator(`#${CONTENT_ROOT_ID}`)).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        ({ appContainerId, contentRootId }) => {
          const root = document.getElementById(contentRootId);
          return Boolean(root?.shadowRoot?.getElementById(appContainerId));
        },
        { appContainerId: CONTENT_APP_CONTAINER_ID, contentRootId: CONTENT_ROOT_ID }
      )
    )
    .toBe(false);
});

const extensionPages = [
  {
    name: 'settings',
    path: '/tooling/test/harness/settings.html',
    selector: '[data-ui="settings.page.root"]',
    viewport: { width: 1440, height: 1100 },
  },
  {
    name: 'gallery',
    path: '/tooling/test/harness/gallery.html',
    selector: '[data-ui="gallery.page.root"]',
    viewport: { width: 1440, height: 1100 },
  },
  {
    name: 'editor',
    path: '/tooling/test/harness/editor.html',
    selector: '[data-ui="editor.page.root"]',
    viewport: { width: 1600, height: 1100 },
  },
] as const;

test('popup page renders an active or loading popup surface', async ({ page, hostOrigin }) => {
  await page.setViewportSize({ width: 420, height: 760 });
  await page.goto(`${hostOrigin}${POPUP_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });

  const popupSurface = page
    .locator('[data-ui="popup.app.root"], [data-ui="popup.app.loading"]')
    .first();
  await expect(popupSurface).toBeVisible();
});

test('popup video tab renders a non-default setup state and captures screenshot', async ({
  page,
  hostOrigin,
}, testInfo) => {
  await page.setViewportSize({ width: 420, height: 860 });
  await page.goto(`${hostOrigin}${POPUP_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="popup.app.root"]').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: POPUP_VIDEO_TAB_LABEL, exact: true }).click();
  await expect(page.locator('[data-ui="popup.video-setup.start-recording-button"]')).toBeVisible();
  await expect(page.locator('[data-ui="popup.video-setup.video-editor-button"]')).toBeVisible();

  await mkdir(testInfo.outputDir, { recursive: true });
  await page.screenshot({
    path: testInfo.outputPath('popup-video-setup.png'),
    fullPage: true,
  });
});

test('popup home and export tabs render and capture screenshots', async ({
  page,
  hostOrigin,
}, testInfo) => {
  await page.setViewportSize({ width: 420, height: 860 });
  await page.goto(`${hostOrigin}${POPUP_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="popup.app.root"]').waitFor({ state: 'visible' });

  const homeTab = page.getByRole('button', { name: POPUP_HOME_TAB_LABEL, exact: true });
  await homeTab.click();
  await expect(homeTab).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-ui="popup.app.content"]')).not.toBeEmpty();

  await mkdir(testInfo.outputDir, { recursive: true });
  await page.screenshot({
    path: testInfo.outputPath('popup-home.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: POPUP_EXPORT_TAB_LABEL, exact: true }).click();
  await expect(page.locator('[data-ui="popup.export.export-button"]')).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath('popup-export.png'),
    fullPage: true,
  });
});

test('built popup restores the correct first tab and never empties content on cold route changes', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const popupUrl = `chrome-extension://${extensionId}/apps/extension/src/popup/index.html`;
  await page.goto(popupUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="popup.app.root"]').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      sniptale_popup_startup: { selection: 'remember-last', lastPage: 'video' },
    });
  });

  await page.addInitScript(() => {
    const probe = { activeTabIndexes: [] as number[] };
    Object.assign(window, { __sniptalePopupRouteProbe: probe });
    const sample = () => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('button[data-active]')
      );
      const activeIndex = buttons.findIndex((button) => button.dataset['active'] === 'true');
      if (activeIndex >= 0 && probe.activeTabIndexes.at(-1) !== activeIndex) {
        probe.activeTabIndexes.push(activeIndex);
      }
    };
    new MutationObserver(sample).observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['data-active'],
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-ui="popup.video-setup.start-recording-button"]')).toBeVisible();

  const firstActiveTabIndexes = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __sniptalePopupRouteProbe: { activeTabIndexes: number[] };
        }
      ).__sniptalePopupRouteProbe.activeTabIndexes
  );
  expect(firstActiveTabIndexes).toEqual([1]);

  await page.evaluate(() => {
    const content = document.querySelector('[data-ui="popup.app.content"]');
    if (!content) throw new Error('Popup content container is unavailable');
    const probe = { empty: false };
    Object.assign(window, { __sniptalePopupContentProbe: probe });
    const sample = () => {
      if (content.childElementCount === 0) probe.empty = true;
    };
    new MutationObserver(sample).observe(content, { childList: true, subtree: false });
    sample();
  });

  const topTabs = page.locator('[data-ui="popup.app.tabs"]');
  await topTabs.locator('button[data-page="screenshots"]').click();
  await expect(topTabs.locator('button[data-page="screenshots"]')).toHaveAttribute(
    'data-active',
    'true'
  );
  await topTabs.locator('button[data-page="video"]').click();
  await expect(page.locator('[data-ui="popup.video-setup.start-recording-button"]')).toBeVisible();
  await topTabs.locator('button[data-page="export"]').click();
  await expect(page.locator('[data-ui="popup.export.export-button"]')).toBeVisible();

  const observedEmptyContent = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __sniptalePopupContentProbe: { empty: boolean };
        }
      ).__sniptalePopupContentProbe.empty
  );
  expect(observedEmptyContent).toBe(false);
  await page.close();
});

test('built popup paints the saved-theme canvas without a startup loader', async ({
  context,
  extensionId,
}, testInfo) => {
  await verifyPopupStartupLifecycle(context, extensionId, testInfo);
});
for (const extensionPage of extensionPages) {
  test(`${extensionPage.name} page renders and captures screenshot`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await page.setViewportSize(extensionPage.viewport);
    await page.goto(`${hostOrigin}${extensionPage.path}`, { waitUntil: 'domcontentloaded' });
    await page.locator(extensionPage.selector).first().waitFor({ state: 'visible' });

    await mkdir(testInfo.outputDir, { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`${extensionPage.name}.png`),
    });

    await expect(page.locator(extensionPage.selector).first()).toBeVisible();
  });
}

test('settings AI sections render provider, model, and prompt template surfaces', async ({
  page,
  hostOrigin,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${hostOrigin}/tooling/test/harness/settings.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-ui="settings.page.root"]').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: SETTINGS_AI_NAV_LABEL, exact: true }).click();

  const settingsContent = page.locator('[data-ui="settings.page.content"]');
  await expect(settingsContent.getByText(SETTINGS_AI_NAV_LABEL, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: SETTINGS_AI_PROVIDERS_TITLE, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: SETTINGS_AI_MODELS_TITLE, exact: true })
  ).toBeVisible();

  await page.getByRole('button', { name: SETTINGS_AI_PROMPTS_NAV_LABEL, exact: true }).click();
  await expect(
    settingsContent.getByText(SETTINGS_AI_PROMPTS_NAV_LABEL, { exact: true })
  ).toBeVisible();
  await expect(
    settingsContent.getByRole('region', { name: SETTINGS_AI_SAVED_PROMPTS_LABEL, exact: true })
  ).toBeVisible();
});

test('design-system page keeps theme ownership local and contains floating previews', async ({
  context,
  extensionId,
}, testInfo) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1600, height: 1400 });
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/design-system/index.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-ui="design-system.page.root"]').waitFor({ state: 'visible' });
  await expectThemeSurfaceToggle(page);

  await page.locator('input[type="search"]').fill('product.ui.toast');
  const toastCard = page.locator('article', { hasText: 'product.ui.toast' });
  const countdownContainer = toastCard.locator('.sniptale-countdown-toast-container');
  const previewFrame = countdownContainer.locator(
    'xpath=ancestor::*[@data-ui="design-system.preview-frame"]'
  );

  await expect(toastCard).toBeVisible();
  await expect(previewFrame).toBeVisible();
  await expect(countdownContainer).toBeVisible();
  await expectFloatingPreviewContained(countdownContainer);
  await captureDesignSystemScreenshot(page, testInfo);
});
