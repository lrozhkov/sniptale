import { useEffect, useState } from 'react';

/** Decodes current leased media for framing constraints and reset without acquiring or revoking its URL. */
export function useImageDimensions(url: string | null | undefined) {
  const [decoded, setDecoded] = useState<{ url: string; width: number; height: number } | null>(
    null
  );
  useEffect(() => {
    if (!url) return;
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0)
        setDecoded({ url, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => setDecoded(null);
    image.src = url;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [url]);
  return decoded?.url === url ? decoded : null;
}
