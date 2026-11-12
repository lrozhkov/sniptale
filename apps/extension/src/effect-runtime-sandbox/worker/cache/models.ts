interface EffectRuntimePreparedModelCache<T> {
  clear(): void;
  get(id: string): T | null;
  set(id: string, model: T): boolean;
  snapshot(): { entries: number; weight: number };
}

/** One LRU owner retires renderer resources before their immutable document can be forgotten. */
export function createEffectRuntimePreparedModelCache<T>(
  options: {
    dispose?(model: T): void;
    weight?(model: T): number;
    maximumWeight?: number;
  } = {}
): EffectRuntimePreparedModelCache<T> {
  const entries = new Map<string, { model: T; weight: number }>();
  let total = 0;
  const remove = (id: string, retire = true) => {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    total -= entry.weight;
    if (retire) options.dispose?.(entry.model);
  };
  return {
    clear() {
      for (const id of [...entries.keys()]) remove(id);
    },
    get(id) {
      const entry = entries.get(id);
      if (!entry) return null;
      entries.delete(id);
      entries.set(id, entry);
      return entry.model;
    },
    set(id, model) {
      const weight = options.weight?.(model) ?? 0,
        maximum = options.maximumWeight ?? Number.MAX_SAFE_INTEGER;
      if (!Number.isSafeInteger(weight) || weight < 0 || weight > maximum) return false;
      const previous = entries.get(id);
      remove(id, previous?.model !== model);
      while (entries.size >= 8 || total + weight > maximum) {
        const oldest = entries.keys().next().value;
        if (typeof oldest !== 'string') return false;
        remove(oldest);
      }
      entries.set(id, { model, weight });
      total += weight;
      return true;
    },
    snapshot: () => ({ entries: entries.size, weight: total }),
  };
}
