export const VideoAnnotationLayoutFamily = {
  CONNECTOR: 'CONNECTOR',
  FRAME: 'FRAME',
  MARKER: 'MARKER',
  PILL_LABEL: 'PILL_LABEL',
  RAIL_CARD: 'RAIL_CARD',
  TITLE_STACK: 'TITLE_STACK',
} as const;

export type VideoAnnotationLayoutFamily =
  (typeof VideoAnnotationLayoutFamily)[keyof typeof VideoAnnotationLayoutFamily];
