// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WebSnapshotAssetCatalog } from './asset-catalog';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('groups attachments by media family and format and downloads verified original bytes', () => {
  act(() => {
    root.render(
      <WebSnapshotAssetCatalog
        assets={[
          {
            downloadUrl: 'blob:original-svg',
            mimeType: 'image/svg+xml',
            path: 'assets/diagram.svg',
            size: 2048,
            url: 'blob:sanitized-svg-preview',
          },
          {
            downloadUrl: 'blob:png',
            mimeType: 'image/png',
            path: 'assets/photo.png',
            size: 4096,
            url: 'blob:png',
          },
          {
            downloadUrl: 'blob:font',
            mimeType: 'font/woff2',
            path: 'assets/body.woff2',
            size: 8192,
            url: 'blob:font',
          },
          {
            downloadUrl: null,
            mimeType: 'application/octet-stream',
            path: 'assets/legacy.bin',
            size: 16,
            url: 'blob:legacy-preview',
          },
        ]}
        locale="en"
        onDownloadPackageFile={vi.fn(async () => undefined)}
        onExtractPackageFile={vi.fn(async () => new Blob(['image'], { type: 'image/png' }))}
        onOpenPackageFile={vi.fn(async () => undefined)}
        onOpenResourceAsset={vi.fn(async () => undefined)}
        packageFiles={[]}
      />
    );
  });

  expect(container.textContent).toContain('Images (2)');
  expect(container.textContent).toContain('SVG (1)');
  expect(container.textContent).toContain('PNG (1)');
  expect(container.textContent).toContain('Fonts (1)');
  expect(container.textContent).toContain('WOFF2 (1)');
  expect(container.querySelector<HTMLImageElement>('img[alt="diagram.svg"]')?.src).toBe(
    'blob:sanitized-svg-preview'
  );
  const download = container.querySelector<HTMLAnchorElement>(
    'a[aria-label="Download original: diagram.svg"]'
  );
  expect(download?.href).toBe('blob:original-svg');
  expect(download?.download).toBe('diagram.svg');
  expect(container.querySelector('a[aria-label="Download original: legacy.bin"]')).toBeNull();
});

it('lists exported files from manifest metadata and extracts only the selected item', async () => {
  const onDownloadPackageFile = vi.fn(async () => undefined);
  await act(async () => {
    root.render(
      <WebSnapshotAssetCatalog
        assets={[]}
        locale="en"
        onDownloadPackageFile={onDownloadPackageFile}
        onExtractPackageFile={vi.fn(async () => new Blob(['image'], { type: 'image/png' }))}
        onOpenPackageFile={vi.fn(async () => undefined)}
        onOpenResourceAsset={vi.fn(async () => undefined)}
        packageFiles={[
          {
            kind: 'exported-image',
            mimeType: 'image/png',
            name: 'photo.png',
            path: 'exports/images/photo.png',
            size: 4096,
          },
          {
            kind: 'attachment',
            mimeType: 'application/pdf',
            name: 'report.pdf',
            path: 'attachments/report.pdf',
            size: 8192,
          },
        ]}
      />
    );
  });

  expect(container.textContent).toContain('Page images (1)');
  expect(container.textContent).toContain('Attachments (1)');
  expect(container.textContent).toContain('photo.png');
  expect(container.textContent).not.toContain('report.pdf');

  const attachmentsButton = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'Attachments (1)'
  );
  await act(async () => attachmentsButton?.click());
  expect(container.textContent).toContain('report.pdf');

  const downloadButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Download original: report.pdf"]'
  );
  await act(async () => downloadButton?.click());
  expect(onDownloadPackageFile).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ path: 'attachments/report.pdf' })
  );
});

it('shows an item-level extraction error without hiding the remaining catalog', async () => {
  await act(async () => {
    root.render(
      <WebSnapshotAssetCatalog
        assets={[]}
        locale="en"
        onDownloadPackageFile={vi.fn(async () => {
          throw new Error('digest mismatch');
        })}
        onExtractPackageFile={vi.fn(async () => new Blob(['image'], { type: 'image/png' }))}
        onOpenPackageFile={vi.fn(async () => undefined)}
        onOpenResourceAsset={vi.fn(async () => undefined)}
        packageFiles={[
          {
            kind: 'attachment',
            mimeType: 'application/pdf',
            name: 'report.pdf',
            path: 'attachments/report.pdf',
            size: 8192,
          },
        ]}
      />
    );
  });

  const downloadButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Download original: report.pdf"]'
  );
  await act(async () => downloadButton?.click());

  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    'Could not extract the file'
  );
  expect(container.textContent).toContain('report.pdf');
});

