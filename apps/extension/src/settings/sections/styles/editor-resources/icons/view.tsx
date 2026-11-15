import { useState } from 'react';
import { ProductGlassInput } from '@sniptale/ui/product-glass-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate, formatNumber, getCurrentLocale } from '../../../../../platform/i18n';
import { formatBytes } from '../../../../../platform/i18n/format-bytes';
import { SettingsCollection, SettingsControlRow } from '../../../../section-surface';
import { SettingsSwitch } from '../../../../section-surface/panel-controls';
import { useIconsSettingsController } from './controller';

type IconsSettingsState = ReturnType<typeof useIconsSettingsController>;

function iconSettingsError(code: string, retryAt: number) {
  switch (code) {
    case 'load-failed':
      return translate('settings.editor.icons.loadFailed');
    case 'permission-required':
      return translate('settings.editor.icons.permissionDenied');
    case 'source-changed':
      return translate('settings.editor.icons.sourceChanged');
    case 'rate-limited':
      return translate('settings.editor.icons.rateLimited').replace(
        '{seconds}',
        formatNumber(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)), {}, getCurrentLocale())
      );
    case 'network-failed':
    case 'timeout':
    case 'http-error':
      return translate('settings.editor.icons.connectionFailed');
    default:
      return translate('settings.editor.icons.saveFailed');
  }
}

function IconsSourceSettings({ state }: { state: IconsSettingsState }) {
  const disabled = state.busy || !state.settings;
  return (
    <div className="space-y-2">
      <SettingsControlRow label={translate('settings.editor.icons.source')}>
        <div className="flex w-full min-w-0 flex-wrap gap-2">
          <ProductGlassInput
            className="min-w-0 flex-1"
            type="url"
            aria-label={translate('settings.editor.icons.source')}
            value={state.url}
            disabled={disabled}
            onChange={(event) => state.setUrl(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) state.saveSource();
              if (event.key === 'Escape' && !event.nativeEvent.isComposing && state.settings)
                state.setUrl(state.settings.baseUrl);
            }}
          />
          <ProductActionButton
            compact
            tone="secondary"
            disabled={disabled || !state.url.trim() || state.url === state.settings?.baseUrl}
            onClick={state.saveSource}
          >
            {translate('common.actions.save')}
          </ProductActionButton>
        </div>
      </SettingsControlRow>
      <SettingsControlRow
        label={translate('settings.editor.icons.network')}
        description={translate('settings.editor.icons.networkDescription')}
      >
        <SettingsSwitch
          size="sm"
          checked={state.settings?.networkEnabled ?? false}
          disabled={disabled}
          aria-label={translate('settings.editor.icons.network')}
          onClick={state.toggleNetwork}
        />
      </SettingsControlRow>
      <SettingsControlRow label={translate('settings.editor.icons.connection')}>
        <div className="flex flex-wrap items-center gap-2">
          <ProductActionButton
            compact
            tone="secondary"
            disabled={
              disabled ||
              !state.settings?.networkEnabled ||
              state.retryAt > Date.now() ||
              state.url !== state.settings?.baseUrl
            }
            onClick={state.check}
          >
            {translate('settings.editor.icons.check')}
          </ProductActionButton>
          {state.checked ? (
            <span role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
              {translate('settings.editor.icons.checked')}
            </span>
          ) : null}
        </div>
      </SettingsControlRow>
      {state.error ? (
        <div role="alert" className="space-y-2">
          <p>{iconSettingsError(state.error, state.retryAt)}</p>
          {state.error === 'load-failed' ? (
            <ProductActionButton
              compact
              tone="secondary"
              disabled={state.busy}
              onClick={() => void state.reload()}
            >
              {translate('settings.editor.icons.retry')}
            </ProductActionButton>
          ) : null}
        </div>
      ) : null}
      <SettingsControlRow
        label={translate('settings.editor.icons.cache')}
        description={
          state.usage
            ? translate('settings.editor.icons.cacheUsage')
                .replace('{entries}', formatNumber(state.usage.entries, {}, getCurrentLocale()))
                .replace('{used}', formatBytes(state.usage.bytes))
                .replace('{budget}', formatBytes(state.usage.budgetBytes))
            : undefined
        }
      >
        <ProductActionButton
          compact
          tone="secondary"
          disabled={disabled || !state.usage?.entries}
          onClick={() => void state.clearCache()}
        >
          {translate('settings.editor.icons.clearCache')}
        </ProductActionButton>
      </SettingsControlRow>
    </div>
  );
}

