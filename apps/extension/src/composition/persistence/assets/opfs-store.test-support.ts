function notFound(): DOMException {
  return new DOMException('missing', 'NotFoundError');
}

export class MemoryFileHandle {
  readonly kind = 'file' as const;
  private bytes = new Blob();
  abortEffect: () => Promise<void> = async () => undefined;
  closeEffect: () => Promise<void> = async () => undefined;
  afterCommitCloseEffect: () => Promise<void> = async () => undefined;
  createWritableEffect: () => Promise<void> = async () => undefined;
  writeEffect: () => Promise<void> = async () => undefined;

  async createWritable(): Promise<FileSystemWritableFileStream> {
    await this.createWritableEffect();
    let bytes = new Uint8Array(0);
    let position = 0;
    return {
      abort: async () => this.abortEffect(),
      close: async () => {
        await this.closeEffect();
        this.bytes = new Blob([bytes]);
        await this.afterCommitCloseEffect();
      },
      seek: async (offset: number) => {
        position = offset;
      },
      write: async (value: FileSystemWriteChunkType) => {
        await this.writeEffect();
        let data: BlobPart;
        if (
          typeof value === 'object' &&
          value !== null &&
          !(value instanceof Blob) &&
          'type' in value
        ) {
          if (value.type !== 'write' || value.data == null)
            throw new Error('Unsupported write command.');
          position = value.position ?? position;
          data = value.data;
        } else data = value;
        const chunk = new Uint8Array(await new Blob([data]).arrayBuffer());
        const next = new Uint8Array(Math.max(bytes.length, position + chunk.length));
        next.set(bytes);
        next.set(chunk, position);
        bytes = next;
        position += chunk.length;
      },
    } as FileSystemWritableFileStream;
  }

  async getFile(): Promise<File> {
    return new File([this.bytes], 'memory-file');
  }
}

export class MemoryDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly entriesByName = new Map<string, MemoryDirectoryHandle | MemoryFileHandle>();
  initializeCreatedFile: (file: MemoryFileHandle) => void = () => undefined;
  removeEffect: () => Promise<void> = async () => undefined;

  async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions) {
    const current = this.entriesByName.get(name);
    // Browser boundary test double: only the OPFS methods exercised below are implemented.
    if (current instanceof MemoryDirectoryHandle)
      return current as unknown as FileSystemDirectoryHandle;
    if (current || !options?.create) throw notFound();
    const directory = new MemoryDirectoryHandle();
    // Browser boundary test double: only the OPFS methods exercised below are implemented.
    this.entriesByName.set(name, directory);
    return directory as unknown as FileSystemDirectoryHandle;
  }

  async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
    const current = this.entriesByName.get(name);
    // Browser boundary test double: only the OPFS methods exercised below are implemented.
    if (current instanceof MemoryFileHandle) return current as unknown as FileSystemFileHandle;
    if (current || !options?.create) throw notFound();
    const file = new MemoryFileHandle();
    this.initializeCreatedFile(file);
    // Browser boundary test double: only the OPFS methods exercised below are implemented.
    this.entriesByName.set(name, file);
    return file as unknown as FileSystemFileHandle;
  }

  async removeEntry(name: string): Promise<void> {
    await this.removeEffect();
    if (!this.entriesByName.delete(name)) throw notFound();
  }

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    for (const [name, handle] of this.entriesByName) {
      // Browser boundary test double: only the OPFS methods exercised below are implemented.
      yield [name, handle as unknown as FileSystemHandle];
    }
  }
}

export function createHarness() {
  const root = new MemoryDirectoryHandle();
  return {
    options: {
      createId: () => 'asset-1',
      // Browser boundary test double: only the OPFS methods exercised below are implemented.
      getOriginRoot: async () => root as unknown as FileSystemDirectoryHandle,
      requestExclusiveLock: async (
        _name: string,
        _options: { ifAvailable: boolean },
        callback: (acquired: boolean) => Promise<void>
      ) => callback(true),
    },
    root,
  };
}
