import type { MediaHubBackupExportOptions } from '../../contracts/types';

interface FakeZipArchive {
  __fakeZipFiles: Map<string, Blob | string>;
}

export async function exportBackupArchive(
  options: Partial<MediaHubBackupExportOptions> = {}
): Promise<FakeZipArchive> {
  const { exportMediaHubBackup } = await import('..');
  const archive = await exportMediaHubBackup(options);
  return archive as unknown as FakeZipArchive;
}

export function readArchiveJson<T>(archive: FakeZipArchive, path: string): T {
  return JSON.parse(String(archive.__fakeZipFiles.get(path))) as T;
}
