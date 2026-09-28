import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { isRecord } from '../../../composition/persistence/infrastructure/guards/primitives';
import { runWithPersistenceDomainMutationLock } from '../../../composition/persistence/infrastructure/mutation-barrier';
import type {
  EditorTechnicalDataKind,
  EditorTechnicalDataLayout,
} from '../../controller/tools/technical-data';

const STORAGE_KEY = 'sniptale_editor_technical_data_preference';
const kinds = ['url', 'date', 'browser'] as const;

interface EditorTechnicalDataPreference {
  kinds: EditorTechnicalDataKind[];
  layout: EditorTechnicalDataLayout;
}

const DEFAULT_EDITOR_TECHNICAL_DATA_PREFERENCE: EditorTechnicalDataPreference = {
  kinds: [],
  layout: 'column',
};

export function parseStoredEditorTechnicalDataPreference(
  value: unknown
): EditorTechnicalDataPreference {
  if (!isRecord(value)) {
    return DEFAULT_EDITOR_TECHNICAL_DATA_PREFERENCE;
  }
  const storedKinds = value['kinds'];
  const storedLayout = value['layout'];
  const rawKinds: unknown[] | null = Array.isArray(storedKinds) ? storedKinds : null;
  return {
    kinds: rawKinds?.every((kind) => kinds.some((knownKind) => knownKind === kind))
      ? kinds.filter((kind) => rawKinds.includes(kind))
      : [],
    layout: storedLayout === 'row' ? 'row' : 'column',
  };
}

export async function loadEditorTechnicalDataPreference(): Promise<EditorTechnicalDataPreference> {
  try {
    const stored = await runWithPersistenceDomainMutationLock('technical-data-preference', () =>
      browserStorage.local.get([STORAGE_KEY])
    );
    return parseStoredEditorTechnicalDataPreference(stored[STORAGE_KEY]);
  } catch {
    return DEFAULT_EDITOR_TECHNICAL_DATA_PREFERENCE;
  }
}

export function saveEditorTechnicalDataPreference(
  preference: EditorTechnicalDataPreference
): Promise<void> {
  return runWithPersistenceDomainMutationLock('technical-data-preference', (permit) =>
    browserStorage.local.set({ [STORAGE_KEY]: preference }, permit)
  );
}
