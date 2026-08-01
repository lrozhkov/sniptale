export const VideoQuality = {
  ULTRA: 'ULTRA',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;

export type VideoQuality = (typeof VideoQuality)[keyof typeof VideoQuality];
