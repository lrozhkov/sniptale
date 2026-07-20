import type { ErasureParticipant } from './participant-types';

export interface VideoPreviewCacheErasureAdapter {
  erase(): Promise<void>;
  verifyEmpty(): Promise<boolean>;
}

export function createVideoPreviewCacheParticipant(
  adapter: VideoPreviewCacheErasureAdapter
): ErasureParticipant {
  const id = 'indexed-db:video-preview-cache';
  return {
    id,
    severity: 'required',
    async erase() {
      await adapter.erase();
      return { id, severity: 'required', status: 'erased' };
    },
    async verifyEmpty() {
      const verified = await adapter.verifyEmpty();
      return {
        id,
        remainingCount: verified ? 0 : 1,
        severity: 'required',
        status: verified ? 'verified-empty' : 'failed',
      };
    },
  };
}
