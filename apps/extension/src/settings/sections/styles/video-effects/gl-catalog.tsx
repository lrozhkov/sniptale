import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import {
  useGlTransitionCatalog,
  type GlCatalogItem,
} from '../../../../composition/gl-transition-presets/catalog';
import {
  deleteGlPresetCatalogEntry,
  setBuiltinGlTransitionEnabled,
  setGlPresetCatalogEnabled,
} from '../../../../composition/persistence/effect-bundles/gl-presets';
import {
  importEffectFiles,
  type EffectFileImportResult,
} from '../../../../composition/persistence/effect-bundles/import-files';
import { EFFECT_CATALOG_CHANGED_EVENT } from '../../../../features/video/project/effect-bundle/catalog/presets';
import { EffectCatalogControls, EffectImportSummary } from '../../../../ui/effect-catalog-controls';
import { translate, useAppLocale } from '../../../../platform/i18n';
import {
  SettingsCollection,
  settingsSectionClassName,
  type SettingsCollectionItem,
} from '../../../section-surface';

export function GlCatalogSettings() {
  useAppLocale();
  const catalog = useGlTransitionCatalog(),
    input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const [results, setResults] = useState<EffectFileImportResult[]>([]);
  const [deleting, setDeleting] = useState<GlCatalogItem | null>(null);
  const pending = useRef(false);
  const run = async (operation: () => Promise<void>) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await operation();
      await catalog.reload();
      window.dispatchEvent(new Event(EFFECT_CATALOG_CHANGED_EVENT));
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const items: SettingsCollectionItem[] = catalog.items
    .filter((item) =>
      `${item.name} ${item.transitionName}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
    )
    .map((item) => ({
      id: item.id,
      title: item.name,
      meta: item.builtin ? translate('videoEditor.effectsLibrary.builtinGl') : item.transitionName,
      enabled: item.enabled,
      isBuiltIn: item.builtin,
      busy,
      capabilities: { toggle: item.status === 'ready', delete: !item.builtin },
      ...(item.status === 'unsupported'
        ? {
            footer: (
              <span className="text-[12px] leading-4 text-[var(--sniptale-color-text-secondary)]">
                {translate('videoEditor.effectsLibrary.glUnavailable')}
              </span>
            ),
          }
        : {}),
      actions: item.entry ? (
        <ContentToolbarButton
          tone="utility"
          type="button"
          className="!h-8 !w-8 !p-0"
          disabled={busy}
          aria-label={translate('videoEditor.effectsLibrary.glDownloadPreset')}
          title={translate('videoEditor.effectsLibrary.glDownloadPreset')}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([item.entry!.source], { type: 'application/json' })
            );
            try {
              const link = document.createElement('a');
              link.href = url;
              link.download = `${item.id}.sniptale-gl-preset.json`;
              link.click();
            } finally {
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
          }}
        >
          <Download size={14} />
        </ContentToolbarButton>
      ) : undefined,
    }));
  return (
    <section className={settingsSectionClassName} data-ui="settings.gl-transitions">
      <input
        ref={input}
        className="sr-only"
        type="file"
        multiple
        accept={[
          '.json',
          '.lottie',
          '.sniptale-animation.json',
          '.sniptale-animations.zip',
          '.sniptale-gl-preset.json',
          'application/json',
          'application/zip',
        ].join(',')}
        disabled={busy}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length)
            void run(async () => {
              setResults(await importEffectFiles(files));
            });
        }}
      />
      <p className="mb-4 text-[13px] leading-[18px] text-[var(--sniptale-color-text-secondary)]">
        {translate('videoEditor.effectsLibrary.catalogDescription')}
      </p>
      {failed || catalog.error ? (
        <p role="alert" className="mb-3 text-[13px] text-[var(--sniptale-color-danger)]">
          {translate('videoEditor.effectsLibrary.updateFailed')}
        </p>
      ) : null}
      <EffectImportSummary results={results} />
      <SettingsCollection
        ariaLabel={translate('videoEditor.effectsLibrary.glCatalog')}
        state={catalog.loading ? 'loading' : catalog.error ? 'error' : 'ready'}
        items={items}
        toolbarControls={
          <EffectCatalogControls
            hideCategories
            disabled={busy}
            filter={{ query, kind: 'all', theme: 'all' }}
            onChange={(filter) => setQuery(filter.query)}
          />
        }
        addAction={{
          label: translate('videoEditor.effectsLibrary.importMany'),
          disabled: busy,
          onInvoke: () => input.current?.click(),
        }}
        emptyState={translate('videoEditor.effectsLibrary.noSearchResults')}
        errorState={translate('videoEditor.effectsLibrary.catalogLoadFailed')}
        onAction={(action) => {
          const item = catalog.items.find((item) => item.id === action.itemId);
          if (!item) return;
          if (action.type === 'delete' && !item.builtin) setDeleting(item);
          if (action.type === 'toggle' && item.status === 'ready')
            void run(() =>
              item.builtin
                ? setBuiltinGlTransitionEnabled(item.transitionName, action.nextChecked)
                : setGlPresetCatalogEnabled(item.id, action.nextChecked)
            );
        }}
      />
      <ProductConfirmDialog
        isOpen={deleting !== null}
        isLoading={busy}
        title={translate('videoEditor.effectsLibrary.removeConfirm').replace(
          '{name}',
          deleting?.name ?? ''
        )}
        message={translate('videoEditor.effectsLibrary.removeHelp')}
        confirmText={translate('common.actions.delete')}
        cancelText={translate('common.actions.cancel')}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting && (await run(() => deleteGlPresetCatalogEntry(deleting.id))))
            setDeleting(null);
        }}
      />
    </section>
  );
}
