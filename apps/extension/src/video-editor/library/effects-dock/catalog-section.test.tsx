import {
  videoeditorFixtureMessages,
  prepareVideoEditorTranslations,
} from '../../testing/translations.test-support';

vi.mock('../../../platform/i18n/catalog-transport', () => ({
  loadCatalogMessages: vi.fn(async (locale: Parameters<typeof videoeditorFixtureMessages>[0]) =>
    videoeditorFixtureMessages(locale)
  ),
}));

beforeAll(async () => {
  await prepareVideoEditorTranslations('en');
});
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, expect, it, vi } from 'vitest';
import { CatalogSection } from './catalog-section';
import type { VideoEditorEffectsLibraryDockProps } from './types';
const accepted = parseAnimationTemplateSource(
  readFileSync(
    'apps/extension/public/video-effects/animations/title.sniptale-animation.json',
    'utf8'
  )
);
if (!accepted.ok) throw new Error(JSON.stringify(accepted.diagnostics));
const template = structuredClone(accepted.template);
// This case checks a package without authored themes, not the shipped title preset catalogue.
delete template.controlPresets;
delete template.defaultControlPresetId;
template.id = 'card-dark';
template.label = { en: 'Card', ru: 'Карточка' };
const source = JSON.stringify(template);
expect(parseAnimationTemplateSource(source).ok).toBe(true);
const hash = createHash('sha256').update(source).digest('hex');
const catalog: EffectBundleCatalogEntry = {
  packId: 'one',
  documents: [
    {
      id: 'card-dark',
      source,
      kind: 'standalone' as const,
      assets: [],
      schemaVersion: 'sniptale.animation.v1' as const,
      sha256: hash,
    },
  ],
  enabled: true,
  assets: [],
  label: { en: 'Card', ru: 'Карточка' },
  description: { en: '', ru: '' },
  source: 'raw-json' as const,
  sourceSha256: hash,
  retainedByteLength: Buffer.byteLength(source),
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
  expect(html).toContain('Add');
});
