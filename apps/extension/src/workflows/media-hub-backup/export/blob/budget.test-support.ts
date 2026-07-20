export function createSizedBackupTestBlob(size: number): Blob {
  const blob = new Blob(['x']);
  Object.defineProperty(blob, 'size', {
    configurable: true,
    value: size,
  });
  return blob;
}
