import { vi } from 'vitest';
import { createVoiceInputHistory } from './index';
import type { VoiceHistoryCatalog } from './catalog';

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function createHistoryFixture() {
  let value: VoiceHistoryCatalog | null = null;
  let serial = 0;
  let queue = Promise.resolve();
  const files = new Map<string, File>();
  const catalog = {
    read: vi.fn(async () => structuredClone(value)),
    write: vi.fn(async (next: VoiceHistoryCatalog) => {
      value = structuredClone(next);
    }),
  };
  const audio = {
    write: vi.fn(async (identity: string, blob: Blob) => {
      files.set(identity, new File([blob], identity, { type: blob.type }));
    }),
    read: vi.fn(async (identity: string) => {
      const file = files.get(identity);
      if (!file) throw new Error('missing');
      return file;
    }),
    remove: vi.fn(async (identity: string) => {
      files.delete(identity);
    }),
    list: vi.fn(async () => [...files.keys()]),
    erase: vi.fn(async () => {
      files.clear();
    }),
  };
  function withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
  const options = {
    catalog,
    audio,
    withLock,
    withMutation: <T>(operation: () => Promise<T>) => operation(),
    uuid: () => `id-${++serial}`,
    now: () => 100,
  };
  return {
    catalog,
    audio,
    files,
    withLock,
    create: () => createVoiceInputHistory(options),
    peek: () => structuredClone(value),
    replace: (next: VoiceHistoryCatalog | null) => {
      value = structuredClone(next);
    },
  };
}

export function recording(text = 'original') {
  return {
    audio: new Blob([text], { type: 'audio/webm' }),
    durationSeconds: 1,
    backend: 'model' as const,
    language: 'ru-RU' as const,
  };
}

export async function publish(history: ReturnType<typeof createVoiceInputHistory>, text?: string) {
  return history.publishAudio(await history.beginCapture(), recording(text));
}
