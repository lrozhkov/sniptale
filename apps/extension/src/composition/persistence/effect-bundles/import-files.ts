import { importEffectArtifact } from '../../../features/video/project/effect-bundle';
import { saveEffectArtifact } from './index';

export interface EffectFileImportResult {
  filename: string;
  status: 'imported' | 'failed';
}
/** Each file commits independently; one invalid file must not discard successful imports. */
export async function importEffectFiles(files: readonly File[]): Promise<EffectFileImportResult[]> {
  const results: EffectFileImportResult[] = [];
  for (const file of files) {
    try {
      const result = await importEffectArtifact(file);
      if (!result.ok) {
        results.push({ filename: file.name, status: 'failed' });
        continue;
      }
      await saveEffectArtifact(result.artifact);
      results.push({ filename: file.name, status: 'imported' });
    } catch {
      results.push({ filename: file.name, status: 'failed' });
    }
  }
  return results;
}
