import { describe, expect, it, vi } from 'vitest';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { CaptureRouteContext, RouteCaptureMessage } from './types';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

describe('capture-router.types', () => {
  it('keeps route message and context shapes assignable', () => {
    const visibleMessage: RouteCaptureMessage = {
      type: CaptureMessageType.CAPTURE_VISIBLE,
      actionType: 'download_default',
    };
    const saveMessage: RouteCaptureMessage = {
      type: MessageType.EXECUTE_SAVE,
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
      actionType: 'download_default',
    };
    const context: CaptureRouteContext = {
      message: {
        actionType: 'download_default',
      },
      resolvedTabId: 42,
      sendResponse: vi.fn(),
      viewportState: new Map(),
      screenshotModeState: new Map(),
      captureGuardState: { isCapturing: false },
      scenarioSessionService: createScenarioSessionServiceStub(),
    };

    expect(visibleMessage.type).toBe(CaptureMessageType.CAPTURE_VISIBLE);
    expect(saveMessage.type).toBe(MessageType.EXECUTE_SAVE);
    expect(context.resolvedTabId).toBe(42);
  });
});
