type PitchPreservingMedia = HTMLMediaElement & {
  mozPreservesPitch?: boolean;
  preservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

export function applyPreviewPitchPreservation(media: HTMLMediaElement): void {
  const pitchPreservingMedia = media as PitchPreservingMedia;
  pitchPreservingMedia.preservesPitch = true;
  pitchPreservingMedia.mozPreservesPitch = true;
  pitchPreservingMedia.webkitPreservesPitch = true;
}
