import type { ArchiveRootObjectSource } from './contracts';

/** Legacy fixtures are static. Tests must not materialize a production history stream. */
export async function readArchiveRootObjectSource(source: ArchiveRootObjectSource): Promise<Blob> {
  if (!source.blob) throw new Error('Expected a static fixture Blob.');
  return source.blob;
}
