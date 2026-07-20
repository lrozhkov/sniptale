import { useEffect, useRef } from 'react';

import { createVideoPreviewExactFrameCache } from '../../cache/exact-frame-cache';

export function usePreviewSessionExactFrameCache() {
  const cacheRef = useRef<ReturnType<typeof createVideoPreviewExactFrameCache> | null>(null);
  if (!cacheRef.current) cacheRef.current = createVideoPreviewExactFrameCache();
  useEffect(() => {
    const cache = cacheRef.current;
    return () => cache?.clear();
  }, []);
  return cacheRef.current;
}
