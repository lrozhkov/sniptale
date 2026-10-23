import { vi } from 'vitest';

export function createMemoryAudioStaging() {
  const files = new Map<string, Blob>();
  const busy = new Set<string>();
  let failWrite = false;
  const root = {
    async getDirectoryHandle(): Promise<unknown> {
      return root;
    },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!files.has(name)) {
        if (!options?.create) throw new DOMException('missing', 'NotFoundError');
        files.set(name, new Blob());
      }
      return {
        kind: 'file',
        async getFile() {
          return new File([files.get(name)!], name);
        },
        async createWritable() {
          const chunks: BlobPart[] = [];
          return {
            async write(value: BlobPart) {
              if (failWrite && !name.endsWith('.json')) throw new Error('disk full');
              chunks.push(value);
            },
            async close() {
              files.set(name, new Blob(chunks));
            },
            async abort() {
              chunks.length = 0;
            },
          };
        },
      };
    },
    async removeEntry(name: string) {
      if (!files.delete(name)) throw new DOMException('missing', 'NotFoundError');
    },
    async *entries() {
      for (const name of [...files.keys()]) yield [name, { kind: 'file' }];
    },
  };
  const getDirectory = vi.fn(async () => root);
  vi.stubGlobal('navigator', {
    storage: { getDirectory },
    locks: {
      async request(name: string, options: unknown, callback?: (lock: unknown) => unknown) {
        if (typeof options === 'function') return options({ name });
        return callback?.(busy.has(name) ? null : { name });
      },
    },
  });
  return {
    files,
    busy,
    getDirectory,
    failWrites: () => {
      failWrite = true;
    },
    allowWrites: () => {
      failWrite = false;
    },
  };
}
