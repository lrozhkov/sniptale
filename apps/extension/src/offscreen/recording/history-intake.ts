import { sha256 } from '@noble/hashes/sha2.js';

/** Bounded, ordered intake and retryable finalization for browser recording histories. */
export function createRecordingHistoryIntake<P extends { recordingId: string }, D>(options: {
  recordingId: string;
  errorPrefix: string;
  isPacket(value: unknown): value is P;
  process(packet: P, documentId: string, digest: string): Promise<void>;
}) {
  let closed = false;
  let failed = false;
  let queued = 0;
  let tail: Promise<void> = Promise.resolve();
  let finishing: Promise<D> | null = null;
  return {
    get failed() {
      return failed;
    },
    fail() {
      failed = true;
    },
    append(value: unknown, documentId: string): Promise<void> {
      if (closed) return Promise.reject(new Error(`${options.errorPrefix}_CLOSED`));
      if (queued >= 2) return Promise.reject(new Error(`${options.errorPrefix}_BACKPRESSURE`));
      if (
        !options.isPacket(value) ||
        value.recordingId !== options.recordingId ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(documentId)
      )
        return Promise.reject(new Error(`${options.errorPrefix}_INVALID_INPUT`));
      const packet = structuredClone(value);
      const digest = Array.from(sha256(new TextEncoder().encode(JSON.stringify(packet))), (byte) =>
        byte.toString(16).padStart(2, '0')
      ).join('');
      queued += 1;
      const work = tail.then(() => options.process(packet, documentId, digest));
      tail = work.catch(() => {
        failed = true;
      });
      return work.finally(() => {
        queued -= 1;
      });
    },
    async closeAndDrain(): Promise<void> {
      closed = true;
      await tail;
    },
    finalize(run: () => Promise<D>): Promise<D> {
      finishing ??= run();
      const attempt = finishing;
      return attempt.catch((error: unknown) => {
        if (finishing === attempt) finishing = null;
        throw error;
      });
    },
  };
}

/** Give queued source stop packets the existing bounded delivery interval. */
export async function waitForRecordingHistoryStop(stopped: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      stopped,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
