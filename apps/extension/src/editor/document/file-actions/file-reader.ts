function readFileWithReader<T extends 'readAsText' | 'readAsDataURL'>(
  file: File,
  method: T
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader[method](file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return readFileWithReader(file, 'readAsText');
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return readFileWithReader(file, 'readAsDataURL');
}
