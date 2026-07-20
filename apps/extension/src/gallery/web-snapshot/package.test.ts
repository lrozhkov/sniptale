import JSZip from 'jszip';
import { expect, it, vi } from 'vitest';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../features/web-snapshot/manifest';
import { loadWebSnapshotScreenshotBlob } from './package';

async function createPackageBlob(entries: Record<string, string | Uint8Array>): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content);
  }

  return zip.generateAsync({ type: 'blob' });
}

it('loads the full page screenshot from a web snapshot package', async () => {
  const packageBlob = await createPackageBlob({ [WEB_SNAPSHOT_PACKAGE_PATHS.screenshot]: 'png' });

  const screenshot = await loadWebSnapshotScreenshotBlob(packageBlob);

  expect(await screenshot.text()).toBe('png');
});

it('loads screenshots from packages with stylesheet diagnostic entries', async () => {
  const packageBlob = await createPackageBlob({
    [WEB_SNAPSHOT_PACKAGE_PATHS.screenshot]: 'png',
    [WEB_SNAPSHOT_PACKAGE_PATHS.stylesheets]: '[]',
    'logs/css/stylesheets/document-stylesheet-01.css': 'body { color: red; }',
  });

  const screenshot = await loadWebSnapshotScreenshotBlob(packageBlob);

  expect(await screenshot.text()).toBe('png');
});

it('reports packages without a screenshot entry', async () => {
  const packageBlob = await new JSZip().generateAsync({ type: 'blob' });

  await expect(loadWebSnapshotScreenshotBlob(packageBlob)).rejects.toThrow(
    'Web snapshot screenshot is missing.'
  );
});

it('rejects unsafe package paths before reading the screenshot', async () => {
  const packageBlob = await createPackageBlob({
    '../escape.png': 'png',
    [WEB_SNAPSHOT_PACKAGE_PATHS.screenshot]: 'png',
  });

  await expect(loadWebSnapshotScreenshotBlob(packageBlob)).rejects.toThrow(
    'Web snapshot package contains an unsafe path.'
  );
});

it('rejects packages with too many entries before reading the screenshot', async () => {
  const entries: Record<string, string> = {
    [WEB_SNAPSHOT_PACKAGE_PATHS.screenshot]: 'png',
  };
  for (let index = 0; index < 500; index += 1) {
    entries[`assets/${index}.png`] = 'png';
  }

  const packageBlob = await createPackageBlob(entries);

  await expect(loadWebSnapshotScreenshotBlob(packageBlob)).rejects.toThrow(
    'Web snapshot package contains too many files.'
  );
});

it('rejects oversized screenshots after bounded preview package validation', async () => {
  const packageBlob = await createPackageBlob({
    [WEB_SNAPSHOT_PACKAGE_PATHS.screenshot]: new Uint8Array(25 * 1024 * 1024 + 1),
  });

  await expect(loadWebSnapshotScreenshotBlob(packageBlob)).rejects.toThrow(
    'Web snapshot screenshot is too large.'
  );
});

it('rejects oversized screenshot metadata before inflating preview entries', async () => {
  const readScreenshot = vi.fn(() => {
    throw new Error('Rejected ZIP entry was inflated.');
  });
  const screenshotEntry = {
    _data: { compressedSize: 32, uncompressedSize: 25 * 1024 * 1024 + 1 },
    async: readScreenshot,
    dir: false,
    name: WEB_SNAPSHOT_PACKAGE_PATHS.screenshot,
    unsafeOriginalName: WEB_SNAPSHOT_PACKAGE_PATHS.screenshot,
  };
  const zip = Object.assign(new JSZip(), {
    file: (path: string) =>
      path === WEB_SNAPSHOT_PACKAGE_PATHS.screenshot ? screenshotEntry : null,
    files: { [WEB_SNAPSHOT_PACKAGE_PATHS.screenshot]: screenshotEntry },
  });
  vi.spyOn(JSZip, 'loadAsync').mockResolvedValue(zip);

  await expect(loadWebSnapshotScreenshotBlob(new Blob(['zip']))).rejects.toThrow(
    'Web snapshot screenshot is too large.'
  );

  expect(readScreenshot).not.toHaveBeenCalled();
});
