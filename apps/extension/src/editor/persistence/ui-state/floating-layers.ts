import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  isBoolean,
  isNumber,
  isRecord,
} from '../../../composition/persistence/infrastructure/guards/primitives';

const EDITOR_FLOATING_LAYERS_KEY = 'sniptale_editor_floating_layers';
const MAX_HEIGHT_RATIO = 1;
const MIN_HEIGHT_RATIO = 0;

const logger = createLogger({ namespace: 'SharedUiStateStorage' });

export interface EditorFloatingLayersPreference {
  collapsed: boolean;
  heightRatio: number | null;
}

export const DEFAULT_EDITOR_FLOATING_LAYERS_PREFERENCE: EditorFloatingLayersPreference = {
  collapsed: false,
  heightRatio: null,
};

function parseHeightRatio(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  if (!isNumber(value) || value < MIN_HEIGHT_RATIO || value > MAX_HEIGHT_RATIO) {
    return undefined;
  }

  return value;
}

export function parseStoredEditorFloatingLayersPreference(
  value: unknown
): EditorFloatingLayersPreference {
  if (value === undefined || !isRecord(value)) {
    return DEFAULT_EDITOR_FLOATING_LAYERS_PREFERENCE;
  }

  const collapsed = isBoolean(value['collapsed'])
    ? value['collapsed']
    : DEFAULT_EDITOR_FLOATING_LAYERS_PREFERENCE.collapsed;
  const heightRatio = parseHeightRatio(value['heightRatio']);

  return {
    collapsed,
    heightRatio:
      heightRatio === undefined
        ? DEFAULT_EDITOR_FLOATING_LAYERS_PREFERENCE.heightRatio
        : heightRatio,
  };
}

export async function loadEditorFloatingLayersPreference(): Promise<EditorFloatingLayersPreference> {
  try {
    const result = await browserStorage.local.get([EDITOR_FLOATING_LAYERS_KEY]);
    return parseStoredEditorFloatingLayersPreference(result[EDITOR_FLOATING_LAYERS_KEY]);
  } catch {
    return DEFAULT_EDITOR_FLOATING_LAYERS_PREFERENCE;
  }
}

export async function saveEditorFloatingLayersPreference(
  preference: EditorFloatingLayersPreference
): Promise<void> {
  try {
    await browserStorage.local.set({ [EDITOR_FLOATING_LAYERS_KEY]: preference });
  } catch (error) {
    logger.warn('Failed to save editor floating layers preference', error);
  }
}
