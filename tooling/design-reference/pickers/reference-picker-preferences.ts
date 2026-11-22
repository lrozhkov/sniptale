import { useSyncExternalStore } from 'react';
import { normalizeColor } from '@sniptale/foundation/color';

const keys = {
  compact: 'sniptale.design-reference.picker-compact',
  catalogMode: 'sniptale.design-reference.picker-catalog',
};
type Flag = keyof typeof keys;

function readFlag(flag: Flag) {
  try {
    return window.localStorage.getItem(keys[flag]) === 'true';
  } catch {
    return false;
  }
}

let snapshot = {
  compact: readFlag('compact'),
  catalogMode: readFlag('catalogMode'),
  recentColors: [] as string[],
};
const subscribers = new Set<() => void>();

function update(next: Partial<typeof snapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const subscriber of subscribers) subscriber();
}

function syncFlags(event: StorageEvent) {
  if (event.storageArea !== window.localStorage) return;
  if (event.key === null) {
    update({ compact: readFlag('compact'), catalogMode: readFlag('catalogMode') });
  } else if (event.key === keys.compact) {
    update({ compact: readFlag('compact') });
  } else if (event.key === keys.catalogMode) {
    update({ catalogMode: readFlag('catalogMode') });
  }
}

function subscribe(listener: () => void) {
  if (subscribers.size === 0) window.addEventListener('storage', syncFlags);
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) window.removeEventListener('storage', syncFlags);
  };
}

function setFlag(flag: Flag, value: boolean) {
  update({ [flag]: value });
  try {
    window.localStorage.setItem(keys[flag], String(value));
  } catch {
    /* The current page retains the selected mode. */
  }
}

function rememberColor(value: string) {
  const color = normalizeColor(value);
  if (!color?.startsWith('#')) return;
  update({
    recentColors: [color, ...snapshot.recentColors.filter((item) => item !== color)].slice(0, 10),
  });
}

/** Share display preferences across reference pickers and keep color history in page memory. */
export function usePickerPreferences(density?: 'full' | 'compact') {
  const preferences = useSyncExternalStore(subscribe, () => snapshot);
  return {
    ...preferences,
    compact: density === undefined ? preferences.compact : density === 'compact',
    paletteNames: undefined,
    setCompact: (value: boolean) => setFlag('compact', value),
    setCatalogMode: (value: boolean) => setFlag('catalogMode', value),
    rememberColor,
  };
}
