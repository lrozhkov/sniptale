export type AutoZoomProfile = {
  duration: number;
  motionBlurAmount: number;
  scale: number;
  zoomInDuration: number;
  zoomOutDuration: number;
};

const ISOLATED_PROFILES = [
  {
    duration: 3.6,
    motionBlurAmount: 0.42,
    scale: 1.52,
    zoomInDuration: 0.55,
    zoomOutDuration: 0.58,
  },
  {
    duration: 3.85,
    motionBlurAmount: 0.38,
    scale: 1.46,
    zoomInDuration: 0.5,
    zoomOutDuration: 0.62,
  },
] as const;

const TYPING_PROFILES = [
  {
    duration: 3,
    motionBlurAmount: 0.24,
    scale: 1.24,
    zoomInDuration: 0.45,
    zoomOutDuration: 0.45,
  },
  {
    duration: 3.2,
    motionBlurAmount: 0.28,
    scale: 1.3,
    zoomInDuration: 0.48,
    zoomOutDuration: 0.5,
  },
] as const;

const DEFAULT_PROFILES = [
  {
    duration: 3.2,
    motionBlurAmount: 0.3,
    scale: 1.34,
    zoomInDuration: 0.46,
    zoomOutDuration: 0.5,
  },
  {
    duration: 3.4,
    motionBlurAmount: 0.34,
    scale: 1.4,
    zoomInDuration: 0.52,
    zoomOutDuration: 0.54,
  },
] as const;

function hashSeed(value: string): number {
  return [...value].reduce((total, character) => total + character.charCodeAt(0), 0);
}

function pickProfile<TProfile extends AutoZoomProfile>(
  profiles: readonly TProfile[],
  clickId: string
): TProfile {
  return profiles[hashSeed(clickId) % profiles.length]!;
}

export function resolveAutoZoomProfileVariant(
  kind: 'default' | 'isolated' | 'typing',
  clickId: string
) {
  switch (kind) {
    case 'isolated':
      return pickProfile(ISOLATED_PROFILES, clickId);
    case 'typing':
      return pickProfile(TYPING_PROFILES, clickId);
    case 'default':
      return pickProfile(DEFAULT_PROFILES, clickId);
  }
}