it('previews a resource image, zooms, opens it separately, and restores the resource list', async () => {
  const onOpenResourceAsset = vi.fn(async () => undefined);
  await act(async () => {
    root.render(
      <WebSnapshotAssetCatalog
        assets={[
          {
            downloadUrl: 'blob:original',
            mimeType: 'image/png',
            path: 'assets/photo.png',
            size: 2048,
            url: 'blob:safe-preview',
          },
        ]}
        locale="en"
        onDownloadPackageFile={vi.fn(async () => undefined)}
        onExtractPackageFile={vi.fn(async () => new Blob())}
        onOpenPackageFile={vi.fn(async () => undefined)}
        onOpenResourceAsset={onOpenResourceAsset}
        packageFiles={[]}
      />
    );
  });
  const previewButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Preview: photo.png"]'
  );
  await act(async () => previewButton?.click());
  expect(container.querySelector('[data-testid="snapshot-asset-preview"]')).not.toBeNull();
  expect(
    container.querySelector<HTMLImageElement>('[data-testid="snapshot-asset-preview"] img')?.src
  ).toBe('blob:safe-preview');
  expect(document.activeElement?.textContent).toContain('Back to files');

  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.click()
  );
  expect(container.querySelector('[data-testid="snapshot-asset-preview"]')?.textContent).toContain(
    '125%'
  );
  expect(
    container.querySelector<HTMLImageElement>('[data-testid="snapshot-asset-preview"] img')?.style
      .zoom
  ).toBe('1.25');
  await act(async () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Open in new tab'))
      ?.click()
  );
  expect(onOpenResourceAsset).toHaveBeenCalledExactlyOnceWith('blob:safe-preview');

  await act(async () =>
    container
      .querySelector('[data-testid="snapshot-asset-preview"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  );
  expect(container.querySelector('[data-testid="snapshot-asset-preview"]')).toBeNull();
  expect(document.activeElement).toBe(previewButton);
  expect(container.textContent).toContain('Web Copy resources (1)');
  expect(container.querySelector<HTMLAnchorElement>('a[download="photo.png"]')?.href).toBe(
    'blob:original'
  );
});

it('extracts package image previews and releases the temporary URL on close', async () => {
  const createObjectURL = vi.fn(() => 'blob:package-preview');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
  const onExtractPackageFile = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));
  const onOpenPackageFile = vi.fn(async () => undefined);
  await act(async () => {
    root.render(
      <WebSnapshotAssetCatalog
        assets={[]}
        locale="en"
        onDownloadPackageFile={vi.fn(async () => undefined)}
        onExtractPackageFile={onExtractPackageFile}
        onOpenPackageFile={onOpenPackageFile}
        onOpenResourceAsset={vi.fn(async () => undefined)}
        packageFiles={[
          {
            kind: 'exported-image',
            mimeType: 'image/png',
            name: 'photo.png',
            path: 'exports/images/photo.png',
            size: 3,
          },
        ]}
      />
    );
  });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Preview: photo.png"]')?.click()
  );
  expect(onExtractPackageFile).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ path: 'exports/images/photo.png' })
  );
  expect(
    container.querySelector<HTMLImageElement>('[data-testid="snapshot-asset-preview"] img')?.src
  ).toBe('blob:package-preview');
  await act(async () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Open in new tab'))
      ?.click()
  );
  expect(onOpenPackageFile).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ path: 'exports/images/photo.png' })
  );
  await act(async () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Back to files'))
      ?.click()
  );
  expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:package-preview');
  expect(container.textContent).toContain('photo.png');
});

it('keeps the file list available when image extraction or separate opening fails', async () => {
  const onOpenPackageFile = vi.fn(async () => {
    throw new Error('tab failed');
  });
  await act(async () => {
    root.render(
      <WebSnapshotAssetCatalog
        assets={[]}
        locale="en"
        onDownloadPackageFile={vi.fn(async () => undefined)}
        onExtractPackageFile={vi.fn(async () => {
          throw new Error('digest mismatch');
        })}
        onOpenPackageFile={onOpenPackageFile}
        onOpenResourceAsset={vi.fn(async () => undefined)}
        packageFiles={[
          {
            kind: 'exported-image',
            mimeType: 'image/png',
            name: 'photo.png',
            path: 'exports/images/photo.png',
            size: 3,
          },
        ]}
      />
    );
  });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Preview: photo.png"]')?.click()
  );
  expect(
    container.querySelector('[data-testid="snapshot-asset-preview"] [role="status"]')?.textContent
  ).toContain('Could not extract');
  await act(async () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Open in new tab'))
      ?.click()
  );
  expect(onOpenPackageFile).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('Could not open the file');
  await act(async () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Back to files'))
      ?.click()
  );
  expect(container.querySelector('[data-testid="snapshot-asset-preview"]')).toBeNull();
  expect(container.textContent).toContain('photo.png');
});

it('names a failed preview download as an extraction failure', async () => {
  await act(async () => {
    root.render(
      <WebSnapshotAssetCatalog
        assets={[]}
        locale="en"
        onDownloadPackageFile={vi.fn(async () => {
          throw new Error('digest mismatch');
        })}
        onExtractPackageFile={vi.fn(async () => new Blob())}
        onOpenPackageFile={vi.fn(async () => undefined)}
        onOpenResourceAsset={vi.fn(async () => undefined)}
        packageFiles={[
          {
            kind: 'attachment',
            mimeType: 'application/pdf',
            name: 'report.pdf',
            path: 'attachments/report.pdf',
            size: 3,
          },
        ]}
      />
    );
  });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Preview: report.pdf"]')?.click()
  );
  await act(async () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Download original'))
      ?.click()
  );
  expect(
    container.querySelector('[data-testid="snapshot-asset-preview"] [role="status"]')?.textContent
  ).toContain('Could not extract');
});
