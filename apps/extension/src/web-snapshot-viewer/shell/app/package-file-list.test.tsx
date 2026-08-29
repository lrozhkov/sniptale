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
      />
    );
  });

  const row = container.querySelector('article > div');
  expect(row?.children[0]?.matches('svg')).toBe(true);
  expect(row?.children[1]?.matches('button[aria-label^="Download original"]')).toBe(true);
  expect(row?.children[2]?.textContent).toContain('capture.png');

  act(() => root.unmount());
  vi.unstubAllGlobals();
});
