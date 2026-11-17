/** Publishes accepted source time without scheduling a React render for subscribers. */
export function createReviewPlaybackPresentationClock(isPlaying: () => boolean) {
  let time = 0;
  const listeners = new Set<() => void>();
  return {
    read: () => time,
    isPlaying,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(value: number) {
      if (!Number.isFinite(value) || value === time) return;
      time = value;
      for (const listener of listeners) listener();
    },
  };
}
