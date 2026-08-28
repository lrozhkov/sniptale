// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WebSnapshotImportModalContent } from './web-snapshot-import-content';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

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

it('shows inspected provenance, resources, warnings, and explicit confirmation', async () => {
  const onImport = vi.fn(async () => undefined);
  act(() => {
    root.render(
      <WebSnapshotImportModalContent
        pending={{
          file: new File(['archive'], 'snapshot.sniptale-page-package.zip'),
          inspection: {
            archiveBytes: 7,
            capturedAt: '2026-08-28T00:00:00.000Z',
            manifest: createPagePackageManifestFixture(),
            resourceCount: 12,
            sourceTitle: 'Snapshot title',
            sourceUrl: 'https://example.test/',
            warnings: ['One captured resource was unavailable.'],
          },
        }}
        onClose={vi.fn()}
        onImport={onImport}
      />
    );
  });

  expect(container.textContent).toContain('gallery.importModal.webSnapshotTitle');
  expect(container.textContent).toContain('Snapshot title');
  expect(container.textContent).toContain('https://example.test/');
  expect(container.textContent).toContain('12');
  expect(container.textContent).toContain('One captured resource was unavailable.');

  const importButton = Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('gallery.importModal.webSnapshotImport')
  );
  if (!importButton) throw new Error('Expected Web Snapshot import button.');
  await act(async () => {
    importButton.click();
  });
  expect(onImport).toHaveBeenCalledOnce();
});
