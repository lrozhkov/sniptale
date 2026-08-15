import { useEffect, useRef, type CSSProperties } from 'react';

export function MediaStreamVideo({
  className = 'h-full w-full object-contain',
  stream,
  style,
}: {
  className?: string;
  stream: MediaStream;
  style?: CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    videoRef.current!.srcObject = stream;
  }, [stream]);

  return <video ref={videoRef} className={className} style={style} autoPlay muted playsInline />;
}
