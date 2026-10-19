/** Progress belongs to the explicitly selected sequence, not to a durable job registry. */
export interface SpeechQueueProgress<Item> {
  completed: number;
  total: number;
  current: Item;
}

/** Sequential speech requests transfer each result once; later failure preserves earlier handoffs. */
export async function runSpeechQueue<Item, Preview>(
  items: readonly Item[],
  signal: AbortSignal,
  operations: {
    validate(item: Item): void;
    generate(item: Item, signal: AbortSignal): Promise<Preview>;
    cleanup(preview: Preview): Promise<void>;
  },
  events: {
    ready(preview: Preview): void;
    progress(progress: SpeechQueueProgress<Item>): void;
    /** An explicit handler continues selected work after an individual failure; abort always stops. */
    failed?(cause: unknown): void;
  }
): Promise<void> {
  let completed = 0;
  for (const item of items) {
    signal.throwIfAborted();
    operations.validate(item);
    events.progress({ completed, total: items.length, current: item });
    try {
      const preview = await operations.generate(item, signal);
      try {
        signal.throwIfAborted();
        events.ready(preview);
      } catch (cause) {
        await operations.cleanup(preview).catch(() => undefined);
        throw cause;
      }
    } catch (cause) {
      signal.throwIfAborted();
      if (!events.failed) throw cause;
      events.failed(cause);
    }
    completed += 1;
    events.progress({ completed, total: items.length, current: item });
  }
}
