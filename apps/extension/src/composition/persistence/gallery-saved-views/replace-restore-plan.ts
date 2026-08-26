import { GallerySavedViewError, MAX_GALLERY_SAVED_VIEWS, type GallerySavedView } from './contract';

function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function buildGallerySavedViewReplacePlan(
  current: readonly GallerySavedView[],
  imported: readonly GallerySavedView[]
): GallerySavedView[] {
  const claimedTargets = new Set<number>();
  const targets = imported.map((candidate) => {
    const idIndex = current.findIndex((view) => view.id === candidate.id);
    const nameIndex = current.findIndex(
      (view) =>
        view.folderFilter === candidate.folderFilter &&
        nameKey(view.name) === nameKey(candidate.name)
    );
    if (idIndex >= 0 && nameIndex >= 0 && idIndex !== nameIndex) {
      throw new GallerySavedViewError(
        'conflict',
        'Saved Gallery view identity and name conflict with different views.'
      );
    }
    const target = idIndex >= 0 ? idIndex : nameIndex >= 0 ? nameIndex : null;
    if (target !== null && claimedTargets.has(target)) {
      throw new GallerySavedViewError(
        'conflict',
        'Multiple saved Gallery views conflict with the same existing view.'
      );
    }
    if (target !== null) claimedTargets.add(target);
    return target;
  });
  const appendedCount = targets.filter((target) => target === null).length;
  if (current.length + appendedCount > MAX_GALLERY_SAVED_VIEWS) {
    throw new GallerySavedViewError('limit', 'Saved Gallery view limit reached.');
  }
  const next = [...current];
  imported.forEach((candidate, index) => {
    const target = targets[index];
    if (target == null) next.push(candidate);
    else next[target] = { ...candidate, id: current[target]!.id };
  });
  return next;
}
