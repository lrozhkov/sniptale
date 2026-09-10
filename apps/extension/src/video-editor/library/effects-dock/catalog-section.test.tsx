import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { CatalogSection } from './catalog-section';
import type { VideoEditorEffectsLibraryDockProps } from './types';
const catalog = {
  packId: 'one',
  documents: [
    {
      id: 'card-dark',
      source: '{}',
      kind: 'standalone' as const,
      assets: [],
      schemaVersion: 'sniptale.effect.v1' as const,
      sha256: 'a'.repeat(64),
    },
  ],
  enabled: true,
  assets: [],
  label: { en: 'Card', ru: 'Карточка' },
  description: { en: '', ru: '' },
  source: 'raw-json' as const,
  sourceSha256: 'a'.repeat(64),
  retainedByteLength: 2,
  createdAt: 0,
  updatedAt: 0,
  version: '1',
};
it('shows enabled documents with apply actions and no pack management or phantom themes', () => {
  const props: VideoEditorEffectsLibraryDockProps = {
    catalogs: [
      { status: 'ready', catalog },
      { status: 'ready', catalog: { ...catalog, packId: 'disabled', enabled: false } },
    ],
    currentTime: 0,
    errorCode: null,
    isLoading: false,
    isOpen: true,
    operations: { disabled: false, operationError: null, run: vi.fn() },
    onApplyEffect: vi.fn(),
    onDeleteEffectBundle: vi.fn(),
    onImportEffectFiles: vi.fn(),
    onSetEffectBundleEnabled: vi.fn(),
    selectedClipId: null,
    selectedTransitionId: null,
  };
  const html = renderToStaticMarkup(<CatalogSection {...props} disabled={false} run={vi.fn()} />);
  expect(html.match(/data-effect-document=/g)).toHaveLength(1);
  expect(html).not.toContain('lucide-trash');
  expect(html).not.toContain('role="switch"');
  expect(html).not.toContain('Светлая');
  expect(html).not.toContain('Тёмная');
  expect(html).toContain('Добавить');
});
