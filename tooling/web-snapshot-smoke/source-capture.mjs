import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectDocument } from './document-inspection.mjs';
import {
  enableForTab,
  enableWebSnapshotsForSmoke,
  saveSnapshot,
  saveSnapshotThroughPopup,
  verifyDisabledSetupDialog,
} from './popup-driver.mjs';

export async function captureSmokeSource({ context, out, popup, popupUi, spec, state }) {
  const target = await context.newPage();
  await target.setViewportSize({ width: 1280, height: 800 });
  const consoleErrors = [];
  target.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await target.goto(spec.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await target.waitForTimeout(1500);
  const targetTab = (await popup.evaluate(() => globalThis.chrome.tabs.query({}))).find(
    (tab) => tab.url === target.url()
  );
  if (!targetTab?.id) throw new Error('Target tab not found for ' + target.url());
  await enableForTab(popup, target, targetTab.id);
  await popup.evaluate((id) => globalThis.chrome.tabs.update(id, { active: true }), targetTab.id);
  await target.bringToFront();
  if (popupUi && state.setupDialogGeometry === null) {
    state.setupDialogGeometry = await verifyDisabledSetupDialog(popup, out);
    await enableWebSnapshotsForSmoke(popup);
  }
  const sourceInfo = await inspectDocument(target);
  const sourceViewportScreenshot = await target.screenshot({ fullPage: false });
  await writeFile(join(out, spec.name + '-source-viewport.png'), sourceViewportScreenshot);
  await target.screenshot({ fullPage: true, path: join(out, spec.name + '-source.png') });
  const saved = popupUi
    ? await saveSnapshotThroughPopup({
        context,
        out,
        popup,
        setupDialogGeometry: state.setupDialogGeometry,
        specName: spec.name,
      })
    : await saveSnapshot(popup, targetTab.id);
  await target.waitForTimeout(250);
  const sourceAfterFullScreenshotInfo = await inspectDocument(target);
  const sourceAfterCaptureViewportScreenshot = await target.screenshot({ fullPage: false });
  await writeFile(
    join(out, spec.name + '-source-after-capture-viewport.png'),
    sourceAfterCaptureViewportScreenshot
  );
  const sourceAfterCapturePath = join(out, spec.name + '-source-after-capture.png');
  await target.screenshot({ fullPage: true, path: sourceAfterCapturePath });
  return {
    consoleErrors,
    saved,
    sourceAfterCapturePath,
    sourceAfterCaptureViewportScreenshot,
    sourceAfterFullScreenshotInfo,
    sourceInfo,
    target,
  };
}
