function readFile<T>(file: File, read: (reader: FileReader, targetFile: File) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error);
    read(reader, file);
  });
}

export async function readFileAsText(file: File): Promise<string> {
  const text = await readFile<string | null>(file, (reader, targetFile) =>
    reader.readAsText(targetFile)
  );
  return String(text ?? '');
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  const dataUrl = await readFile<string | null>(file, (reader, targetFile) =>
    reader.readAsDataURL(targetFile)
  );
  return String(dataUrl ?? '');
}
