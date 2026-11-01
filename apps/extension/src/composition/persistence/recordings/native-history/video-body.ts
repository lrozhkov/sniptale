import { sha256 } from '@noble/hashes/sha2.js';
import type { AssetRef } from '../../assets/contracts';
import { readAssetFile } from '../../assets/opfs-store';
import { NativeRecordingHistoryError } from './contracts';

const CHUNK_BYTES = 64 * 1024;
const verified = new Map<string, number>();
/** OPFS objects are immutable. A new file version must pass the complete bounded hash again. */
export async function verifyNativeRecordingBody(
  ref: AssetRef,
  expectedSha256: string
): Promise<void> {
  const file = await readAssetFile(ref, 'native-recording.mp4');
  const key = JSON.stringify([ref, expectedSha256, file.lastModified]);
  const cached = verified.has(key);
  if (!cached) {
    const hash = sha256.create();
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES)
      hash.update(new Uint8Array(await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer()));
    const digest = Array.from(hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== expectedSha256) throw new NativeRecordingHistoryError('stale-root');
  }
  const current = await readAssetFile(ref, 'native-recording.mp4');
  if (current.lastModified !== file.lastModified || current.size !== file.size)
    throw new NativeRecordingHistoryError('stale-root');
  verified.delete(key);
  verified.set(key, file.lastModified);
  while (verified.size > 2) verified.delete(verified.keys().next().value!);
}
