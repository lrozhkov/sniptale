import { useEffect, useState } from 'react';
import { VideoOutputCodec } from '@sniptale/runtime-contracts/video/types/types';

type CodecSupport = 'checking' | 'available' | 'unavailable' | 'unknown';

/** Checks codec availability only; the recorder validates the actual source dimensions. */
export function useProfileCodecSupport(codec: VideoOutputCodec): CodecSupport {
  const [result, setResult] = useState<{ codec: VideoOutputCodec; support: CodecSupport } | null>(
    null
  );
  useEffect(() => {
    let active = true;
    void import('mediabunny')
      .then(async ({ canEncodeVideo }) => {
        const supported = await canEncodeVideo(
          codec === VideoOutputCodec.AVC ? 'avc' : codec === VideoOutputCodec.VP9 ? 'vp9' : 'vp8'
        );
        if (active) setResult({ codec, support: supported ? 'available' : 'unavailable' });
      })
      .catch(() => {
        if (active) setResult({ codec, support: 'unknown' });
      });
    return () => {
      active = false;
    };
  }, [codec]);
  return result?.codec === codec ? result.support : 'checking';
}