function IconsCollectionSettings({ state }: { state: IconsSettingsState }) {
  const [editing, setEditing] = useState<{ id: string; incarnation: string } | 'new' | null>(null);
  const [name, setName] = useState('');
  const disabled = state.busy || !state.settings;
  const saveCollection = async () => {
    if (!editing || !name.trim()) return;
    const saved =
      editing === 'new'
        ? await state.createCollection(name.trim())
        : await state.renameCollection(editing.id, editing.incarnation, name.trim());
    if (saved) {
      setEditing(null);
      setName('');
    }
  };
  return (
    <div className="space-y-3">
      <SettingsCollection
        title={translate('settings.editor.icons.collections')}
        ariaLabel={translate('settings.editor.icons.collections')}
        state={state.catalog ? 'ready' : state.error ? 'error' : 'loading'}
        emptyState={translate('settings.editor.icons.emptyCollections')}
        errorState={translate('settings.editor.icons.loadFailed')}
        items={(state.catalog?.collections ?? []).map((collection) => ({
          id: collection.id,
          title: collection.name,
          busy: state.busy,
          capabilities: { edit: true, delete: true },
        }))}
        addAction={{
          label: translate('settings.editor.icons.create'),
          disabled,
          onInvoke: () => {
            setEditing('new');
            setName('');
          },
        }}
        onAction={(action) => {
          const collection = state.catalog?.collections.find((item) => item.id === action.itemId);
          if (!collection) return;
          if (action.type === 'delete')
            void state.removeCollection(collection.id, collection.incarnation);
          if (action.type === 'edit') {
            setEditing(collection);
            setName(collection.name);
          }
        }}
      />
      {editing ? (
        <div className="flex max-w-[560px] flex-wrap items-center gap-2">
          <ProductGlassInput
            autoFocus
            maxLength={120}
            disabled={state.busy}
            value={name}
            aria-label={translate(
              editing === 'new'
                ? 'settings.editor.icons.newCollection'
                : 'settings.editor.icons.rename'
            )}
            placeholder={translate('settings.editor.icons.newCollection')}
            onChange={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') void saveCollection();
              if (event.key === 'Escape') setEditing(null);
            }}
          />
          <ProductActionButton
            compact
            disabled={state.busy || !name.trim()}
            onClick={() => void saveCollection()}
          >
            {translate(editing === 'new' ? 'settings.editor.icons.create' : 'common.actions.save')}
          </ProductActionButton>
          <ProductActionButton
            compact
            tone="secondary"
            disabled={state.busy}
            onClick={() => setEditing(null)}
          >
            {translate('common.actions.cancel')}
          </ProductActionButton>
        </div>
      ) : null}
    </div>
  );
}

function IconsPresetSettings({ state }: { state: IconsSettingsState }) {
  return (
    <SettingsCollection
      title={translate('settings.editor.icons.presets')}
      ariaLabel={translate('settings.editor.icons.presets')}
      state={state.catalog ? 'ready' : state.error ? 'error' : 'loading'}
      emptyState={translate('settings.editor.icons.emptyPresets')}
      errorState={translate('settings.editor.icons.loadFailed')}
      items={(state.catalog?.presets ?? []).map((preset) => ({
        id: preset.id,
        title: preset.name,
        busy: state.busy,
        capabilities: { delete: true },
      }))}
      onAction={(action) => {
        if (action.type !== 'delete') return;
        const preset = state.catalog?.presets.find((item) => item.id === action.itemId);
        if (preset) void state.removePreset(preset.id, preset.incarnation);
      }}
    />
  );
}

export function IconsSettings() {
  const state = useIconsSettingsController();
  return (
    <section className="space-y-6" aria-busy={state.busy}>
      <IconsSourceSettings state={state} />
      <IconsCollectionSettings state={state} />
      <IconsPresetSettings state={state} />
    </section>
  );
}
