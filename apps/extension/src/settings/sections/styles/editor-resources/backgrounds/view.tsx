import { useState } from 'react';
import {
  ProductModal,
  ProductModalHeader,
  ProductModalBody,
  ProductModalFooter,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../../platform/i18n';
import { useBackgroundCatalog } from '../../../../../composition/background-resources/catalog';
import { BackgroundImagePicker } from '../../../../../composition/background-resources/picker';
import { BackgroundLibraryThumbnail } from '../../../../../composition/background-resources/library';
import {
  SettingsCollection,
  settingsModalClassName,
  type SettingsCollectionItem,
} from '../../../../section-surface';

export function BackgroundPresetsSettings() {
  const catalog = useBackgroundCatalog();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string>();
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await operation();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const items: SettingsCollectionItem[] = catalog.presets.map((item) => ({
    id: item.id,
    title: item.name,
    enabled: item.enabled,
    isBuiltIn: item.bundled,
    meta: item.available ? undefined : translate('settings.editor.backgrounds.unavailable'),
    preview: item.url ? (
      <img src={item.url} alt="" className="h-full w-full object-cover" />
    ) : item.mediaId ? (
      <BackgroundLibraryThumbnail mediaId={item.mediaId} />
    ) : undefined,
    capabilities: { edit: !item.bundled, delete: !item.bundled, reorder: true, toggle: true },
  }));
  return (
    <section>
      <p className="mb-3 text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.editor.backgrounds.libraryNote')}
      </p>
      {(failed || catalog.status === 'failed') && (
        <p role="alert">{translate('settings.editor.backgrounds.failed')}</p>
      )}
      <fieldset disabled={busy}>
        <SettingsCollection
          ariaLabel={translate('settings.editor.backgrounds.title')}
          items={items}
          state={catalog.status === 'ready' ? 'ready' : 'loading'}
          addAction={{
            label: translate('settings.editor.backgrounds.add'),
            onInvoke: () => setAdding(true),
          }}
          onAction={(action) => {
            if (action.type === 'toggle')
              void run(() => catalog.edit({ type: 'toggle', id: action.itemId }));
            if (action.type === 'delete')
              void run(() => catalog.edit({ type: 'remove', id: action.itemId }));
            if (action.type === 'edit') {
              setRenaming(action.itemId);
              setName(catalog.presets.find((p) => p.id === action.itemId)?.name ?? '');
            }
          }}
          onMove={(intent) => {
            const ids = catalog.presets.map((item) => item.id);
            const from = ids.indexOf(intent.itemId);
            if (from < 0) return;
            ids.splice(from, 1);
            const to = intent.beforeItemId === null ? ids.length : ids.indexOf(intent.beforeItemId);
            if (to < 0) return;
            ids.splice(to, 0, intent.itemId);
            void run(() => catalog.edit({ type: 'reorder', ids }));
          }}
        />
      </fieldset>
      <ProductModal
        isOpen={adding || Boolean(renaming)}
        onClose={() => {
          setAdding(false);
          setRenaming(undefined);
        }}
        width="480px"
        maxHeight="85vh"
        scrollable
        dialogClassName={settingsModalClassName}
      >
        <ProductModalHeader
          compact
          title={translate(
            adding ? 'settings.editor.backgrounds.add' : 'settings.editor.backgrounds.rename'
          )}
          onClose={() => {
            setAdding(false);
            setRenaming(undefined);
          }}
        />
        <ProductModalBody compact>
          {adding ? (
            <BackgroundImagePicker
              showPresets={false}
              onSelect={async (image) => {
                await catalog.add(image);
                setAdding(false);
              }}
            />
          ) : (
            <label className="grid gap-2 text-xs">
              {translate('settings.editor.backgrounds.name')}
              <input
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
        </ProductModalBody>
        {renaming && (
          <ProductModalFooter compact>
            <ProductActionButton
              disabled={busy || !name.trim()}
              onClick={() =>
                void run(async () => {
                  await catalog.edit({ type: 'rename', id: renaming, name });
                  setRenaming(undefined);
                })
              }
            >
              {translate('common.actions.save')}
            </ProductActionButton>
          </ProductModalFooter>
        )}
      </ProductModal>
    </section>
  );
}
