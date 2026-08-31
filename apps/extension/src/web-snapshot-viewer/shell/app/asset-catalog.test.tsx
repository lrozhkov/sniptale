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
