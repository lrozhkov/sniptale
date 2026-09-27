// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ViewerPackageFileList } from './package-file-list';

it('places the item download action beside its media icon', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(
      <ViewerPackageFileList
        files={[
          {
            kind: 'exported-image',
            mimeType: 'image/png',
            name: 'capture.png',
            path: 'exports/images/capture.png',
            size: 4096,
          },
        ]}
        locale="en"
        onDownloadPackageFile={vi.fn(async () => undefined)}
        onOpenPackageFile={vi.fn(async () => undefined)}
        onPreviewPackageFile={vi.fn()}
      />
    );
  });

  const row = container.querySelector('article > div');
  expect(row?.children[0]?.matches('svg')).toBe(true);
  expect(row?.children[1]?.matches('button[aria-label^="Preview"]')).toBe(true);
  expect(row?.children[2]?.matches('button[aria-label^="Open in new tab"]')).toBe(true);
  expect(row?.children[3]?.matches('button[aria-label^="Download original"]')).toBe(true);
  expect(row?.children[4]?.textContent).toContain('capture.png');

  act(() => root.unmount());
  vi.unstubAllGlobals();
});

it('reports a failed separate open beside the file and keeps download usable', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  const onDownloadPackageFile = vi.fn(async () => undefined);
  await act(async () => {
    root.render(
      <ViewerPackageFileList
        files={[
          {
            kind: 'attachment',
            mimeType: 'application/pdf',
            name: 'report.pdf',
            path: 'attachments/report.pdf',
            size: 4096,
          },
        ]}
        locale="en"
        onDownloadPackageFile={onDownloadPackageFile}
        onOpenPackageFile={vi.fn(async () => {
          throw new Error('tab failed');
        })}
        onPreviewPackageFile={vi.fn()}
      />
    );
  });
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Open in new tab: report.pdf"]')
      ?.click()
  );
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    'Could not open the file'
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Download original: report.pdf"]')
      ?.click()
  );
  expect(onDownloadPackageFile).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="status"]')).toBeNull();
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
