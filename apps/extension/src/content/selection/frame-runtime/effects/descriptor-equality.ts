export function areDescriptorListsEqual<T extends Record<string, unknown>>(
  next: T[],
  current: T[]
): boolean {
  if (next.length !== current.length) {
    return false;
  }

  return next.every((descriptor, index) => {
    const currentDescriptor = current[index];
    if (!currentDescriptor) {
      return false;
    }

    return Object.keys(descriptor).every(
      (key) => descriptor[key] === currentDescriptor[key as keyof T]
    );
  });
}
