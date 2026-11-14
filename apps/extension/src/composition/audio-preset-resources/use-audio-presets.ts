import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  AUDIO_PRESET_MAX_BYTES,
  parseAudioProcessingPresetJson,
  type AudioProcessing,
} from '@sniptale/runtime-contracts/audio-effects';
import {
  listBuiltInAudioPresets,
  materializeAudioProcessingPreset,
  serializeAudioProcessingPreset,
} from '../../features/video/audio/effects/presets';
import { browserStorage } from '../persistence/infrastructure/browser-storage';
import { runWithPersistenceDomainMutationLock } from '../persistence/infrastructure/mutation-barrier';
import {
  createAudioPresetCatalogOwner,
  type AudioPresetCommand,
} from '../persistence/audio-presets';
import {
  AUDIO_PRESET_STORAGE_KEY,
  type AudioPresetCatalog,
} from '../persistence/audio-presets/catalog';
import { translate, useAppLocale } from '../../platform/i18n';

function downloadPresetSource(source: string) {
  const url = URL.createObjectURL(new Blob([source], { type: 'application/json' }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sniptale-audio-preset.json';
    anchor.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Owns catalogue IO and disposable feedback. Editor adapters retain project commands and Undo. */
export function useAudioPresets(ownerKey: string, value: AudioProcessing | undefined) {
  const locale = useAppLocale();
  const owner = useMemo(
    () =>
      createAudioPresetCatalogOwner({
        read: async () =>
          (await browserStorage.local.get([AUDIO_PRESET_STORAGE_KEY]))[AUDIO_PRESET_STORAGE_KEY],
        write: (catalog, permit) =>
          browserStorage.local.set({ [AUDIO_PRESET_STORAGE_KEY]: catalog }, permit),
        runMutation: (operation) =>
          runWithPersistenceDomainMutationLock('audio-presets', operation),
      }),
    []
  );
  const [catalog, setCatalog] = useState<AudioPresetCatalog | null>(null);
  const [error, setError] = useState<'load' | 'write' | null>(null);
  const [busy, setBusy] = useState(false);
  const [preferred, setPreferred] = useState<{ ownerKey: string; id: string } | null>(null);
  const lifetime = useRef({ active: true, publication: 0 });
  const operation = useRef<AbortController | null>(null);
  const currentKey = useRef(ownerKey);
  currentKey.current = ownerKey;
  const reload = useCallback(async () => {
    const publication = ++lifetime.current.publication;
    try {
      const next = await owner.read();
      if (lifetime.current.active && publication === lifetime.current.publication) {
        setCatalog(next);
        setError((previous) => (previous === 'load' ? null : previous));
      }
    } catch {
      if (lifetime.current.active && publication === lifetime.current.publication) {
        setCatalog(null);
        setError('load');
      }
    }
  }, [owner]);
  useEffect(() => {
    const currentLifetime = lifetime.current;
    currentLifetime.active = true;
    setBusy(false);
    void reload();
    const unsubscribe = browserStorage.canObserveChanges()
      ? browserStorage.subscribeToChanges((changes, area) => {
          if (area === 'local' && AUDIO_PRESET_STORAGE_KEY in changes) void reload();
        })
      : () => undefined;
    return () => {
      currentLifetime.active = false;
      currentLifetime.publication++;
      operation.current?.abort();
      operation.current = null;
      unsubscribe();
    };
  }, [reload]);
  const records = useMemo(
    () =>
      [
        ...listBuiltInAudioPresets().map((item) => ({
          id: `builtin:${item.id}`,
          name: translate(`audioProcessing.presets.${item.id}`, locale),
          preset: item.preset,
          isUser: false,
        })),
        ...(catalog?.presets.map((entry) => ({
          id: entry.id,
          name: entry.preset.name,
          preset: entry.preset,
          isUser: true,
        })) ?? []),
      ].map((item) => ({
        ...item,
        unavailable: materializeAudioProcessingPreset(item.preset) === null,
        enabled: !catalog?.preferences.disabledIds.includes(item.id),
        isDefault: catalog?.preferences.defaultId === item.id,
      })),
    [catalog, locale]
  );
  const selected =
    preferred?.ownerKey === ownerKey ? records.find((item) => item.id === preferred.id) : undefined;
  const matches = (item: (typeof records)[number]) => {
    const source = value ? serializeAudioProcessingPreset(value, item.preset.name) : null;
    return source === JSON.stringify(item.preset);
  };
  const exact = records.find(matches);
  const selectedId = selected?.id ?? exact?.id ?? '';
  const run = async (
    command: AudioPresetCommand | (() => Promise<AudioPresetCommand>)
  ): Promise<boolean> => {
    if (!catalog || operation.current || !lifetime.current.active) return false;
    const abort = new AbortController();
    operation.current = abort;
    const publication = ++lifetime.current.publication;
    setBusy(true);
    setError(null);
    try {
      const result = await owner.mutate(catalog, command, abort.signal);
      if (lifetime.current.active && publication === lifetime.current.publication)
        setCatalog(result.catalog);
      if (result.status === 'refused') {
        if (lifetime.current.active) setError('write');
        return false;
      }
      return !abort.signal.aborted;
    } catch {
      if (lifetime.current.active && !abort.signal.aborted) setError('write');
      return false;
    } finally {
      if (operation.current === abort) {
        operation.current = null;
        if (lifetime.current.active) setBusy(false);
      }
    }
  };
  return {
    catalog,
    records,
    items: records.map(({ id, name: label, enabled, unavailable, isUser, isDefault }) => ({
      id,
      label,
      enabled,
      unavailable,
      isUser,
      isDefault,
    })),
    selectedId,
    modified: !!selected && !matches(selected),
    busy,
    canWrite: catalog !== null,
    error,
    reload,
    select: (id: string): AudioProcessing | null => {
      const record = records.find((item) => item.id === id && item.enabled && !item.unavailable);
      const next = record ? materializeAudioProcessingPreset(record.preset) : null;
      if (next) setPreferred({ ownerKey, id });
      return next;
    },
    createDefaultProcessing: (): AudioProcessing | null | undefined => {
      const id = catalog?.preferences.defaultId;
      if (!id) return undefined;
      const record = records.find((item) => item.id === id && item.enabled);
      return record ? materializeAudioProcessingPreset(record.preset) : null;
    },
    save: async (name: string): Promise<boolean> => {
      if (!value) return false;
      const source = serializeAudioProcessingPreset(value, name.trim());
      const preset = parseAudioProcessingPresetJson(source);
      if (!preset) {
        setError('write');
        return false;
      }
      const id = `audio-${crypto.randomUUID()}`;
      const accepted = await run({ kind: 'save', id, preset });
      if (accepted && lifetime.current.active && currentKey.current === ownerKey)
        setPreferred({ ownerKey, id });
      return accepted;
    },
    rename: (id: string, name: string) => run({ kind: 'rename', id, name }),
    remove: (id: string) => run({ kind: 'delete', id }),
    setDefault: (id: string | null) => run({ kind: 'default', id }),
    toggle: (id: string) => run({ kind: 'toggle', id }),
    reset: (id: string) => run({ kind: 'reset', id }),
    importFile: (file: File) =>
      run(async () => {
        if (!file.size || file.size > AUDIO_PRESET_MAX_BYTES)
          throw new Error('Audio preset file exceeds its input budget.');
        const preset = parseAudioProcessingPresetJson(await file.text());
        if (!preset) throw new Error('Invalid source-only audio preset file.');
        const id = `audio-${bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(preset))))}`;
        return { kind: 'save', id, preset };
      }),
    exportPreset: (id: string) => {
      const record = records.find((item) => item.id === id);
      if (record) downloadPresetSource(JSON.stringify(record.preset));
    },
    exportCurrent: () => {
      if (!value) return;
      const source = serializeAudioProcessingPreset(
        value,
        selected?.name ?? exact?.name ?? translate('audioProcessing.presets.fileName')
      );
      if (!source) {
        setError('write');
        return;
      }
      downloadPresetSource(source);
    },
  };
}
