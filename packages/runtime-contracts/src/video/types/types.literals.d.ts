declare module './types' {
  export namespace CaptureMode {
    type TAB = typeof import('./types').CaptureMode.TAB;
    type TAB_CROP = typeof import('./types').CaptureMode.TAB_CROP;
    type CAMERA = typeof import('./types').CaptureMode.CAMERA;
    type SCREEN = typeof import('./types').CaptureMode.SCREEN;
    type VIEWPORT_EMULATION = typeof import('./types').CaptureMode.VIEWPORT_EMULATION;
  }

  export namespace VideoRecordingStatus {
    type IDLE = typeof import('./types').VideoRecordingStatus.IDLE;
    type PREPARING = typeof import('./types').VideoRecordingStatus.PREPARING;
    type COUNTDOWN = typeof import('./types').VideoRecordingStatus.COUNTDOWN;
    type RECORDING = typeof import('./types').VideoRecordingStatus.RECORDING;
    type PAUSED = typeof import('./types').VideoRecordingStatus.PAUSED;
    type STOPPING = typeof import('./types').VideoRecordingStatus.STOPPING;
  }

  export namespace VideoQuality {
    type ULTRA = typeof import('./types').VideoQuality.ULTRA;
    type HIGH = typeof import('./types').VideoQuality.HIGH;
    type MEDIUM = typeof import('./types').VideoQuality.MEDIUM;
    type LOW = typeof import('./types').VideoQuality.LOW;
  }
}

export {};
