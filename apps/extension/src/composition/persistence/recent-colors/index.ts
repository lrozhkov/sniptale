import { browserStorage } from '../infrastructure/browser-storage';
import { parseStoredStringList } from '../infrastructure/ui-state-validation';

const EDITOR_RECENT_COLORS_KEY = 'sniptale_editor_recent_colors';
let recentColorsWriteQueue: Promise<string[]> = Promise.resolve([]);

function normalizeRecentColor(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/.test(normalized) ? normalized : null;
}

export async function loadRecentColors(limit = 10): Promise<string[]> {
  try {
    const result = await browserStorage.local.get([EDITOR_RECENT_COLORS_KEY]);
    const parsedList = parseStoredStringList(result[EDITOR_RECENT_COLORS_KEY], limit);

    return parsedList.value
      .map((item) => normalizeRecentColor(item))
      .filter((item): item is string => item !== null);
  } catch {
    return [];
  }
}

export function subscribeRecentColors(listener: (colors: string[]) => void): () => void {
  if (!browserStorage.canObserveChanges()) return () => undefined;
  return browserStorage.subscribeToChanges((changes, areaName) => {
    if (areaName !== 'local' || !(EDITOR_RECENT_COLORS_KEY in changes)) return;
    const parsed = parseStoredStringList(changes[EDITOR_RECENT_COLORS_KEY]?.newValue, 10);
    listener(
      parsed.value.map(normalizeRecentColor).filter((color): color is string => color !== null)
    );
  });
}

export async function pushRecentColor(color: string, limit = 10): Promise<string[]> {
  const normalized = normalizeRecentColor(color);
  if (!normalized) {
    return loadRecentColors(limit);
  }

  recentColorsWriteQueue = recentColorsWriteQueue
    .catch(() => [])
    .then(async () => {
      const current = await loadRecentColors(limit);
      const next = [normalized, ...current.filter((item) => item !== normalized)].slice(0, limit);
      await browserStorage.local.set({ [EDITOR_RECENT_COLORS_KEY]: next });
      return next;
    });

  return recentColorsWriteQueue;
}
