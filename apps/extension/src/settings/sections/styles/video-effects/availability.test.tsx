// @vitest-environment jsdom

import en from '../../../../platform/i18n/catalogs/en.json';
import ru from '../../../../platform/i18n/catalogs/ru.json';
import {
  prepareTranslations,
  setLocalePreference,
  type AppLocale,
} from '../../../../platform/i18n';

vi.mock('../../../../platform/i18n/catalog-transport', () => ({
  loadCatalogMessages: vi.fn(async (locale: AppLocale) =>
    flatCatalogFixture(locale === 'ru' ? ru : en)
  ),
}));

beforeAll(async () => {
  await prepareTranslations('settings', 'ru');
  await setLocalePreference('ru');
});
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { SettingsCollectionProps } from '../../../section-surface';
import type { EffectBundleCatalogEntry } from '../../../../features/video/project/effect-bundle/catalog';
import { VideoEffectsSection } from './index';
import { translate } from '../../../../platform/i18n';
const mocks = vi.hoisted(() => ({ list: vi.fn(), toggle: vi.fn(async () => {}), remove: vi.fn() }));
vi.mock('../../../../composition/persistence/effect-bundles', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/effect-bundles')>()),
  listEffectBundles: mocks.list,
  setEffectDocumentEnabled: mocks.toggle,
  deleteEffectBundle: mocks.remove,
}));
vi.mock('../../../../ui/effect-catalog-preview', async (original) => ({
  ...(await original<typeof import('../../../../ui/effect-catalog-preview')>()),
  EffectCatalogPreview: () => null,
}));
vi.mock('../../../section-surface', async (original) => ({
  ...(await original<typeof import('../../../section-surface')>()),
  SettingsCollection: ({ items, onAction }: SettingsCollectionProps) => (
    <div>
      {items.map((item) => (
        <button
          key={item.id}
          data-row={item.id}
          data-enabled={item.enabled}
          data-delete={!!item.capabilities.delete}
          disabled={item.busy}
          onClick={() => onAction({ type: 'toggle', itemId: item.id, nextChecked: !item.enabled })}
          onContextMenu={() => onAction({ type: 'delete', itemId: item.id })}
        >
          {item.title}
        </button>
      ))}
    </div>
  ),
}));
afterEach(() => vi.clearAllMocks());
it('shows one row per document, routes toggles independently and keeps disabled effects recoverable', async () => {
  const accepted = parseAnimationTemplateSource(
    readFileSync(
      'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
      'utf8'
    )
  );
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.diagnostics));
  const entry = (id: string) => {
    const source = JSON.stringify({ ...accepted.template, id });
    return {
      id,
      source,
      assets: [],
      kind: 'standalone' as const,
      schemaVersion: 'sniptale.animation.v1' as const,
      sha256: createHash('sha256').update(source).digest('hex'),
    };
  };
  const first = entry('callout'),
    second = entry('another');
  const catalog: EffectBundleCatalogEntry = {
    packId: 'builtin:base',
    source: 'builtin',
    sourceSha256: 'a'.repeat(64),
    documents: [
      { ...first, enabled: false },
      { ...second, enabled: true },
    ],
    enabled: true,
    assets: [],
    createdAt: 0,
    updatedAt: 0,
    version: '1',
    label: { en: 'Base', ru: 'База' },
    description: { en: '', ru: '' },
    retainedByteLength: Buffer.byteLength(first.source) + Buffer.byteLength(second.source),
  };
  const summary = {
    status: 'ready',
    packId: catalog.packId,
    entry: catalog,
    enabled: true,
    source: 'builtin',
    label: catalog.label,
  };
  mocks.list.mockResolvedValue([summary]);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<VideoEffectsSection />));
    expect(host.querySelectorAll('[data-row]')).toHaveLength(2);
    let button = host.querySelector<HTMLButtonElement>('[data-row="builtin:base/callout"]')!;
    expect(button.dataset['enabled']).toBe('false');
    expect(button.dataset['delete']).toBe('false');
    mocks.list.mockResolvedValue([
      {
        ...summary,
        entry: { ...catalog, documents: catalog.documents.map((d) => ({ ...d, enabled: true })) },
      },
    ]);
    await act(async () => button.click());
    expect(mocks.toggle).toHaveBeenCalledWith('builtin:base', 'callout', true);
    button = host.querySelector<HTMLButtonElement>('[data-row="builtin:base/callout"]')!;
    expect(button.dataset['enabled']).toBe('true');
    mocks.toggle.mockRejectedValueOnce(new Error('quota'));
    await act(async () => button.click());
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(button.dataset['enabled']).toBe('true');
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps invalid imported packs removable and reports a failed catalog reload', async () => {
  mocks.list.mockResolvedValue([{ status: 'invalid', packId: 'broken-pack' }]);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<VideoEffectsSection />));
    const row = host.querySelector<HTMLButtonElement>('[data-row="broken-pack"]')!;
    expect(row.dataset['delete']).toBe('true');
    await act(async () => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    expect(document.body.textContent).toContain('broken-pack');
    const buttons = [...document.body.querySelectorAll('button')];
    const confirm = buttons.find(
      (button) => button.textContent === translate('common.actions.delete')
    )!;
    expect(confirm).toBeDefined();
    await act(async () => confirm.click());
    expect(mocks.remove).toHaveBeenCalledWith('broken-pack');
    mocks.list.mockRejectedValueOnce(new Error('read failed'));
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

function flatCatalogFixture(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid authored catalog fixture');
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(flatCatalogFixture(child, prefix ? `${prefix}.${key}` : key))
    )
  );
}
