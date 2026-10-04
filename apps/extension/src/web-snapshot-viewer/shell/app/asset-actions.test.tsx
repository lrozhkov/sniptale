// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import type { LoadedWebSnapshotPackage } from '../../viewer/assets';
import type { ViewerPackageFile } from '../../viewer/package-files';

const mocks = vi.hoisted(() => ({ browserTabsCreate: vi.fn() }));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { create: mocks.browserTabsCreate },
}));

import { useViewerAssetActions } from './asset-actions';

const file: ViewerPackageFile = {
  kind: 'exported-image',
  mimeType: 'image/png',
  name: 'photo.png',
  path: 'exports/images/photo.png',
  size: 3,
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let actions: ReturnType<typeof useViewerAssetActions> | null = null;
const createObjectURL = vi.fn(() => 'blob:opened-asset');
const revokeObjectURL = vi.fn();

function renderActions(extractPackageFile: LoadedWebSnapshotPackage['extractPackageFile']) {
  const loaded: LoadedWebSnapshotPackage = {
    archiveFilename: 'snapshot.zip',
    archiveSize: 3,
    archiveUrl: 'blob:archive',
    assets: [],
    documentUrl: null,
    extractPackageFile,
    html: '<p>Snapshot</p>',
    manifest: createPagePackageManifestFixture(),
    objectUrls: [],
    packageFiles: [file],
    screenshotCoverage: 'full-page',
    screenshotFilename: 'screenshot.png',
    screenshotUrl: 'blob:screenshot',
  };
  function Harness() {
    actions = useViewerAssetActions(loaded);
    return null;
  }
  act(() => root.render(<Harness />));
  if (!actions) throw new Error('Asset actions did not mount.');
  return actions;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  mocks.browserTabsCreate.mockReset();
  mocks.browserTabsCreate.mockResolvedValue({});
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  actions = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('opens a verified file and resource in new tabs and keeps extraction available', async () => {
  const extract = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));
  const assetActions = renderActions(extract);
  await expect(assetActions.extractPackageFile(file)).resolves.toBeInstanceOf(Blob);
  await assetActions.openPackageFile(file);
  await assetActions.openResourceAsset('blob:sanitized-resource');
  expect(extract).toHaveBeenCalledWith(file.path);
  expect(mocks.browserTabsCreate.mock.calls).toEqual([
    [{ active: true, url: 'blob:opened-asset' }],
    [{ active: true, url: 'blob:sanitized-resource' }],
  ]);
});

it('revokes a temporary URL if the new tab cannot be created', async () => {
  mocks.browserTabsCreate.mockRejectedValue(new Error('tab failed'));
  const assetActions = renderActions(async () => new Blob(['png'], { type: 'image/png' }));
  await expect(assetActions.openPackageFile(file)).rejects.toThrow('tab failed');
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:opened-asset');
});

it('rejects overlapping package downloads and permits retry after extraction fails', async () => {
  let rejectExtraction: (error: Error) => void = () => undefined;
  const extract = vi
    .fn<LoadedWebSnapshotPackage['extractPackageFile']>()
    .mockImplementationOnce(
      () =>
        new Promise<Blob>((_resolve, reject) => {
          rejectExtraction = reject;
        })
    )
    .mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  const assetActions = renderActions(extract);
  const firstDownload = assetActions.downloadPackageFile(file);
  await expect(assetActions.downloadPackageFile(file)).rejects.toThrow('already being extracted');
  rejectExtraction(new Error('digest mismatch'));
  await expect(firstDownload).rejects.toThrow('digest mismatch');
  await expect(assetActions.downloadPackageFile(file)).resolves.toBeUndefined();
  expect(extract).toHaveBeenCalledTimes(2);
});
