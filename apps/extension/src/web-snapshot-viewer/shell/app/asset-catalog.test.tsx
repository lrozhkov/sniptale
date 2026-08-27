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
