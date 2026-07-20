declare module './' {
  export namespace MessageType {
    type ENABLE_SCREENSHOT_MODE = typeof import('./').MessageType.ENABLE_SCREENSHOT_MODE;
    type DISABLE_SCREENSHOT_MODE = typeof import('./').MessageType.DISABLE_SCREENSHOT_MODE;
    type SCREENSHOT_MODE_STATUS = typeof import('./').MessageType.SCREENSHOT_MODE_STATUS;
    type ENABLE_HIGHLIGHTER_MODE = typeof import('./').MessageType.ENABLE_HIGHLIGHTER_MODE;
    type DISABLE_HIGHLIGHTER_MODE = typeof import('./').MessageType.DISABLE_HIGHLIGHTER_MODE;
    type HIGHLIGHTER_MODE_STATUS = typeof import('./').MessageType.HIGHLIGHTER_MODE_STATUS;
    type ENABLE_QUICK_EDIT_MODE = typeof import('./').MessageType.ENABLE_QUICK_EDIT_MODE;
    type DISABLE_QUICK_EDIT_MODE = typeof import('./').MessageType.DISABLE_QUICK_EDIT_MODE;
    type QUICK_EDIT_MODE_STATUS = typeof import('./').MessageType.QUICK_EDIT_MODE_STATUS;
    type GET_PAGE_STYLE_CURRENT_RULE_SUMMARY =
      typeof import('./').MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY;
    type OPEN_PAGE_STYLE_INSPECTOR = typeof import('./').MessageType.OPEN_PAGE_STYLE_INSPECTOR;
    type SHOW_TOOLBAR = typeof import('./').MessageType.SHOW_TOOLBAR;
    type HIDE_TOOLBAR = typeof import('./').MessageType.HIDE_TOOLBAR;
    type TOOLBAR_STATUS = typeof import('./').MessageType.TOOLBAR_STATUS;
    type REQUEST_LLM_SESSION = typeof import('./').MessageType.REQUEST_LLM_SESSION;
    type PROCESS_WITH_LLM = typeof import('./').MessageType.PROCESS_WITH_LLM;
    type PROCESS_SCENARIO_EDITOR_WITH_LLM =
      typeof import('./').MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM;
    type AI_SETTINGS_QUERY = typeof import('./').MessageType.AI_SETTINGS_QUERY;
    type AI_SETTINGS_MUTATION = typeof import('./').MessageType.AI_SETTINGS_MUTATION;
    type AI_SECRET_UNLOCK = typeof import('./').MessageType.AI_SECRET_UNLOCK;
    type PAGE_ACCESS = typeof import('./').MessageType.PAGE_ACCESS;
    type ERASE_LOCAL_EXTENSION_DATA = typeof import('./').MessageType.ERASE_LOCAL_EXTENSION_DATA;
    type LLM_RESPONSE = typeof import('./').MessageType.LLM_RESPONSE;
    type LLM_ERROR = typeof import('./').MessageType.LLM_ERROR;
    type SET_VIEWPORT = typeof import('./').MessageType.SET_VIEWPORT;
    type VIEWPORT_CHANGED = typeof import('./').MessageType.VIEWPORT_CHANGED;
    type GET_VIEWPORT_STATUS = typeof import('./').MessageType.GET_VIEWPORT_STATUS;
    type OPEN_EXPORT_MODAL = typeof import('./').MessageType.OPEN_EXPORT_MODAL;
    type EXPORT_POPUP_PREVIEW = typeof import('./').MessageType.EXPORT_POPUP_PREVIEW;
    type EXPORT_POPUP_START = typeof import('./').MessageType.EXPORT_POPUP_START;
    type EXPORT_POPUP_BUILD_PACKAGE = typeof import('./').MessageType.EXPORT_POPUP_BUILD_PACKAGE;
    type EXPORT_POPUP_SAVE_WEB_SNAPSHOT =
      typeof import('./').MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT;
    type STAGE_POPUP_EXPORT_ARCHIVE_CHUNK =
      typeof import('./').MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK;
    type EXPORT_POPUP_SAVE_ARCHIVE = typeof import('./').MessageType.EXPORT_POPUP_SAVE_ARCHIVE;
    type RELEASE_POPUP_EXPORT_ARCHIVE =
      typeof import('./').MessageType.RELEASE_POPUP_EXPORT_ARCHIVE;
    type EXPORT_POPUP_CANCEL = typeof import('./').MessageType.EXPORT_POPUP_CANCEL;
    type REQUEST_POPUP_TAB_ROUTE_CAPABILITY =
      typeof import('./').MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY;
    type REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY =
      typeof import('./').MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY;
    type REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN =
      typeof import('./').MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN;
    type REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF =
      typeof import('./').MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF;
    type REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY =
      typeof import('./').MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY;
    type CONTENT_RUNTIME_WAKEUP = typeof import('./').MessageType.CONTENT_RUNTIME_WAKEUP;
    type EXPORT_POPUP_PROGRESS = typeof import('./').MessageType.EXPORT_POPUP_PROGRESS;
    type EXPORT_POPUP_RESULT = typeof import('./').MessageType.EXPORT_POPUP_RESULT;
    type REQUEST_EXPORT_HAR_START_CAPABILITY =
      typeof import('./').MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY;
    type EXPORT_START_HAR = typeof import('./').MessageType.EXPORT_START_HAR;
    type EXPORT_STOP_HAR = typeof import('./').MessageType.EXPORT_STOP_HAR;
    type EXPORT_CAPTURE_FULL_PAGE = typeof import('./').MessageType.EXPORT_CAPTURE_FULL_PAGE;
    type OPEN_EDITOR_WITH_IMAGE = typeof import('./').MessageType.OPEN_EDITOR_WITH_IMAGE;
    type IMAGE_DATA_FOR_EDITOR = typeof import('./').MessageType.IMAGE_DATA_FOR_EDITOR;
    type SAVE_SCREENSHOT_TO_GALLERY = typeof import('./').MessageType.SAVE_SCREENSHOT_TO_GALLERY;
    type SAVE_WEB_SNAPSHOT_TO_GALLERY =
      typeof import('./').MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY;
    type REGISTER_WEB_SNAPSHOT_ASSETS =
      typeof import('./').MessageType.REGISTER_WEB_SNAPSHOT_ASSETS;
    type FETCH_WEB_SNAPSHOT_ASSET = typeof import('./').MessageType.FETCH_WEB_SNAPSHOT_ASSET;
    type STAGE_WEB_SNAPSHOT_BLOB_CHUNK =
      typeof import('./').MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK;
    type REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY =
      typeof import('./').MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY;
    type UPDATE_GALLERY_IMAGE_ASSET = typeof import('./').MessageType.UPDATE_GALLERY_IMAGE_ASSET;
    type STAGE_RECORDING_DOWNLOAD_CHUNK =
      typeof import('./').MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK;
    type SAVE_RECORDING_FOR_DOWNLOAD = typeof import('./').MessageType.SAVE_RECORDING_FOR_DOWNLOAD;
    type RELEASE_RECORDING_DOWNLOAD = typeof import('./').MessageType.RELEASE_RECORDING_DOWNLOAD;
    type SCENARIO_GET_SESSION = typeof import('./').MessageType.SCENARIO_GET_SESSION;
    type SCENARIO_SET_ENABLED = typeof import('./').MessageType.SCENARIO_SET_ENABLED;
    type SCENARIO_SET_CAPTURE_MODE = typeof import('./').MessageType.SCENARIO_SET_CAPTURE_MODE;
    type SCENARIO_SET_SIDEBAR_VISIBLE =
      typeof import('./').MessageType.SCENARIO_SET_SIDEBAR_VISIBLE;
    type SCENARIO_SET_ACTIVE_PROJECT = typeof import('./').MessageType.SCENARIO_SET_ACTIVE_PROJECT;
    type SCENARIO_LIST_PROJECTS = typeof import('./').MessageType.SCENARIO_LIST_PROJECTS;
    type SCENARIO_CREATE_PROJECT = typeof import('./').MessageType.SCENARIO_CREATE_PROJECT;
    type SCENARIO_SAVE_CAPTURE_STEP = typeof import('./').MessageType.SCENARIO_SAVE_CAPTURE_STEP;
    type SCENARIO_DELETE_STEP = typeof import('./').MessageType.SCENARIO_DELETE_STEP;
    type SCENARIO_RESTORE_STEP = typeof import('./').MessageType.SCENARIO_RESTORE_STEP;
    type SCENARIO_MOVE_STEP = typeof import('./').MessageType.SCENARIO_MOVE_STEP;
    type SCENARIO_RECORD_SUGGESTED_EVENT =
      typeof import('./').MessageType.SCENARIO_RECORD_SUGGESTED_EVENT;
    type SCENARIO_OPEN_EDITOR = typeof import('./').MessageType.SCENARIO_OPEN_EDITOR;
    type SCENARIO_GET_RESTORE_SNAPSHOT =
      typeof import('./').MessageType.SCENARIO_GET_RESTORE_SNAPSHOT;
    type SCENARIO_UPDATE_SURFACE_STATE =
      typeof import('./').MessageType.SCENARIO_UPDATE_SURFACE_STATE;
    type SCENARIO_UPDATE_SESSION_PREFS =
      typeof import('./').MessageType.SCENARIO_UPDATE_SESSION_PREFS;
    type EXECUTE_SAVE = typeof import('./').MessageType.EXECUTE_SAVE;
    type SHOW_SAVE_DIALOG = typeof import('./').MessageType.SHOW_SAVE_DIALOG;
    type TRIGGER_QUICK_ACTION = typeof import('./').MessageType.TRIGGER_QUICK_ACTION;
    type SHOW_TOAST = typeof import('./').MessageType.SHOW_TOAST;
    type SHOW_QUICK_ACTION_COUNTDOWN = typeof import('./').MessageType.SHOW_QUICK_ACTION_COUNTDOWN;
    type COPY_IMAGE_TO_CLIPBOARD = typeof import('./').MessageType.COPY_IMAGE_TO_CLIPBOARD;
    type COPY_TEXT_TO_CLIPBOARD = typeof import('./').MessageType.COPY_TEXT_TO_CLIPBOARD;
    type DESTROY_UI_TOOLBAR = typeof import('./').MessageType.DESTROY_UI_TOOLBAR;
  }

  export namespace CaptureType {
    type VISIBLE = typeof import('./').CaptureType.VISIBLE;
    type FULL = typeof import('./').CaptureType.FULL;
    type SELECTION = typeof import('./').CaptureType.SELECTION;
  }

  export namespace CaptureMessageType {
    type CAPTURE_VISIBLE = typeof import('./').CaptureMessageType.CAPTURE_VISIBLE;
    type CAPTURE_FULL = typeof import('./').CaptureMessageType.CAPTURE_FULL;
    type CAPTURE_VISIBLE_FOR_CROP = typeof import('./').CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP;
    type CAPTURE_SELECTION_START = typeof import('./').CaptureMessageType.CAPTURE_SELECTION_START;
    type CAPTURE_SELECTION_COMPLETE =
      typeof import('./').CaptureMessageType.CAPTURE_SELECTION_COMPLETE;
    type CAPTURE_SELECTION_CANCEL = typeof import('./').CaptureMessageType.CAPTURE_SELECTION_CANCEL;
    type CAPTURE_PROGRESS = typeof import('./').CaptureMessageType.CAPTURE_PROGRESS;
    type CAPTURE_COMPLETE = typeof import('./').CaptureMessageType.CAPTURE_COMPLETE;
    type CAPTURE_ERROR = typeof import('./').CaptureMessageType.CAPTURE_ERROR;
  }
}

export {};
