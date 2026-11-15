import { useRef, useState } from 'react';
import { Check, Download, Upload, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { useAudioPresets } from '../../../../../composition/audio-preset-resources/use-audio-presets';
import { TextField } from '../../../../../ui/compact-inspector-controls';
import { translate } from '../../../../../platform/i18n';
import {
  SettingsCollection,
  type SettingsCollectionItem,
  type SettingsCollectionAction,
} from '../../../../section-surface';

/** Settings changes catalogue values only. Accepted projects retain their materialized chains. */
export function AudioPresetsSettings() {
  const resources = useAudioPresets('settings:audio-presets', undefined);
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    commit(name: string): Promise<boolean>;
  } | null>(null);
  const finish = async () => {
    const intent = editing;
    if (intent && (await intent.commit(intent.name)))
      setEditing((current) => (current === intent ? null : current));
  };
  const onAction = (action: SettingsCollectionAction) => {
    const record = resources.records.find((item) => item.id === action.itemId);
    if (!record) return;
    if (action.type === 'edit' && record.isUser)
      setEditing({
        id: record.id,
        name: record.name,
        commit: (name) => resources.rename(record.id, name),
      });
    if (action.type === 'delete') void resources.remove(record.id);
    if (action.type === 'set-default') void resources.setDefault(record.id);
    if (action.type === 'toggle') void resources.toggle(record.id);
    if (action.type === 'reset') void resources.reset(record.id);
  };
  const items: SettingsCollectionItem[] = resources.records.map((record) => ({
    id: record.id,
    title: record.name,
    meta: translate(
      record.isUser ? 'audioProcessing.presets.user' : 'audioProcessing.presets.builtin'
    ),
    enabled: record.enabled,
    isBuiltIn: !record.isUser,
    isDefault: record.isDefault,
    busy: resources.busy,
    capabilities: {
      edit: record.isUser,
      delete: record.isUser,
      toggle: true,
      setDefault: !record.isDefault,
      reset: !record.isUser && (!record.enabled || record.isDefault),
    },
    disabledActions: {
      ...(!resources.canWrite
        ? {
            edit: translate('audioProcessing.presets.loadFailed'),
            delete: translate('audioProcessing.presets.loadFailed'),
            toggle: translate('audioProcessing.presets.loadFailed'),
            'set-default': translate('audioProcessing.presets.loadFailed'),
          }
        : {}),
      ...(record.isDefault
        ? {
            delete: translate('settings.editor.defaultCannotDelete'),
            toggle: translate('settings.editor.defaultCannotDisable'),
          }
        : {}),
      ...(!record.enabled || record.unavailable
        ? { 'set-default': translate('audioProcessing.presets.notAvailable') }
        : {}),
    },
    ...(record.unavailable
      ? {
          badges: [
            {
              id: 'unavailable',
              label: translate('audioProcessing.presets.notAvailable'),
              tone: 'warning' as const,
            },
          ],
        }
      : {}),
    actions: (
      <ContentToolbarButton
        tone="utility"
        type="button"
        className="!h-8 !w-8 !p-0"
        aria-label={translate('audioProcessing.presets.exportPreset')}
        title={translate('audioProcessing.presets.exportPreset')}
        disabled={resources.busy}
        onClick={() => resources.exportPreset(record.id)}
      >
        <Download size={14} />
      </ContentToolbarButton>
    ),
    footer:
      editing?.id === record.id ? (
        <div className="min-w-0 space-y-2">
          <TextField
            label={translate('audioProcessing.presets.name')}
            value={editing.name}
            maxLength={120}
            disabled={resources.busy}
            onChange={(event) => {
              const name = event.currentTarget.value;
              setEditing((current) => (current ? { ...current, name } : current));
            }}
          />
          <div className="flex justify-end gap-1">
            <ContentToolbarButton
              className="!w-auto gap-1.5 !px-2.5"
              tone="utility"
              type="button"
              aria-label={translate('audioProcessing.presets.cancel')}
              disabled={resources.busy}
              onClick={() => setEditing(null)}
            >
              <X size={15} />
              {translate('audioProcessing.presets.cancel')}
            </ContentToolbarButton>
            <ContentToolbarButton
              className="!w-auto gap-1.5 !px-2.5"
              tone="utility"
              type="button"
              aria-label={translate('audioProcessing.presets.confirm')}
              disabled={resources.busy || !editing.name.trim()}
              onClick={() => void finish()}
            >
              <Check size={15} />
              {translate('audioProcessing.presets.confirm')}
            </ContentToolbarButton>
          </div>
        </div>
      ) : undefined,
  }));
  return (
    <section data-ui="settings.audio-presets" className="min-w-0 space-y-3">
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".json,application/json"
        aria-label={translate('audioProcessing.presets.importFile')}
        disabled={resources.busy || !resources.canWrite}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void resources.importFile(file);
        }}
      />
      {resources.error === 'load' ? (
        <div role="alert" className="space-y-2">
          <p>{translate('audioProcessing.presets.loadFailed')}</p>
          <ContentToolbarButton
            className="!w-auto gap-1.5 !px-2.5"
            type="button"
            tone="utility"
            onClick={() => void resources.reload()}
          >
            {translate('audioProcessing.presets.retry')}
          </ContentToolbarButton>
        </div>
      ) : null}
      <SettingsCollection
        ariaLabel={translate('audioProcessing.presets.title')}
        items={items}
        onAction={onAction}
        state="ready"
        toolbarControls={
          <div className="flex flex-wrap items-center gap-2">
            <ContentToolbarButton
              className="!w-auto gap-1.5 !px-2.5"
              type="button"
              tone="utility"
              disabled={resources.busy || !resources.canWrite}
              onClick={() => input.current?.click()}
            >
              <Upload size={15} />
              {translate('audioProcessing.presets.import')}
            </ContentToolbarButton>
            {resources.catalog?.preferences.defaultId ? (
              <ContentToolbarButton
                className="!w-auto gap-1.5 !px-2.5"
                type="button"
                tone="utility"
                disabled={resources.busy}
                onClick={() => void resources.setDefault(null)}
              >
                {translate('audioProcessing.presets.clearDefault')}
              </ContentToolbarButton>
            ) : null}
          </div>
        }
      />
      {resources.error === 'write' ? (
        <p role="alert" className="text-sm text-[var(--sniptale-color-danger)]">
          {translate('audioProcessing.presets.writeFailed')}
        </p>
      ) : null}
    </section>
  );
}
