import type { ExportSink } from '../../archive-transfer/contracts';
import type { AssetObjectWriter, PreparedAssetObject } from './contracts';
import { createAssetObjectWriter } from './opfs-store';

export interface PreparedAssetArchiveSink {
  preparedAsset(): PreparedAssetObject;
  sink: ExportSink;
}

export async function createPreparedAssetArchiveSink(args: {
  assetId?: string | undefined;
  mimeType: string;
}): Promise<PreparedAssetArchiveSink> {
  const assetWriter = await createAssetObjectWriter({
    ...(args.assetId ? { assetId: args.assetId } : {}),
    mimeType: args.mimeType,
  });
  return createArchiveSink(assetWriter);
}

function createArchiveSink(assetWriter: AssetObjectWriter): PreparedAssetArchiveSink {
  let phase: 'aborted' | 'aborting' | 'closed' | 'closing' | 'open' = 'open';
  let prepared: PreparedAssetObject | null = null;
  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      if (phase !== 'open') throw new Error(`Prepared asset archive sink is ${phase}.`);
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      await assetWriter.append(new Blob([copy.buffer]));
    },
  });

  return {
    preparedAsset() {
      if (phase !== 'closed' || !prepared) {
        throw new Error('Prepared archive asset is unavailable before a successful close.');
      }
      return prepared;
    },
    sink: {
      writable,
      async close() {
        if (phase === 'closed') return;
        if (phase !== 'open') throw new Error('Prepared asset archive sink is already settling.');
        phase = 'closing';
        try {
          prepared = await assetWriter.finalize();
          phase = 'closed';
        } catch (error) {
          phase = 'open';
          throw error;
        }
      },
      async abort() {
        if (phase === 'aborted' || phase === 'closed') return;
        if (phase !== 'open') throw new Error('Prepared asset archive sink is already settling.');
        phase = 'aborting';
        try {
          await assetWriter.abort();
          phase = 'aborted';
        } catch (error) {
          phase = 'open';
          throw error;
        }
      },
    },
  };
}
