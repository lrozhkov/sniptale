interface EffectRuntimePreparedModelCache<T> {
  clear(): void;
  get(id: string): T | null;
  set(id: string, model: T): void;
  snapshot(): { entries: number };
}

export function createEffectRuntimePreparedModelCache<T>(): EffectRuntimePreparedModelCache<T> {
  const entries = new Map<string, T>();
  return {
    clear: () => entries.clear(),
    get(id) {
      const model = entries.get(id);
      if (!model) return null;
      entries.delete(id);
      entries.set(id, model);
      return model;
    },
    set(id, model) {
      entries.delete(id);
      while (entries.size >= 8) {
        const oldest = entries.keys().next().value;
        if (typeof oldest !== 'string') break;
        entries.delete(oldest);
      }
      entries.set(id, model);
    },
    snapshot: () => ({ entries: entries.size }),
  };
}
