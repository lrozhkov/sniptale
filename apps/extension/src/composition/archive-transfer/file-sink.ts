import type { ExportSink } from './contracts';

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ accept: Record<string, string[]>; description?: string }>;
}

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}

export async function createDirectFileSink(args: {
  filename: string;
  mimeType: string;
  extension: string;
  description: string;
}): Promise<ExportSink> {
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (!picker) throw new Error('Direct file streaming is unavailable in this browser.');
  const handle = await picker.call(window, {
    suggestedName: args.filename,
    types: [{ accept: { [args.mimeType]: [args.extension] }, description: args.description }],
  });
  const writable = await handle.createWritable({ keepExistingData: false });
  let state: 'open' | 'closing' | 'closed' | 'aborting' | 'aborted' = 'open';
  return {
    writable,
    async close() {
      if (state === 'closed' || state === 'aborted') return;
      if (state !== 'open') throw new Error('Direct file sink is already settling.');
      state = 'closing';
      try {
        await writable.close();
        state = 'closed';
      } catch (error) {
        state = 'open';
        throw error;
      }
    },
    async abort(reason) {
      if (state === 'closed' || state === 'aborted') return;
      if (state !== 'open') throw new Error('Direct file sink is already settling.');
      state = 'aborting';
      try {
        await writable.abort(reason);
        state = 'aborted';
      } catch (error) {
        state = 'open';
        throw error;
      }
    },
  };
}
