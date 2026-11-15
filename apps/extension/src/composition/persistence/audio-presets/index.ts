import { materializeAudioProcessingPreset } from '../../../features/video/audio/effects/presets';
import {
  parseAudioProcessingPreset,
  type AudioProcessingPreset,
} from '@sniptale/runtime-contracts/audio-effects';
import { browserStorage } from '../infrastructure/browser-storage';
import {
  runWithPersistenceDomainMutationLock,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import {
  AUDIO_PRESET_STORAGE_KEY,
  isBuiltinAudioPreset,
  parseAudioPresetCatalog,
  renameAudioPreset,
  type AudioPresetCatalog,
} from './catalog';

interface AudioPresetPersistencePorts {
  read(): Promise<unknown>;
  write(value: AudioPresetCatalog, permit: PersistenceMutationPermit): Promise<void>;
  runMutation<T>(operation: (permit: PersistenceMutationPermit) => Promise<T>): Promise<T>;
  createId?(): string;
  now?(): number;
}
export type AudioPresetCommand =
  | { kind: 'save'; id: string; preset: unknown }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'delete'; id: string }
  | { kind: 'default'; id: string | null }
  | { kind: 'toggle'; id: string }
  | { kind: 'reset'; id: string };
export type AudioPresetMutationResult = {
  status: 'applied' | 'unchanged' | 'refused';
  catalog: AudioPresetCatalog;
};

function requireCatalog(value: unknown): AudioPresetCatalog {
  const catalog = parseAudioPresetCatalog(value);
  if (!catalog)
    throw new Error('Audio preset catalog is unavailable or has an unsupported format.');
  return catalog;
}
function samePreset(a: AudioProcessingPreset, b: AudioProcessingPreset): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Callers inject the existing storage and cross-context mutation authority. Reads have no writes. */
export function createAudioPresetCatalogOwner(ports: AudioPresetPersistencePorts) {
  const createId = ports.createId ?? (() => crypto.randomUUID());
  const now = ports.now ?? (() => Date.now());
  const read = async () => requireCatalog(await ports.read());
  return {
    read,
    mutate(
      basis: AudioPresetCatalog,
      command: AudioPresetCommand | (() => Promise<AudioPresetCommand>),
      signal?: AbortSignal
    ): Promise<AudioPresetMutationResult> {
      return ports.runMutation(async (permit) => {
        signal?.throwIfAborted();
        const prepared = typeof command === 'function' ? await command() : command;
        signal?.throwIfAborted();
        const current = await read();
        const result = (
          status: AudioPresetMutationResult['status']
        ): AudioPresetMutationResult => ({ status, catalog: current });
        signal?.throwIfAborted();
        const id = prepared.id;
        const previous = id === null ? undefined : basis.presets.find((entry) => entry.id === id);
        const entry = id === null ? undefined : current.presets.find((entry) => entry.id === id);
        const saved = prepared.kind === 'save' ? parseAudioProcessingPreset(prepared.preset) : null;
        if (
          prepared.kind === 'save' &&
          entry &&
          saved &&
          samePreset(entry.preset, saved) &&
          (!previous ||
            (previous.incarnation === entry.incarnation && previous.revision === entry.revision))
        )
          return result('unchanged');
        if (basis.generation !== current.generation) return result('refused');
        const next = structuredClone(current);
        if (prepared.kind === 'save') {
          if (!saved || entry || previous) return result('refused');
          const time = now();
          next.presets.push({
            id: prepared.id,
            incarnation: createId(),
            revision: 1,
            createdAt: time,
            updatedAt: time,
            preset: saved,
          });
        } else if (prepared.kind === 'rename' || prepared.kind === 'delete') {
          if (
            !entry ||
            !previous ||
            entry.incarnation !== previous.incarnation ||
            entry.revision !== previous.revision
          )
            return result('refused');
          if (prepared.kind === 'delete') {
            if (next.preferences.defaultId === id) return result('refused');
            next.presets = next.presets.filter((item) => item.id !== id);
            next.preferences.disabledIds = next.preferences.disabledIds.filter(
              (item) => item !== id
            );
          } else {
            const preset = renameAudioPreset(entry.preset, prepared.name);
            if (!preset || entry.revision === Number.MAX_SAFE_INTEGER) return result('refused');
            if (samePreset(preset, entry.preset)) return result('unchanged');
            next.presets = next.presets.map((item) =>
              item.id === id
                ? {
                    ...item,
                    preset,
                    revision: item.revision + 1,
                    updatedAt: Math.max(item.updatedAt, now()),
                  }
                : item
            );
          }
        } else if (prepared.kind === 'default') {
          if (entry && !materializeAudioProcessingPreset(entry.preset, createId))
            return result('refused');
          if (
            id !== null &&
            ((!entry && !isBuiltinAudioPreset(id)) || next.preferences.disabledIds.includes(id))
          )
            return result('refused');
          next.preferences.defaultId = id;
        } else if (prepared.kind === 'toggle') {
          if ((!entry && !isBuiltinAudioPreset(prepared.id)) || next.preferences.defaultId === id)
            return result('refused');
          const disabled = next.preferences.disabledIds.includes(prepared.id);
          next.preferences.disabledIds = disabled
            ? next.preferences.disabledIds.filter((item) => item !== id)
            : [...next.preferences.disabledIds, prepared.id];
        } else {
          if (!isBuiltinAudioPreset(prepared.id)) return result('refused');
          next.preferences.disabledIds = next.preferences.disabledIds.filter((item) => item !== id);
          if (next.preferences.defaultId === id) next.preferences.defaultId = null;
        }
        if (JSON.stringify(next) === JSON.stringify(current)) return result('unchanged');
        next.generation ??= createId();
        const accepted = parseAudioPresetCatalog(next);
        if (!accepted) return result('refused');
        signal?.throwIfAborted();
        await ports.write(accepted, permit);
        return { status: 'applied', catalog: accepted };
      });
    },
  };
}

/** Bind the catalog owner to browser storage and its existing cross-context mutation barrier. */
export function createBrowserAudioPresetCatalogOwner() {
  return createAudioPresetCatalogOwner({
    read: async () =>
      (await browserStorage.local.get([AUDIO_PRESET_STORAGE_KEY]))[AUDIO_PRESET_STORAGE_KEY],
    write: (catalog, permit) =>
      browserStorage.local.set({ [AUDIO_PRESET_STORAGE_KEY]: catalog }, permit),
    runMutation: (operation) => runWithPersistenceDomainMutationLock('audio-presets', operation),
  });
}
