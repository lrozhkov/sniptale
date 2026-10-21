import type { BookendImagePresentation, BookendVideoPresentation } from './bookend-media';

/** References name project materials, independently of their backing byte identities. */
type VideoProjectBookendImagePreset = BookendImagePresentation & { assetId: string };
type VideoProjectBookendVideoPreset = BookendVideoPresentation & { assetId: string };

/** Both remembered variants survive selecting None or another media kind. */
export type VideoProjectBookendPreset =
  | { mode: 'none'; image?: VideoProjectBookendImagePreset; video?: VideoProjectBookendVideoPreset }
  | { mode: 'image'; image: VideoProjectBookendImagePreset; video?: VideoProjectBookendVideoPreset }
  | {
      mode: 'video';
      image?: VideoProjectBookendImagePreset;
      video: VideoProjectBookendVideoPreset;
    };

/** Recipes author future insertions; accepted timeline instances remain independent. */
export interface VideoProjectBookendPresets {
  intro: VideoProjectBookendPreset;
  outro: VideoProjectBookendPreset;
}
