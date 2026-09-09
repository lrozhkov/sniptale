import { useRef, useState } from 'react';
import { Download, Layers, Sparkles, WandSparkles } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import {
  SettingsCollection,
  settingsSectionClassName,
  type SettingsCollectionItem,
} from '../../../section-surface';
import { EffectCatalogControls, EffectImportSummary } from '../../../../ui/effect-catalog-controls';
import {
  describeCatalogDocument,
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
  const items = buildCollectionItems(controller, filter, locale);
  const groups = buildCollectionGroups(controller.entries, items, filter, locale);
  return (
    <section className={settingsSectionClassName} data-ui="settings.video-effects">
      <EffectFileInput inputRef={input} busy={controller.busy} onImport={controller.importFiles} />
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
        groups={groups}
        state={controller.loading ? 'loading' : 'ready'}
        items={items}
        toolbarControls={
          <EffectCatalogControls filter={filter} onChange={setFilter} disabled={controller.busy} />
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
  );
}

function buildCollectionItems(
  controller: Pick<ReturnType<typeof useVideoEffectsSettings>, 'entries' | 'busy' | 'exportEntry'>,
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
    const kinds = new Set(documents.map((document) => document.kind));
    const Icon =
      kinds.size > 1 ? Layers : documents[0]!.kind === 'standalone' ? Sparkles : WandSparkles;
    return [
      {
        id: entry.packId,
        title: entry.label[locale],
        enabled: entry.enabled,
        busy: controller.busy,
        preview: <Icon size={28} aria-hidden="true" />,
        meta: translate('videoEditor.effectsLibrary.documentCount').replace(
          '{count}',
          String(entry.entry.documents.length)
        ),
        supplement: (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 text-xs text-[var(--sniptale-color-text-secondary)]">
              {documents
                .map((document) => describeCatalogDocument(document, locale).label)
                .join(' · ')}
            </span>
            <ProductActionButton
              compact
              tone="secondary"
              disabled={controller.busy}
              onClick={() => void controller.exportEntry(entry.packId)}
              aria-label={`${translate('videoEditor.effectsLibrary.exportInstance')}: ${entry.label[locale]}`}
            >
              <Download size={14} aria-hidden="true" />
              {translate('videoEditor.effectsLibrary.exportInstance')}
            </ProductActionButton>
          </div>
        ),
        capabilities: { toggle: true, delete: true },
      },
    ];
  });
}

function buildCollectionGroups(
  entries: ReturnType<typeof useVideoEffectsSettings>['entries'],
  items: SettingsCollectionItem[],
  filter: EffectCatalogFilter,
  locale: 'ru' | 'en'
) {
  return [
    { id: 'standalone', label: translate('videoEditor.effectsLibrary.annotations') },
    { id: 'targetEffect', label: translate('videoEditor.effectsLibrary.videoEffects') },
    { id: 'transition', label: translate('videoEditor.effectsLibrary.transitions') },
    { id: 'mixed', label: translate('videoEditor.effectsLibrary.mixedBundle') },
  ]
    .map((group) => ({
      ...group,
      itemIds: items
        .filter((item) => {
          const entry = entries.find((entry) => entry.packId === item.id);
          const kinds = new Set(
            entry?.status === 'ready'
              ? queryEffectCatalog(entry.entry, filter, locale).map((document) => document.kind)
              : []
          );
          return (kinds.size === 1 ? [...kinds][0] : 'mixed') === group.id;
        })
        .map((item) => item.id),
    }))
    .filter((group) => group.itemIds.length);
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
