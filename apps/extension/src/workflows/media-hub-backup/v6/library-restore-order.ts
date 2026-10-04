import type { ArchiveRootDescriptor } from '../../../composition/archive-transfer';

function isLibraryRoot(root: ArchiveRootDescriptor): boolean {
  return root.rootKind === 'media' && root.mediaSubtype === 'library-item';
}

/** Restore explicitly referenced Library roots before their consumers, across catalog shard boundaries. */
export async function orderLibraryRestoreRoots(
  descriptors: readonly ArchiveRootDescriptor[],
  dependencies: (root: ArchiveRootDescriptor) => Promise<readonly string[]>
): Promise<ArchiveRootDescriptor[]> {
  const library = descriptors.filter(isLibraryRoot);
  const roots = new Map(library.map((root) => [root.rootId, root]));
  if (roots.size !== library.length)
    throw new Error('Media backup Library root identity is duplicated.');
  const remaining = new Map<string, number>();
  const consumers = new Map<string, string[]>();
  for (const root of library) {
    const refs = new Set(await dependencies(root));
    for (const id of refs) {
      if (!roots.has(id)) throw new Error('Media backup published Library dependency is missing.');
      const uses = consumers.get(id) ?? [];
      uses.push(root.rootId);
      consumers.set(id, uses);
    }
    remaining.set(root.rootId, refs.size);
  }
  const queue = library.filter((root) => remaining.get(root.rootId) === 0);
  const ordered: ArchiveRootDescriptor[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const root = queue[index]!;
    ordered.push(root);
    for (const id of consumers.get(root.rootId) ?? []) {
      const count = remaining.get(id)! - 1;
      remaining.set(id, count);
      if (count === 0) queue.push(roots.get(id)!);
    }
  }
  if (ordered.length !== library.length)
    throw new Error('Media backup published Library dependencies are cyclic.');
  let index = 0;
  return descriptors.map((root) => (isLibraryRoot(root) ? ordered[index++]! : root));
}
