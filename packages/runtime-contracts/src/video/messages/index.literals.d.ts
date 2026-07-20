declare module './index' {
  export namespace VideoMessageType {
    type OPEN_VIDEO_RECORDER = typeof import('./index').VideoMessageType.OPEN_VIDEO_RECORDER;
    type START_RECORDING = typeof import('./index').VideoMessageType.START_RECORDING;
    type CANCEL_RECORDING_START = typeof import('./index').VideoMessageType.CANCEL_RECORDING_START;
    type STOP_RECORDING = typeof import('./index').VideoMessageType.STOP_RECORDING;
    type PAUSE_RECORDING = typeof import('./index').VideoMessageType.PAUSE_RECORDING;
    type RESUME_RECORDING = typeof import('./index').VideoMessageType.RESUME_RECORDING;
    type UPDATE_SETTINGS = typeof import('./index').VideoMessageType.UPDATE_SETTINGS;
    type RECORDING_STATUS_CHANGED =
      typeof import('./index').VideoMessageType.RECORDING_STATUS_CHANGED;
    type RECORDING_DURATION_UPDATED =
      typeof import('./index').VideoMessageType.RECORDING_DURATION_UPDATED;
    type RECORDING_ERROR = typeof import('./index').VideoMessageType.RECORDING_ERROR;
    type READY_TO_COUNTDOWN = typeof import('./index').VideoMessageType.READY_TO_COUNTDOWN;
    type GET_RECORDING_STATE = typeof import('./index').VideoMessageType.GET_RECORDING_STATE;
    type REGISTER_CAMERA_RECORDER_CONTROL =
      typeof import('./index').VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL;
    type RECORDING_STATE_SYNC = typeof import('./index').VideoMessageType.RECORDING_STATE_SYNC;
    type COUNTDOWN_COMPLETE = typeof import('./index').VideoMessageType.COUNTDOWN_COMPLETE;
    type OFFSCREEN_START_RECORDING =
      typeof import('./index').VideoMessageType.OFFSCREEN_START_RECORDING;
    type OFFSCREEN_UPDATE_VIEWPORT_CROP =
      typeof import('./index').VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP;
    type OFFSCREEN_SET_VIEWPORT_DRAW_STATE =
      typeof import('./index').VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE;
    type OFFSCREEN_STOP_RECORDING =
      typeof import('./index').VideoMessageType.OFFSCREEN_STOP_RECORDING;
    type OFFSCREEN_PAUSE_RECORDING =
      typeof import('./index').VideoMessageType.OFFSCREEN_PAUSE_RECORDING;
    type OFFSCREEN_RESUME_RECORDING =
      typeof import('./index').VideoMessageType.OFFSCREEN_RESUME_RECORDING;
    type OFFSCREEN_UPDATE_SETTINGS =
      typeof import('./index').VideoMessageType.OFFSCREEN_UPDATE_SETTINGS;
    type OFFSCREEN_READY = typeof import('./index').VideoMessageType.OFFSCREEN_READY;
    type OFFSCREEN_RECORDING_STARTED =
      typeof import('./index').VideoMessageType.OFFSCREEN_RECORDING_STARTED;
    type OFFSCREEN_RECORDING_STOPPED =
      typeof import('./index').VideoMessageType.OFFSCREEN_RECORDING_STOPPED;
    type OFFSCREEN_RECORDING_PAUSED =
      typeof import('./index').VideoMessageType.OFFSCREEN_RECORDING_PAUSED;
    type OFFSCREEN_RECORDING_RESUMED =
      typeof import('./index').VideoMessageType.OFFSCREEN_RECORDING_RESUMED;
    type OFFSCREEN_ERROR = typeof import('./index').VideoMessageType.OFFSCREEN_ERROR;
    type GET_VIEWPORT_COORDS = typeof import('./index').VideoMessageType.GET_VIEWPORT_COORDS;
    type GET_RECORDING_TAB_ID = typeof import('./index').VideoMessageType.GET_RECORDING_TAB_ID;
    type ENABLE_ANNOTATIONS = typeof import('./index').VideoMessageType.ENABLE_ANNOTATIONS;
    type DISABLE_ANNOTATIONS = typeof import('./index').VideoMessageType.DISABLE_ANNOTATIONS;
    type ENABLE_CONTROLLED_CURSOR_CAPTURE =
      typeof import('./index').VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE;
    type DISABLE_CONTROLLED_CURSOR_CAPTURE =
      typeof import('./index').VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE;
    type PAUSE_CONTROLLED_CURSOR_CAPTURE =
      typeof import('./index').VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE;
    type RESUME_CONTROLLED_CURSOR_CAPTURE =
      typeof import('./index').VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE;
    type SHOW_COUNTDOWN = typeof import('./index').VideoMessageType.SHOW_COUNTDOWN;
    type HIDE_COUNTDOWN = typeof import('./index').VideoMessageType.HIDE_COUNTDOWN;
    type ANNOTATION_CREATED = typeof import('./index').VideoMessageType.ANNOTATION_CREATED;
    type DIAGNOSTIC_EVENT_FROM_CS =
      typeof import('./index').VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS;
    type ENABLE_DIAGNOSTIC_LOGGER =
      typeof import('./index').VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER;
    type DISABLE_DIAGNOSTIC_LOGGER =
      typeof import('./index').VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER;
    type DEBUGGER_FORCEFULLY_DETACHED =
      typeof import('./index').VideoMessageType.DEBUGGER_FORCEFULLY_DETACHED;
    type SHOW_REGION_SELECTOR = typeof import('./index').VideoMessageType.SHOW_REGION_SELECTOR;
    type HIDE_REGION_SELECTOR = typeof import('./index').VideoMessageType.HIDE_REGION_SELECTOR;
    type REGION_SELECTED = typeof import('./index').VideoMessageType.REGION_SELECTED;
    type REGION_SELECTION_CANCELLED =
      typeof import('./index').VideoMessageType.REGION_SELECTION_CANCELLED;
    type SHOW_RECORDING_OVERLAY = typeof import('./index').VideoMessageType.SHOW_RECORDING_OVERLAY;
    type HIDE_RECORDING_OVERLAY = typeof import('./index').VideoMessageType.HIDE_RECORDING_OVERLAY;
    type DESKTOP_CAPTURE_SOURCE_SELECTED =
      typeof import('./index').VideoMessageType.DESKTOP_CAPTURE_SOURCE_SELECTED;
    type DESKTOP_CAPTURE_CANCELLED =
      typeof import('./index').VideoMessageType.DESKTOP_CAPTURE_CANCELLED;
    type CAPTURE_SOURCE_UPDATED = typeof import('./index').VideoMessageType.CAPTURE_SOURCE_UPDATED;
    type CAPTURE_SOURCE_OBTAINED =
      typeof import('./index').VideoMessageType.CAPTURE_SOURCE_OBTAINED;
    type RECORDING_START_FAILED = typeof import('./index').VideoMessageType.RECORDING_START_FAILED;
    type GET_DESKTOP_MEDIA = typeof import('./index').VideoMessageType.GET_DESKTOP_MEDIA;
    type DISPOSE_DESKTOP_MEDIA = typeof import('./index').VideoMessageType.DISPOSE_DESKTOP_MEDIA;
    type DESKTOP_MEDIA_OBTAINED = typeof import('./index').VideoMessageType.DESKTOP_MEDIA_OBTAINED;
    type DESKTOP_MEDIA_CANCELLED =
      typeof import('./index').VideoMessageType.DESKTOP_MEDIA_CANCELLED;
    type DESKTOP_MEDIA_FAILED = typeof import('./index').VideoMessageType.DESKTOP_MEDIA_FAILED;
    type CACHE_DESKTOP_STREAM_FROM_ID =
      typeof import('./index').VideoMessageType.CACHE_DESKTOP_STREAM_FROM_ID;
    type DESKTOP_STREAM_CACHED = typeof import('./index').VideoMessageType.DESKTOP_STREAM_CACHED;
    type DESKTOP_STREAM_CACHE_FAILED =
      typeof import('./index').VideoMessageType.DESKTOP_STREAM_CACHE_FAILED;
    type START_PROJECT_EXPORT = typeof import('./index').VideoMessageType.START_PROJECT_EXPORT;
    type CANCEL_PROJECT_EXPORT = typeof import('./index').VideoMessageType.CANCEL_PROJECT_EXPORT;
    type GET_PROJECT_EXPORT_CAPABILITIES =
      typeof import('./index').VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES;
    type OFFSCREEN_START_PROJECT_EXPORT =
      typeof import('./index').VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT;
    type OFFSCREEN_CANCEL_PROJECT_EXPORT =
      typeof import('./index').VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT;
    type OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES =
      typeof import('./index').VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES;
    type PROJECT_EXPORT_PROGRESS =
      typeof import('./index').VideoMessageType.PROJECT_EXPORT_PROGRESS;
    type PROJECT_EXPORT_COMPLETED =
      typeof import('./index').VideoMessageType.PROJECT_EXPORT_COMPLETED;
    type PROJECT_EXPORT_FAILED = typeof import('./index').VideoMessageType.PROJECT_EXPORT_FAILED;
    type PROJECT_EXPORT_CANCELLED =
      typeof import('./index').VideoMessageType.PROJECT_EXPORT_CANCELLED;
    type DOWNLOAD_RECORDING = typeof import('./index').VideoMessageType.DOWNLOAD_RECORDING;
    type DOWNLOAD_RECORDING_SIDECAR =
      typeof import('./index').VideoMessageType.DOWNLOAD_RECORDING_SIDECAR;
    type VIDEO_SAVED_TO_IDB = typeof import('./index').VideoMessageType.VIDEO_SAVED_TO_IDB;
  }
}

export {};
