interface BackupArchiveEntry {
  async(type: 'blob'): Promise<Blob>;
}

export interface BackupArchiveReader {
  file(path: string): BackupArchiveEntry | null;
}
