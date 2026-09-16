import { useEffect, useState } from 'react';
import { loadAudioPeaks } from '../../library-preview/audio-peaks';

export function useRecordedAudioPeaks(blob: Blob, duration: number) {
  const [peaks, setPeaks] = useState<number[] | null>();
  useEffect(() => {
    let cancelled = false;
    setPeaks(undefined);
    void loadAudioPeaks(blob, duration).then((result) => {
      if (!cancelled) setPeaks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [blob, duration]);
  return peaks;
}
