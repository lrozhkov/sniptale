/** The final document message can contain its in-flight packet and the bounded input queue. */
export const RECORDING_OBSERVATION_FINAL_MAX_BYTES = 1024 * 1024;
export const RECORDING_OBSERVATION_DRAIN_TIMEOUT_MS = 2000;
export const RECORDING_OBSERVATION_RETIRED_SOURCE_CAPACITY = 4096;

interface ObservationPacket {
  recordingId: string;
  sourceClockId: string;
  sourceInstanceId?: string;
  batchSequence: number;
  records: readonly { kind: string }[];
}

/** Checks one closed source batch without granting document or recording authority. */
export function isFinalObservationBatch<T extends ObservationPacket>(
  value: unknown,
  isPacket: (entry: unknown) => entry is T,
  maxRecords: number
): value is T[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxRecords) return false;
  let first: T | null = null;
  let previous = -1;
  let records = 0;
  let lastKind: string | undefined;
  for (const entry of value) {
    if (!isPacket(entry)) return false;
    first ??= entry;
    if (
      entry.recordingId !== first.recordingId ||
      entry.sourceInstanceId !== first.sourceInstanceId ||
      (first.sourceInstanceId === undefined && entry.sourceClockId !== first.sourceClockId) ||
      (previous !== -1 && entry.batchSequence !== previous + 1)
    )
      return false;
    records += entry.records.length;
    if (records > maxRecords) return false;
    previous = entry.batchSequence;
    lastKind = entry.records.at(-1)?.kind;
  }
  return (
    (lastKind === 'boundary' || lastKind === 'gap') &&
    new TextEncoder().encode(JSON.stringify(value)).byteLength <=
      RECORDING_OBSERVATION_FINAL_MAX_BYTES
  );
}

/** Wait for a source boundary within the recording history delivery budget. */
export async function waitForRecordingObservationDrain(stopped: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      stopped,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, RECORDING_OBSERVATION_DRAIN_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
