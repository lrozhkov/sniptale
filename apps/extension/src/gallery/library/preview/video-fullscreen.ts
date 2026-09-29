import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

type PlayerError = 'media' | 'action' | null;

/** Owns fullscreen focus restoration and document-level state for one player. */
export function useVideoFullscreen({
  pending,
  setPending,
  setError,
}: {
  pending: boolean;
  setPending: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<PlayerError>>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let wasFullscreen = false;
    const update = () => {
      const active = document.fullscreenElement === container.current;
      setFullscreen(active);
      if (wasFullscreen && !active) fullscreenButton.current?.querySelector('button')?.focus();
      wasFullscreen = active;
    };
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const toggleFullscreen = async () => {
    if (pending) return;
    setPending(true);
    setError((current) => (current === 'media' ? current : null));
    try {
      if (document.fullscreenElement === container.current) await document.exitFullscreen();
      else await container.current?.requestFullscreen();
    } catch {
      setError((current) => (current === 'media' ? current : 'action'));
    } finally {
      setPending(false);
    }
  };

  return { container, fullscreenButton, fullscreen, toggleFullscreen };
}
