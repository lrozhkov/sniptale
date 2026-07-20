export const CaptureType = {
  VISIBLE: 'visible',
  FULL: 'full',
  SELECTION: 'selection',
} as const;

export type CaptureType = (typeof CaptureType)[keyof typeof CaptureType];

export const CaptureMessageType = {
  CAPTURE_VISIBLE: 'CAPTURE_VISIBLE',
  CAPTURE_FULL: 'CAPTURE_FULL',
  CAPTURE_VISIBLE_FOR_CROP: 'CAPTURE_VISIBLE_FOR_CROP',
  CAPTURE_SELECTION_START: 'CAPTURE_SELECTION_START',
  CAPTURE_SELECTION_COMPLETE: 'CAPTURE_SELECTION_COMPLETE',
  CAPTURE_SELECTION_CANCEL: 'CAPTURE_SELECTION_CANCEL',
  CAPTURE_PROGRESS: 'CAPTURE_PROGRESS',
  CAPTURE_COMPLETE: 'CAPTURE_COMPLETE',
  CAPTURE_ERROR: 'CAPTURE_ERROR',
} as const;

export type CaptureMessageType = (typeof CaptureMessageType)[keyof typeof CaptureMessageType];

export interface CaptureArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureMessage {
  type: CaptureMessageType;
  dataUrl?: string;
  area?: CaptureArea;
  filename?: string;
  error?: string;
  progress?: {
    current: number;
    total: number;
  };
}
