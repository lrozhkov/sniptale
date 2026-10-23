import { normalizePaintColor } from '@sniptale/foundation/paint';
import {
  isRecord,
  isBoundedNumber,
  MAX_VIDEO_PROJECT_DURATION_SECONDS,
} from '../validation/primitives';

/** Framing is independent of source admission, resource identity and editor clocks. */
export interface BookendMediaFraming {
  fit: 'contain' | 'cover';
  fillColor: string;
  crop: { panX: number; panY: number };
}
export interface BookendImagePresentation extends BookendMediaFraming {
  duration: number;
}
export interface BookendVideoPresentation extends BookendMediaFraming {
  trim: { start: number; end: number };
  audio: { muted: boolean; gain: number };
}

/** Each caller receives independent authored settings. Source facts remain caller-owned. */
export function createBookendImagePresentation(): BookendImagePresentation {
  return { fit: 'contain', fillColor: '#000000ff', crop: { panX: 0, panY: 0 }, duration: 3 };
}
export function createBookendVideoPresentation(duration: number): BookendVideoPresentation {
  const { duration: _duration, ...framing } = createBookendImagePresentation();
  return { ...framing, trim: { start: 0, end: duration }, audio: { muted: false, gain: 1 } };
}

/** Parent contracts admit their own identity and metadata fields. */
function parseFraming(value: unknown): BookendMediaFraming | null {
  if (!isRecord(value) || (value['fit'] !== 'contain' && value['fit'] !== 'cover')) return null;
  const fillColor =
    typeof value['fillColor'] === 'string' ? normalizePaintColor(value['fillColor']) : null;
  const crop = value['crop'];
  if (
    !fillColor?.endsWith('ff') ||
    !isRecord(crop) ||
    Object.keys(crop).some((key) => key !== 'panX' && key !== 'panY') ||
    !isBoundedNumber(crop['panX'], -1, 1) ||
    !isBoundedNumber(crop['panY'], -1, 1)
  )
    return null;
  return { fit: value['fit'], fillColor, crop: { panX: crop['panX'], panY: crop['panY'] } };
}

/** Image-card duration limits do not limit an ordinary editable timeline clip. */
export function parseBookendImagePresentation(value: unknown): BookendImagePresentation | null {
  const framing = parseFraming(value);
  return framing && isRecord(value) && isBoundedNumber(value['duration'], 0.1, 60)
    ? { ...framing, duration: value['duration'] }
    : null;
}

/** Source duration is supplied by the existing source admission owner. */
export function parseBookendVideoPresentation(
  value: unknown,
  sourceDuration = MAX_VIDEO_PROJECT_DURATION_SECONDS
): BookendVideoPresentation | null {
  const framing = parseFraming(value);
  if (
    !framing ||
    !isRecord(value) ||
    !isBoundedNumber(sourceDuration, Number.MIN_VALUE, MAX_VIDEO_PROJECT_DURATION_SECONDS)
  )
    return null;
  const trim = value['trim'];
  const audio = value['audio'];
  if (
    !isRecord(trim) ||
    Object.keys(trim).some((key) => key !== 'start' && key !== 'end') ||
    !isBoundedNumber(trim['start'], 0, sourceDuration) ||
    !isBoundedNumber(trim['end'], 0, sourceDuration) ||
    trim['end'] <= trim['start'] ||
    !isRecord(audio) ||
    Object.keys(audio).some((key) => key !== 'muted' && key !== 'gain') ||
    typeof audio['muted'] !== 'boolean' ||
    !isBoundedNumber(audio['gain'], 0, 2)
  )
    return null;
  return {
    ...framing,
    trim: { start: trim['start'], end: trim['end'] },
    audio: { muted: audio['muted'], gain: audio['gain'] },
  };
}
