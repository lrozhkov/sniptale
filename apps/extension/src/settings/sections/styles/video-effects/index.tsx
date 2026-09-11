import {
  EffectCatalogPreview,
  EffectCatalogPreviewProvider,
} from '../../../../ui/effect-catalog-preview';
import { useRef, useState } from 'react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import {
  SettingsCollection,
  settingsSectionClassName,
  type SettingsCollectionItem,
} from '../../../section-surface';
import { EffectCatalogControls, EffectImportSummary } from '../../../../ui/effect-catalog-controls';
import {
  describeCatalogDocument,
  getEffectCatalogThemes,
  queryEffectCatalog,
  type EffectCatalogFilter,
} from '../../../../features/video/project/effect-bundle/catalog/query';
import { translate, useAppLocale } from '../../../../platform/i18n';
import { useVideoEffectsSettings } from './controller';

interface EffectSettingsItem extends SettingsCollectionItem {
  packId: string;
  packName: string;
  documentId?: string;
}

export function VideoEffectsSection() {
  const locale = useAppLocale();
  const controller = useVideoEffectsSettings();
  const input = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<EffectCatalogFilter>({
    query: '',
    kind: 'all',
    theme: 'all',
  });
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const { themes, effectiveFilter, items } = resolveCollectionView(controller, filter, locale);
  return (
    <EffectCatalogPreviewProvider>
      <section className={settingsSectionClassName} data-ui="settings.video-effects">
        <EffectFileInput
          inputRef={input}
          busy={controller.busy}
          onImport={controller.importFiles}
        />
        <p className="mb-4 text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('videoEditor.effectsLibrary.catalogDescription')}
        </p>
        {controller.error ? (
          <p role="alert" className="mb-3 text-sm text-[var(--sniptale-color-danger)]">
            {controller.error}
          </p>
        ) : null}
        <EffectImportSummary results={controller.results} />
        <SettingsCollection
          ariaLabel={translate('settings.navigation.videoEffects')}
          state={controller.loading ? 'loading' : 'ready'}
          items={items}
          toolbarControls={
            <EffectCatalogControls
              themes={themes}
              filter={effectiveFilter}
              onChange={setFilter}
              disabled={controller.busy}
            />
          }
          addAction={{
            label: translate('videoEditor.effectsLibrary.importMany'),
            disabled: controller.busy,
            onInvoke: () => input.current?.click(),
          }}
          emptyState={translate(
            controller.entries.length
              ? 'videoEditor.effectsLibrary.noSearchResults'
              : 'videoEditor.effectsLibrary.noImportedPacks'
          )}
          onAction={(action) => {
            const item = items.find((item) => item.id === action.itemId);
            if (!item) return;
            if (action.type === 'toggle' && item.documentId)
              void controller.toggle(item.packId, item.documentId, action.nextChecked);
            if (action.type === 'delete') setDeleting({ id: item.packId, name: item.packName });
          }}
        />
        <ProductConfirmDialog
          isOpen={deleting !== null}
          isLoading={controller.busy}
          title={translate('videoEditor.effectsLibrary.removeConfirm').replace(
            '{name}',
            deleting?.name ?? ''
          )}
          message={translate('videoEditor.effectsLibrary.removePackHelp')}
          confirmText={translate('common.actions.delete')}
          cancelText={translate('common.actions.cancel')}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            if (deleting && (await controller.remove(deleting.id))) setDeleting(null);
          }}
        />
      </section>
    </EffectCatalogPreviewProvider>
  );
}

function resolveCollectionView(
  controller: ReturnType<typeof useVideoEffectsSettings>,
  filter: EffectCatalogFilter,
  locale: 'en' | 'ru'
) {
  const themes = getEffectCatalogThemes(
    controller.entries.flatMap((entry) => (entry.status === 'ready' ? [entry.entry] : [])),
    locale,
    { includeDisabled: true }
  );
  const effectiveFilter: EffectCatalogFilter = {
    ...filter,
    theme: themes.some((theme) => theme.value === filter.theme) ? filter.theme : 'all',
  };
  const items = buildCollectionItems(controller, effectiveFilter, locale);
  return { themes, effectiveFilter, items };
}

function buildCollectionItems(
  controller: Pick<ReturnType<typeof useVideoEffectsSettings>, 'entries' | 'busy'>,
  filter: EffectCatalogFilter,
  locale: 'ru' | 'en'
): EffectSettingsItem[] {
  return controller.entries.flatMap<EffectSettingsItem>((entry) => {
    if (entry.status === 'invalid')
      return [
        {
          id: entry.packId,
          packId: entry.packId,
          packName: entry.packId,
          title: translate('videoEditor.effectsLibrary.invalidPack'),
          capabilities: { delete: true },
          busy: controller.busy,
        },
      ];
    const matches = queryEffectCatalog(entry.entry, filter, locale, { includeDisabled: true });
    const seen = new Set<string>();
    const documents = matches.filter((document) => {
      if (seen.has(document.id)) return false;
      seen.add(document.id);
      return true;
    });
    return documents.map((document) => {
      const metadata = describeCatalogDocument(document, locale);
      return {
        id: `${entry.packId}/${document.id}`,
        packId: entry.packId,
        packName: entry.label[locale],
        documentId: document.id,
        title: metadata.label,
        enabled: document.enabled ?? entry.enabled,
        previewVariant: 'image' as const,
        preview: <EffectCatalogPreview catalog={entry.entry} document={document} />,
        busy: controller.busy,
        meta: metadata.themeLabel || entry.label[locale],
        capabilities: { toggle: true, delete: entry.source !== 'builtin' },
      };
    });
  });
}

function EffectFileInput(props: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  busy: boolean;
  onImport: (files: readonly File[]) => Promise<boolean>;
}) {
  return (
    <input
      ref={props.inputRef}
      type="file"
      multiple
      className="sr-only"
      accept=".sniptale-effect.json,.sniptale-bundle.zip,application/json,application/zip"
      disabled={props.busy}
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = '';
        if (files.length) void props.onImport(files);
      }}
    />
  );
}
