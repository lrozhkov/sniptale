export function createFileSystemDirectoryHandleTestDouble<T extends object>(
  value: T
): T & FileSystemDirectoryHandle {
  return value as T & FileSystemDirectoryHandle;
}
