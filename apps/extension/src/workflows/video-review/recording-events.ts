import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
import { createRecordingEventsStore } from '../../composition/persistence/recordings/recording-events/store';
import { createRecordingEventsReader } from '../../composition/persistence/recordings/recording-events/reader';
import type { RecordingEventsFactCursor } from '../../composition/persistence/recordings/recording-events/reader';
import type { RecordingEventsStoreDependencies } from '../../composition/persistence/recordings/recording-events/contracts';
import {
  prepareRecordingEventsProject,
  type RecordingEventRange,
  type RecordingEventWindow,
} from '../../features/video/project/recording-events/project-window';
import type { RecordingEventWindowRecord } from '../../features/video/project/recording-events/project-facts';
import type { RecordingEventsDescriptor } from '../../features/video/project/recording-events/types';
import type { VideoProject } from '../../features/video/project/types';

const CACHE_WINDOWS = 2;

/** One preview or export owns a disposable reader. The cache never truncates a requested window. */
export function createRecordingEventsRenderer(
  dependencies: RecordingEventsStoreDependencies = {
    database: initDB,
    mintGeneration: () => crypto.randomUUID(),
  }
) {
  const store = createRecordingEventsStore(dependencies);
  const reader = createRecordingEventsReader(dependencies);
  let cache = new Map<string, RecordingEventWindow>();
  let running: AbortController | null = null;
  const headFor = async (range: RecordingEventRange, descriptor: RecordingEventsDescriptor) => {
    const head = await store.getHead(range);
    if (
      !head ||
      !head.finalized ||
      head.stagingJournalId !== undefined ||
      !(['state', 'totalBlocks', 'totalRecords', 'totalBytes', 'streamSha256'] as const).every(
        (key) => head[key] === descriptor[key]
      )
    )
      throw new Error('Recording event render source is unavailable.');
    return head;
  };
  return {
    async prepare(
      project: VideoProject,
      range: { start: number; end: number },
      signal?: AbortSignal
    ): Promise<VideoProject> {
      if (running) throw new Error('Recording event render preparation is already active.');
      const active = new AbortController();
      const abort = () => active.abort(signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      running = active;
      const activeCache = cache;
      try {
        active.signal.throwIfAborted();
        return await prepareRecordingEventsProject(project, range, async (source, descriptor) => {
          active.signal.throwIfAborted();
          const head = await headFor(source, descriptor);
          active.signal.throwIfAborted();
          const key = JSON.stringify([source, descriptor, head.writerGeneration]);
          const cached = activeCache.get(key);
          if (cached) {
            activeCache.delete(key);
            activeCache.set(key, cached);
            return cached;
          }
          const records: RecordingEventWindowRecord[] = [];
          let after: RecordingEventsFactCursor | null = null;
          do {
            const page = await reader.readPage({
              identity: source,
              descriptor,
              fromTimeUs: source.fromTimeUs,
              toTimeUs: source.toTimeUs,
              ...(after ? { after } : {}),
              signal: active.signal,
            });
            if (page.writerGeneration !== head.writerGeneration)
              throw new Error('Recording event render source changed.');
            records.push(...page.facts.map((fact) => fact.record));
            after = page.next;
          } while (after);
          const current = await headFor(source, descriptor);
          active.signal.throwIfAborted();
          if (current.writerGeneration !== head.writerGeneration)
            throw new Error('Recording event render source changed.');
          const window = { writerGeneration: head.writerGeneration, records };
          activeCache.set(key, window);
          while (activeCache.size > CACHE_WINDOWS)
            activeCache.delete(activeCache.keys().next().value!);
          return window;
        });
      } finally {
        signal?.removeEventListener('abort', abort);
        if (running === active) running = null;
      }
    },
    clear() {
      running?.abort();
      running = null;
      cache = new Map();
    },
  };
}
