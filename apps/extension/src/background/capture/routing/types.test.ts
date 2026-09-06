import { describe, expect, it, vi } from 'vitest';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { CaptureRouteContext, RouteCaptureMessage } from './types';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import { collectBackgroundIngressRouteTypes } from '../../../contracts/messaging/contracts/runtime';

const representativeCaptureRouteTypes = [
  'CAPTURE_VISIBLE',
  'CAPTURE_VISIBLE_FOR_CROP',
  'CAPTURE_FULL',
  'RENEW_SCREENSHOT_SURFACE_SESSION',
  'DOWNLOAD_BROWSER_ANNOTATIONS',
  'OPEN_EXPORT_MODAL',
  'TRIGGER_QUICK_ACTION',
  'PREPARE_DESKTOP_SCREENSHOT_CAPTURE',
  'TRIGGER_SCREENSHOT_CAPTURE',
  'EXECUTE_SAVE',
  'OPEN_EDITOR_WITH_IMAGE',
  'EXPORT_CAPTURE_FULL_PAGE',
  'SAVE_SCREENSHOT_TO_GALLERY',
  'REGISTER_WEB_SNAPSHOT_ASSETS',
  'FETCH_WEB_SNAPSHOT_ASSET',
  'STAGE_PAGE_PACKAGE_JOB_CHUNK',
  'WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED',
] as const satisfies readonly RouteCaptureMessage['type'][];

type MissingCaptureRouteType = Exclude<
  RouteCaptureMessage['type'],
  (typeof representativeCaptureRouteTypes)[number]
>;
const captureRouteTypesAreExhaustive: MissingCaptureRouteType extends never ? true : never = true;

describe('capture-router.types', () => {
  it('keeps route message and context shapes assignable', () => {
    const visibleMessage: RouteCaptureMessage = {
      type: CaptureMessageType.CAPTURE_VISIBLE,
      actionType: 'download_default',
    };
    const saveMessageWithoutAction: RouteCaptureMessage = {
      type: MessageType.EXECUTE_SAVE,
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
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
    expect(saveMessageWithoutAction.type).toBe(MessageType.EXECUTE_SAVE);
    expect(context.resolvedTabId).toBe(42);
  });

  it('keeps representative dispatcher coverage equal to canonical capture ingress', () => {
    expect(captureRouteTypesAreExhaustive).toBe(true);
    expect([...representativeCaptureRouteTypes].sort()).toEqual(
      [...collectBackgroundIngressRouteTypes({ handlerId: 'capture' })].sort()
    );
  });
});
