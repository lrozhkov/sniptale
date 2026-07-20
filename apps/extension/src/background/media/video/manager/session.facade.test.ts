import { describe, expect, it } from 'vitest';

import { createLazyVideoManagerSessionFacade, createVideoManagerSession } from './session.facade';

describe('video-manager-session-facade', () => {
  it('proxies reads and writes through the owned session instance', () => {
    const session = createVideoManagerSession();
    const facade = createLazyVideoManagerSessionFacade(() => session);

    expect(facade.recordingTabId).toBeNull();
    expect(facade.isStarting).toBe(false);
    expect(facade.offscreenStartDispatched).toBe(false);
    expect(facade.openEditorAfterRecording).toBe(false);
    expect(facade.controlledCursorDisplaySurface).toBeNull();

    facade.recordingTabId = 17;
    facade.isStarting = true;
    facade.offscreenStartDispatched = true;
    facade.openEditorAfterRecording = true;
    facade.viewportNavigationEpoch = 3;
    facade.controlledCursorNavigationEpoch = 5;
    facade.controlledCursorDisplaySurface = 'browser';

    expect(session.recordingTabId).toBe(17);
    expect(session.isStarting).toBe(true);
    expect(session.offscreenStartDispatched).toBe(true);
    expect(session.openEditorAfterRecording).toBe(true);
    expect(session.viewportNavigationEpoch).toBe(3);
    expect(session.controlledCursorNavigationEpoch).toBe(5);
    expect(session.controlledCursorDisplaySurface).toBe('browser');
    expect(facade.viewportNavigationEpoch).toBe(3);
    expect(facade.controlledCursorNavigationEpoch).toBe(5);
    expect(facade.controlledCursorDisplaySurface).toBe('browser');
  });
});
