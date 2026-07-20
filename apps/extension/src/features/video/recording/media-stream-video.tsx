import { useEffect, useRef } from 'react';

export function MediaStreamVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    videoRef.current!.srcObject = stream;
  }, [stream]);

  return (
    <video ref={videoRef} className="h-full w-full object-contain" autoPlay muted playsInline />
  );
}
