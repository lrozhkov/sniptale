import { useEffect, useRef, useState } from 'react';

/** Owns one browser download URL until the next attempt or consumer disposal. */
export function useSubtitleExport() {
  const url = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'started' | 'failed'>('idle');
  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current);
    },
    []
  );
  return {
    status,
    download(text: string, format: 'srt' | 'vtt') {
      try {
        if (url.current) {
          URL.revokeObjectURL(url.current);
          url.current = null;
        }
        url.current = URL.createObjectURL(
          new Blob([text], {
            type:
              format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8',
          })
        );
        const link = document.createElement('a');
        link.href = url.current;
        link.download = `subtitles.${format}`;
        link.click();
        setStatus('started');
      } catch {
        setStatus('failed');
      }
    },
  };
}
