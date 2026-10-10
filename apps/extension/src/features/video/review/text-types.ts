import type {
  ReviewSpeechPhrase,
  ReviewSpeechProfile,
  ReviewSpeechWord,
} from './speech-transcript';

/** Provenance is descriptive, not an asset lease or authority to extract audio. */
export interface ReviewTextOrigin {
  kind: 'original' | 'voiceover';
  clipId?: string;
  /** Native seconds of the recognized source, independent of the current placement. */
  start: number;
  end: number;
  words?: ReviewSpeechWord[];
}

/** Caption sizes are fractions of the final frame height, independent of camera zoom. */
export interface ReviewCaptionStyle {
  position: 'top' | 'bottom';
  fontSize: number;
  color: string;
  background: string;
}

export interface ReviewCaptionSettings {
  enabled: boolean;
  style: ReviewCaptionStyle;
}

/** Words, start and end share the declared clock; revision counts content changes only. */
export interface ReviewTextFragment extends ReviewSpeechPhrase {
  timeDomain: 'source' | 'result';
  timingRevision: number;
  showInVideo: boolean;
  style?: ReviewCaptionStyle;
  origin?: ReviewTextOrigin;
  /** Multiple descriptive sources after an explicitly permitted script rewrite. */
  origins?: ReviewTextOrigin[];
  language?: string;
  variantId?: string;
  derivedFrom?: string[];
}

/** Standalone authored text; audio clips and their lifetimes are independent. */
export interface ReviewTextDocument {
  version: 1;
  fragments: ReviewTextFragment[];
}

/** Immutable association retained by an ordinary voiceover clip, even after text deletion. */
export interface ReviewVoiceTextSnapshot {
  kind: 'ai' | 'microphone' | 'gallery';
  textId: string;
  revision: number;
  timingRevision: number;
  text: string;
  start: number;
  end: number;
  timeDomain: 'source' | 'result';
  profile?: ReviewSpeechProfile;
}

export type ReviewTextEditResult =
  | { ok: true; document: ReviewTextDocument }
  | { ok: false; reason: 'stale' | 'invalid' | 'alignment' | 'gap' };
