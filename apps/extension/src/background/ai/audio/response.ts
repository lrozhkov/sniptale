import type { AudioTranscriptResult, AudioTranscriptTiming } from '../../../contracts/ai/audio';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function timing(value: unknown, duration: number, word: boolean): AudioTranscriptTiming | null {
  if (!record(value)) return null;
  const text = value[word ? 'word' : 'text'];
  const start = value['start'];
  const end = value['end'];
  if (
    typeof text !== 'string' ||
    text.length > 100000 ||
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < -0.02 ||
    (word ? end < start : end <= start) ||
    end > duration + 0.02
  )
    return null;
  const boundedStart = Math.max(0, start);
  const boundedEnd = Math.min(duration, end);
  return boundedEnd > boundedStart || (word && start === end && start >= 0 && end <= duration)
    ? { text, start: boundedStart, end: boundedEnd }
    : null;
}
/** Invalid timings fail closed; zero-duration words retain their position as unaligned text. */
export function parseAudioTranscriptResponse(
  value: unknown,
  duration: number
): AudioTranscriptResult | null {
  if (!record(value) || typeof value['text'] !== 'string' || value['text'].length > 100000)
    return null;
  const result: AudioTranscriptResult = { text: value['text'] };
  for (const key of ['segments', 'words'] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (!Array.isArray(raw) || raw.length > 10000) return null;
    const parsed: AudioTranscriptTiming[] = [];
    for (const item of raw) {
      const entry = timing(item, duration, key === 'words');
      if (
        !entry ||
        (parsed.length > 0 &&
          entry.start <
            (key === 'words' ? parsed[parsed.length - 1]!.end : parsed[parsed.length - 1]!.start))
      )
        return null;
      parsed.push(entry);
    }
    result[key] = parsed;
  }
  return result;
}

/** Gallery extraction uses bounded mono PCM16 WAV; other encodings are not upload inputs. */
export async function validateAudioUpload(file: Blob, duration: number): Promise<boolean> {
  if (file.type !== 'audio/wav' || file.size < 44) return false;
  const buffer = await file.slice(0, 44).arrayBuffer();
  const view = new DataView(buffer);
  const text = new TextDecoder('ascii');
  const magic = (start: number, end: number) => text.decode(buffer.slice(start, end));
  const rate = view.getUint32(24, true);
  const size = view.getUint32(40, true);
  return (
    magic(0, 4) === 'RIFF' &&
    magic(8, 12) === 'WAVE' &&
    magic(12, 16) === 'fmt ' &&
    view.getUint32(16, true) === 16 &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    [16000, 24000, 44100, 48000].includes(rate) &&
    view.getUint16(34, true) === 16 &&
    view.getUint32(28, true) === rate * 2 &&
    view.getUint16(32, true) === 2 &&
    magic(36, 40) === 'data' &&
    size + 44 === file.size &&
    view.getUint32(4, true) + 8 === file.size &&
    Math.abs(size / (rate * 2) - duration) <= 0.025
  );
}
