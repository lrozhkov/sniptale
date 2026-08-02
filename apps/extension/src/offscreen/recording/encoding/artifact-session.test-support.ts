import { vi } from 'vitest';
import type {
  RecordingStagingArtifactInput,
  RecordingStagingArtifactWriter,
  RecordingStagingCoordinator,
} from '../../../composition/persistence/recordings/staging';

export function createRecordingStagingCoordinatorTestDouble(): RecordingStagingCoordinator {
  const writers = new Map<string, RecordingStagingArtifactWriter>();
  return {
    abort: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getPendingBytes: vi.fn(() => 0),
    openArtifact: vi.fn(async (input: RecordingStagingArtifactInput) => {
      const writtenParts: Blob[] = [];
      const writer: RecordingStagingArtifactWriter = {
        abort: vi.fn().mockResolvedValue(undefined),
        append: vi.fn(async (part: Blob) => {
          writtenParts.push(part);
        }),
        finalize: vi.fn(async () => {
          const file = new File(writtenParts, input.filename, { type: input.mimeType });
          return {
            artifactId: input.artifactId,
            file,
            filename: input.filename,
            mimeType: input.mimeType,
            size: file.size,
          };
        }),
      };
      writers.set(input.artifactId, writer);
      return writer;
    }),
  };
}
