type SnapshotLocationLike = Pick<Location, 'href'>;

function resolveCurrentLocation(): SnapshotLocationLike | null {
  return typeof window === 'undefined' ? null : window.location;
}

export function readSnapshotIdFromLocation(locationLike?: SnapshotLocationLike): string | null {
  const resolvedLocation = locationLike ?? resolveCurrentLocation();
  if (!resolvedLocation) {
    return null;
  }

  const id = new URL(resolvedLocation.href).searchParams.get('snapshotId');
  return id && id.trim() ? id : null;
}
