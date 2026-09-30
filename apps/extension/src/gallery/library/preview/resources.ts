import type { GalleryPreviewPresentation } from '../types';

/** Owns the requested and last presented object URLs for one preview session. */
export function createPreviewResources(revoke: (url: string) => void) {
  let revision = -1;
  let requested: string | null = null;
  let presented: string | null = null;
  const release = (url: string | null) => {
    if (url) revoke(url);
  };
  return {
    begin(nextRevision: number) {
      if (requested !== presented) release(requested);
      requested = null;
      revision = nextRevision;
    },
    offer(requestRevision: number, url: string) {
      if (requestRevision !== revision) {
        release(url);
        return false;
      }
      if (requested !== presented) release(requested);
      requested = url;
      return true;
    },
    acknowledge(presentation: GalleryPreviewPresentation) {
      if (presentation.requestRevision !== revision) return;
      const next = presentation.outcome === 'presented' ? presentation.url : null;
      if (next !== null && next !== requested) return;
      if (presented !== next) release(presented);
      if (requested !== presented && requested !== next) release(requested);
      presented = next;
      requested = next;
    },
    dispose() {
      release(presented);
      if (requested !== presented) release(requested);
      requested = null;
      presented = null;
      revision = -1;
    },
  };
}
