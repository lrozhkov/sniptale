import { useEffect, useState } from 'react';

export function useVideoActiveCountdown(countdownEndsAt: number | null): number {
  const [remaining, setRemaining] = useState(() => {
    if (!countdownEndsAt) return 0;
    return Math.max(0, Math.ceil((countdownEndsAt - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!countdownEndsAt) {
      setRemaining(0);
      return;
    }

    const updateRemaining = () => {
      setRemaining(Math.max(0, Math.ceil((countdownEndsAt - Date.now()) / 1000)));
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(intervalId);
  }, [countdownEndsAt]);

  return remaining;
}
