import {
  activateRecorder,
  beginRecordingSession,
  beginStopRequest,
  clearStopRequest,
  createContextFieldDescriptor,
  createLifecycleFieldDescriptor,
  createOffscreenRecordingContextState,
  hasActiveRecordingSession,
  OFFSCREEN_RECORDING_CONTEXT_FIELDS,
  type OffscreenRecordingContextFacade,
  resetRecordingSession,
} from './state';

function createOffscreenRecordingContextFacade(): OffscreenRecordingContextFacade {
  const state = createOffscreenRecordingContextState();
  const facade = {} as OffscreenRecordingContextFacade;

  for (const field of OFFSCREEN_RECORDING_CONTEXT_FIELDS) {
    Object.defineProperty(facade, field, createContextFieldDescriptor(state, field));
  }
  Object.defineProperty(facade, 'lifecycleState', createLifecycleFieldDescriptor(state));
  facade.beginRecordingSession = (recordingId) => beginRecordingSession(state, recordingId);
  facade.activateRecorder = (mediaRecorder) => activateRecorder(state, mediaRecorder);
  facade.beginStopRequest = (handlers) => beginStopRequest(state, handlers);
  facade.clearStopRequest = () => clearStopRequest(state);
  facade.hasActiveRecordingSession = () => hasActiveRecordingSession(state);
  facade.resetRecordingSession = () => resetRecordingSession(state);

  return facade;
}

let defaultOffscreenRecordingSession: OffscreenRecordingContextFacade | null = null;

function getDefaultOffscreenRecordingSession(): OffscreenRecordingContextFacade {
  defaultOffscreenRecordingSession ??= createOffscreenRecordingContextFacade();
  return defaultOffscreenRecordingSession;
}

function defineLazyField(
  facade: OffscreenRecordingContextFacade,
  field: (typeof OFFSCREEN_RECORDING_CONTEXT_FIELDS)[number]
): void {
  Object.defineProperty(facade, field, {
    enumerable: true,
    configurable: false,
    get() {
      return getDefaultOffscreenRecordingSession()[field];
    },
    set(value: OffscreenRecordingContextFacade[typeof field]) {
      setOffscreenRecordingContextField(getDefaultOffscreenRecordingSession(), field, value);
    },
  });
}

function setOffscreenRecordingContextField<
  Key extends (typeof OFFSCREEN_RECORDING_CONTEXT_FIELDS)[number],
>(
  session: OffscreenRecordingContextFacade,
  field: Key,
  value: OffscreenRecordingContextFacade[Key]
): void {
  session[field] = value;
}

function createLazyOffscreenRecordingContextFacade(): OffscreenRecordingContextFacade {
  const facade = {} as OffscreenRecordingContextFacade;

  for (const field of OFFSCREEN_RECORDING_CONTEXT_FIELDS) {
    defineLazyField(facade, field);
  }

  Object.defineProperty(facade, 'lifecycleState', {
    enumerable: true,
    configurable: false,
    get() {
      return getDefaultOffscreenRecordingSession().lifecycleState;
    },
  });

  facade.beginRecordingSession = (recordingId) =>
    getDefaultOffscreenRecordingSession().beginRecordingSession(recordingId);
  facade.activateRecorder = (mediaRecorder) =>
    getDefaultOffscreenRecordingSession().activateRecorder(mediaRecorder);
  facade.beginStopRequest = (handlers) =>
    getDefaultOffscreenRecordingSession().beginStopRequest(handlers);
  facade.clearStopRequest = () => getDefaultOffscreenRecordingSession().clearStopRequest();
  facade.hasActiveRecordingSession = () =>
    getDefaultOffscreenRecordingSession().hasActiveRecordingSession();
  facade.resetRecordingSession = () =>
    getDefaultOffscreenRecordingSession().resetRecordingSession();

  return facade;
}

export const recordingContext = createLazyOffscreenRecordingContextFacade();
