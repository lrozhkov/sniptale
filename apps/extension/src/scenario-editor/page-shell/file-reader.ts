export function readScenarioEditorFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read scenario editor file'));
    };
    reader.onabort = () => {
      reject(new Error('Scenario editor file read was aborted'));
    };
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Scenario editor file reader returned an unsupported result'));
    };

    reader.readAsDataURL(file);
  });
}
