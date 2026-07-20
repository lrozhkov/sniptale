type DesktopMediaFailureDetails = {
  phase?: 'desktop-stream-acquire' | 'display-media-acquire';
  sourceCount?: number;
  sourceIndex?: number;
};

export class DesktopMediaAcquisitionError extends Error {
  readonly phase: 'desktop-stream-acquire' | 'display-media-acquire';
  readonly sourceCount: number | undefined;
  readonly sourceIndex: number | undefined;

  constructor(message: string, details: DesktopMediaFailureDetails = {}) {
    super(message);
    this.name = 'DesktopMediaAcquisitionError';
    this.phase = details.phase ?? 'desktop-stream-acquire';
    this.sourceCount = details.sourceCount;
    this.sourceIndex = details.sourceIndex;
  }
}

export class DesktopMediaPickerError extends Error {
  readonly phase = 'desktop-picker';
  readonly sourceCount: number | undefined;
  readonly sourceIndex: number | undefined;

  constructor(message: string, details: DesktopMediaFailureDetails = {}) {
    super(message);
    this.name = 'DesktopMediaPickerError';
    this.sourceCount = details.sourceCount;
    this.sourceIndex = details.sourceIndex;
  }
}
