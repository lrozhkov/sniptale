const VOICE_INPUT_OPFS_ROOT = 'sniptale-voice-input';

export interface VoiceHistoryAudioStorage {
  write(identity: string, audio: Blob): Promise<void>;
  read(identity: string): Promise<File>;
  remove(identity: string): Promise<void>;
  list(): Promise<string[]>;
  erase(): Promise<void>;
}

function missing(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

/** Only this owner builds paths inside the private root. */
export function createVoiceHistoryAudioStorage(
  getRoot: () => Promise<FileSystemDirectoryHandle> = () => navigator.storage.getDirectory()
): VoiceHistoryAudioStorage {
  async function directory(create = false) {
    try {
      return await (await getRoot()).getDirectoryHandle(VOICE_INPUT_OPFS_ROOT, { create });
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }
  return {
    async write(identity, audio) {
      const root = await directory(true);
      if (!root) throw new Error('storage-failed');
      const file = await root.getFileHandle(identity, { create: true });
      const writer = await file.createWritable();
      try {
        await writer.write(audio);
        await writer.close();
      } catch (error) {
        await writer.abort().catch(() => undefined);
        throw error;
      }
    },
    async read(identity) {
      const root = await directory();
      if (!root) throw new Error('storage-failed');
      return (await root.getFileHandle(identity)).getFile();
    },
    async remove(identity) {
      const root = await directory();
      if (!root) return;
      try {
        await root.removeEntry(identity);
      } catch (error) {
        if (!missing(error)) throw error;
      }
    },
    async list() {
      const root = await directory();
      if (!root) return [];
      const names: string[] = [];
      for await (const name of root.keys()) names.push(name);
      return names;
    },
    async erase() {
      try {
        await (await getRoot()).removeEntry(VOICE_INPUT_OPFS_ROOT, { recursive: true });
      } catch (error) {
        if (!missing(error)) throw error;
      }
    },
  };
}
