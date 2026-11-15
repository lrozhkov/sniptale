import { sha256 } from '@noble/hashes/sha2.js';
import { RECORDING_OBSERVATION_RETIRED_SOURCE_CAPACITY } from '../../contracts/video/observation-batches';

class RecordingHistorySourceUnavailable extends Error {}

interface SourcePacket {
  recordingId: string;
  sourceClockId: string;
  sourceInstanceId?: string;
  batchSequence: number;
}
const digest = (value: unknown) =>
  Array.from(sha256(new TextEncoder().encode(JSON.stringify(value))), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');

/** Bounded ordered intake with exact final-batch receipts and retryable finalization. */
export function createRecordingHistoryIntake<P extends SourcePacket, D>(options: {
  recordingId: string;
  errorPrefix: string;
  isPacket(value: unknown): value is P;
  isFinalBatch(value: unknown): value is P[];
  process(packet: P, documentId: string, digest: string): Promise<void>;
}) {
  let closed = false;
  let failed = false;
  let queued = 0;
  let tail: Promise<void> = Promise.resolve();
  let finishing: Promise<D> | null = null;
  type Receipt = {
    digest: string;
    packetDigests: Map<number, string>;
    complete: boolean;
    completion: Promise<void>;
  };
  // At most one admitted receipt and two queued receipts can exist under the intake budget.
  const receipts = new Map<string, Receipt>();
  const retiredSources = new Set<string>();
  let admittedSource: string | null = null;
  function canAdmit(key: string): boolean {
    return (
      !retiredSources.has(key) &&
      (key === admittedSource ||
        retiredSources.size < RECORDING_OBSERVATION_RETIRED_SOURCE_CAPACITY)
    );
  }
  function unavailable() {
    return new RecordingHistorySourceUnavailable(`${options.errorPrefix}_SOURCE_UNAVAILABLE`);
  }
  function admit(key: string) {
    if (!canAdmit(key)) throw unavailable();
    if (admittedSource !== null && admittedSource !== key) {
      retiredSources.add(admittedSource);
      receipts.delete(admittedSource);
    }
    admittedSource = key;
  }
  const sourceKey = (packet: P, documentId: string) =>
    JSON.stringify([documentId, packet.sourceInstanceId ?? null]);
  const validDocument = (id: string) => /^[A-Za-z0-9._:-]{1,128}$/.test(id);
  const reject = (reason: string) => Promise.reject(new Error(`${options.errorPrefix}_${reason}`));
  function enqueue(run: () => Promise<void>): Promise<void> {
    if (closed) return reject('CLOSED');
    if (queued >= 2) return reject('BACKPRESSURE');
    queued++;
    const work = tail.then(run);
    tail = work.catch((error: unknown) => {
      if (!(error instanceof RecordingHistorySourceUnavailable)) failed = true;
    });
    return work.finally(() => {
      queued--;
    });
  }
  return {
    get failed() {
      return failed;
    },
    fail() {
      failed = true;
    },
    append(value: unknown, documentId: string): Promise<void> {
      if (closed) return reject('CLOSED');
      if (
        !options.isPacket(value) ||
        value.recordingId !== options.recordingId ||
        !validDocument(documentId)
      )
        return reject('INVALID_INPUT');
      const key = sourceKey(value, documentId);
      if (!canAdmit(key)) return Promise.reject(unavailable());
      const packet = structuredClone(value);
      const packetDigest = digest(packet);
      return enqueue(async () => {
        admit(key);
        const receipt = receipts.get(key);
        const previous = receipt?.complete
          ? receipt.packetDigests.get(packet.batchSequence)
          : undefined;
        if (previous !== undefined) {
          if (previous !== packetDigest) throw new Error(`${options.errorPrefix}_CONFLICT`);
          return;
        }
        await options.process(packet, documentId, packetDigest);
      });
    },
    appendFinal(value: unknown, documentId: string): Promise<void> {
      if (closed) return reject('CLOSED');
      if (
        !options.isFinalBatch(value) ||
        value[0]?.recordingId !== options.recordingId ||
        !validDocument(documentId)
      )
        return reject('INVALID_INPUT');
      const packets = structuredClone(value);
      const key = sourceKey(packets[0]!, documentId);
      const batchDigest = digest(packets);
      if (!canAdmit(key)) return Promise.reject(unavailable());
      const existing = receipts.get(key);
      if (existing) {
        return existing.digest === batchDigest ? existing.completion : reject('CONFLICT');
      }
      if (queued >= 2) return reject('BACKPRESSURE');
      const receipt = {
        digest: batchDigest,
        packetDigests: new Map(packets.map((packet) => [packet.batchSequence, digest(packet)])),
        complete: false,
        completion: Promise.resolve(),
      };
      receipts.set(key, receipt);
      receipt.completion = enqueue(async () => {
        admit(key);
        for (const packet of packets)
          await options.process(
            packet,
            documentId,
            receipt.packetDigests.get(packet.batchSequence)!
          );
        receipt.complete = true;
      });
      return receipt.completion;
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

/** Give queued source stop packets the bounded delivery interval. */
export { waitForRecordingObservationDrain as waitForRecordingHistoryStop } from '../../contracts/video/observation-batches';
