type Listener<TArgs extends unknown[]> = (...args: TArgs) => void;

export class ChromeEvent<TArgs extends unknown[]> {
  private listeners = new Set<Listener<TArgs>>();

  addListener(listener: Listener<TArgs>) {
    this.listeners.add(listener);
  }

  removeListener(listener: Listener<TArgs>) {
    this.listeners.delete(listener);
  }

  hasListener(listener: Listener<TArgs>) {
    return this.listeners.has(listener);
  }

  hasListeners() {
    return this.listeners.size > 0;
  }

  addRules() {
    return undefined;
  }

  getRules() {
    return [];
  }

  removeRules() {
    return undefined;
  }

  emit(...args: TArgs) {
    for (const listener of this.listeners) {
      listener(...args);
    }
  }
}

const storageState = new Map<string, unknown>();

export function toStoredObject(
  keys?: string[] | Record<string, unknown> | string | null
): Record<string, unknown> {
  if (keys == null) {
    return Object.fromEntries(storageState.entries());
  }

  if (typeof keys === 'string') {
    return { [keys]: storageState.get(keys) };
  }

  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, storageState.get(key)]));
  }

  return Object.fromEntries(
    Object.keys(keys).map((key) => [key, storageState.get(key) ?? keys[key]])
  );
}

export function setStoredItems(items: Record<string, unknown>) {
  for (const [key, value] of Object.entries(items)) {
    storageState.set(key, value);
  }
}

export function removeStoredItems(keys: string[] | string) {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    storageState.delete(key);
  }
}

export function clearStoredItems() {
  storageState.clear();
}

export function getStoredItemsSnapshot(): Record<string, unknown> {
  return Object.fromEntries(storageState.entries());
}
