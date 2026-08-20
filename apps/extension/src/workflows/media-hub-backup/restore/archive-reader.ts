interface BackupArchiveEntry {
  async(type: 'blob'): Promise<Blob>;
  internalStream?(type: 'uint8array'): BackupArchiveStream;
}

export interface BackupArchiveStream {
  on(event: 'data', listener: (chunk: Uint8Array) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (error: unknown) => void): this;
  pause(): this;
  resume(): this;
}

export interface BackupArchiveReader {
  file(path: string): BackupArchiveEntry | null;
}
