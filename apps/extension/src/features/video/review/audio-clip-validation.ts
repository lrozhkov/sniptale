import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isBoundedNumber } from '../project/validation/primitives';
import { MAX_AUDIO_FADE_SECONDS } from '../audio/fades';
import { parseVoiceoverAnchors } from './voiceover-validation';
import { parseReviewSpeechTranscript } from './speech-validation';
import { parseReviewVoiceTextSnapshot } from './text-validation';
import type { QuickEditAudioClip } from './advanced/types';

const MAX_QUICK_EDIT_TIME = 86_400;
const MAX_QUICK_EDIT_CLIP_VOLUME = 2;
const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value;

/** Admits a whole audio take; derived playback slices never become saved content. */
export function parseReviewAudioClip(value: unknown): QuickEditAudioClip | null {
  if (
    !isRecord(value) ||
    !identity(value['id']) ||
    !identity(value['assetId']) ||
    (value['tempo'] !== undefined && !isBoundedNumber(value['tempo'], 0.25, 4)) ||
    !isBoundedNumber(value['timelineStart'], 0, MAX_QUICK_EDIT_TIME) ||
    !isBoundedNumber(value['sourceOffset'], 0, MAX_QUICK_EDIT_TIME) ||
    !isBoundedNumber(value['duration'], 0.001, MAX_QUICK_EDIT_TIME) ||
    !isBoundedNumber(value['volume'], 0, MAX_QUICK_EDIT_CLIP_VOLUME) ||
    typeof value['muted'] !== 'boolean' ||
    !isBoundedNumber(value['fadeIn'], 0, MAX_AUDIO_FADE_SECONDS) ||
    !isBoundedNumber(value['fadeOut'], 0, MAX_AUDIO_FADE_SECONDS)
  )
    return null;
  const sourceAnchor =
    value['sourceAnchor'] === undefined
      ? undefined
      : parseVoiceoverAnchors(value['sourceAnchor'], value['timelineStart'], value['duration']);
  const transcript =
    value['transcript'] === undefined
      ? undefined
      : parseReviewSpeechTranscript(value['transcript']);
  const textSnapshot =
    value['textSnapshot'] === undefined
      ? undefined
      : parseReviewVoiceTextSnapshot(value['textSnapshot']);
  if (sourceAnchor === null || transcript === null || textSnapshot === null) return null;
  return {
    ...(textSnapshot ? { textSnapshot } : {}),
    ...(sourceAnchor ? { sourceAnchor } : {}),
    ...(transcript ? { transcript } : {}),
    ...(typeof value['tempo'] === 'number' ? { tempo: value['tempo'] } : {}),
    id: value['id'],
    assetId: value['assetId'],
    timelineStart: value['timelineStart'],
    sourceOffset: value['sourceOffset'],
    duration: value['duration'],
    volume: value['volume'],
    muted: value['muted'],
    fadeIn: value['fadeIn'],
    fadeOut: value['fadeOut'],
    ...(typeof value['dormant'] === 'boolean' ? { dormant: value['dormant'] } : {}),
  };
}
