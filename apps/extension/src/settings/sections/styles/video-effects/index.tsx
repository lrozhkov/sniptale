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
            if (action.type === 'toggle') void controller.toggle(action.itemId, action.nextChecked);
            if (action.type === 'delete') {
              const entry = controller.entries.find((item) => item.packId === action.itemId);
              setDeleting({
                id: action.itemId,
                name: entry?.status === 'ready' ? entry.label[locale] : action.itemId,
              });
            }
          }}
        />
        <ProductConfirmDialog
          isOpen={deleting !== null}
          isLoading={controller.busy}
          title={translate('videoEditor.effectsLibrary.removeConfirm').replace(
            '{name}',
            deleting?.name ?? ''
          )}
          message={translate('videoEditor.effectsLibrary.removeHelp')}
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
    controller.entries.flatMap((entry) => (entry.status === 'ready' ? [entry.entry] : []))
  );
  const effectiveFilter: EffectCatalogFilter = {
    ...filter,
    theme: themes.some((theme) => theme === filter.theme) ? filter.theme : 'all',
  };
  const items = buildCollectionItems(controller, effectiveFilter, locale);
  return { themes, effectiveFilter, items };
}

function buildCollectionItems(
  controller: Pick<ReturnType<typeof useVideoEffectsSettings>, 'entries' | 'busy'>,
  filter: EffectCatalogFilter,
  locale: 'ru' | 'en'
): SettingsCollectionItem[] {
  return controller.entries.flatMap((entry) => {
    if (entry.status === 'invalid')
      return [
        {
          id: entry.packId,
          title: translate('videoEditor.effectsLibrary.invalidPack'),
          capabilities: { delete: true },
          busy: controller.busy,
        },
      ];
    const documents = queryEffectCatalog(entry.entry, filter, locale);
    if (!documents.length) return [];
    return [
      {
        id: entry.packId,
        title:
          documents.length === 1
            ? describeCatalogDocument(documents[0]!, locale).label
            : entry.label[locale],
        enabled: entry.enabled,
        previewVariant: 'image',
        preview: <EffectCatalogPreview catalog={entry.entry} document={documents[0]!} />,
        busy: controller.busy,
        supplement:
          documents.length > 1 ? (
            <ul className="space-y-1 text-xs text-[var(--sniptale-color-text-secondary)]">
              {documents.map((document) => {
                const metadata = describeCatalogDocument(document, locale);
                return (
                  <li key={document.id} className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 break-words">{metadata.label}</span>
                    {metadata.theme !== 'unspecified' && (
                      <span className="shrink-0 text-[var(--sniptale-color-text-muted)]">
                        {translate(
                          metadata.theme === 'dark'
                            ? 'videoEditor.effectsLibrary.darkTheme'
                            : 'videoEditor.effectsLibrary.lightTheme'
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : undefined,
        meta:
          documents.length === 1 &&
          describeCatalogDocument(documents[0]!, locale).theme !== 'unspecified'
            ? translate(
                describeCatalogDocument(documents[0]!, locale).theme === 'dark'
                  ? 'videoEditor.effectsLibrary.darkTheme'
                  : 'videoEditor.effectsLibrary.lightTheme'
              )
            : undefined,
        capabilities: { toggle: true, delete: true },
      },
    ];
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
