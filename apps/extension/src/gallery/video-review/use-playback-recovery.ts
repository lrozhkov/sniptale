import { useEffect, useRef, useState, type RefObject } from 'react';

interface RecoveryInput {
  video: RefObject<HTMLVideoElement | null>;
  time: number;
  playing: boolean;
  stop(): void;
  restore(time: number): number;
  ready(time: number): void;
  fail(): void;
}

type PendingRecovery = {
  time: number;
  resume: boolean;
  restored: boolean;
  cancel(): void;
};

/** Owns one bounded native decoder reload; source clock and authored edits remain transport-owned. */
export function useReviewPlaybackRecovery(input: RecoveryInput) {
  const latest = useRef(input);
  latest.current = input;
  const [recovering, setRecovering] = useState(false);
  const pending = useRef<PendingRecovery | null>(null);
  const automaticUsed = useRef(false);
  const failed = useRef(false);
  const revision = useRef(0);
  const cancel = () => {
    pending.current?.cancel();
    pending.current = null;
    revision.current++;
  };
  useEffect(() => cancel, []);
  const fail = () => {
    cancel();
    setRecovering(false);
    failed.current = true;
    latest.current.stop();
    latest.current.fail();
  };
  const start = (resume: boolean) => {
    const node = latest.current.video.current;
    if (!node || pending.current) return;
    const controller = new AbortController();
    const generation = ++revision.current;
    let reload = 0;
    let deadline = 0;
    const preload = node.preload;
    const transaction: PendingRecovery = {
      time: latest.current.time,
      resume,
      restored: false,
      cancel: () => {
        controller.abort();
        window.clearTimeout(reload);
        window.clearTimeout(deadline);
        node.preload = preload;
      },
    };
    pending.current = transaction;
    setRecovering(true);
    failed.current = false;
    latest.current.stop();
    const restore = () => {
      if (pending.current !== transaction) return;
      transaction.time = latest.current.restore(transaction.time);
      transaction.restored = true;
    };
    const finish = () => {
      if (
        pending.current !== transaction ||
        !transaction.restored ||
        node.seeking ||
        node.readyState < 3
      )
        return;
      transaction.cancel();
      pending.current = null;
      setRecovering(false);
      latest.current.ready(transaction.time);
      if (transaction.resume) {
        void node.play().catch(() => {
          if (revision.current === generation) fail();
        });
      }
    };
    node.addEventListener('loadedmetadata', restore, { signal: controller.signal });
    node.addEventListener('canplay', finish, { signal: controller.signal });
    node.addEventListener('seeked', finish, { signal: controller.signal });
    // Allow Chromium's GPU restart, then request enough data to restore even a paused frame.
    reload = window.setTimeout(() => {
      if (pending.current !== transaction) return;
      try {
        node.preload = 'auto';
        node.load();
      } catch {
        fail();
      }
    }, 500);
    deadline = window.setTimeout(fail, 10000);
  };
  return {
    recovering,
    currentTime: () => pending.current?.time ?? null,
    seek: (time: number) => {
      const transaction = pending.current;
      if (!transaction) return false;
      transaction.time = time;
      const node = latest.current.video.current;
      if (transaction.restored && node) node.currentTime = time;
      return true;
    },
    retry: () => {
      if (pending.current) {
        pending.current.resume = !pending.current.resume;
        return true;
      }
      if (!failed.current && latest.current.video.current?.error?.code !== 3) return false;
      start(true);
      return true;
    },
    onMediaError: () => {
      const decode = latest.current.video.current?.error?.code === 3;
      if (decode && !automaticUsed.current && !pending.current) {
        automaticUsed.current = true;
        start(latest.current.playing);
      } else {
        fail();
        failed.current = decode;
      }
    },
  };
}
