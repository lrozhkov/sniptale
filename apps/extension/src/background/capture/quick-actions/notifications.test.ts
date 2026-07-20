import { beforeEach, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';

const { sendTabMessageMock, translateMock, runBestEffortMock } = vi.hoisted(() => ({
  sendTabMessageMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
  runBestEffortMock: vi.fn(),
}));

vi.mock('../../../platform/i18n/index', (_importOriginal) => ({
  translate: translateMock,
}));

vi.mock('../../../platform/runtime-messaging/index', (_importOriginal) => ({
  sendTabMessage: sendTabMessageMock,
}));

vi.mock('@sniptale/foundation/best-effort', (_importOriginal) => ({
  runBestEffort: runBestEffortMock,
}));

import { notifyDuplicateCapture, notifyQuickActionError } from './notifications';

beforeEach(() => {
  vi.clearAllMocks();
  sendTabMessageMock.mockReturnValue('sent');
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
  runBestEffortMock.mockImplementation((promise: unknown) => promise);
});

it('emits duplicate-capture toast requests', () => {
  notifyDuplicateCapture(12);

  expect(sendTabMessageMock).toHaveBeenCalledWith(12, {
    type: 'SHOW_TOAST',
    payload: {
      type: 'error',
      title: 'common.states.error',
      message: 'background.runtime.captureAlreadyRunning',
    },
  });
});

it('emits quick-action error toast requests', () => {
  notifyQuickActionError(12, new Error('boom'));

  expect(sendTabMessageMock).toHaveBeenCalledWith(12, {
    type: 'SHOW_TOAST',
    payload: {
      type: 'error',
      title: 'background.runtime.captureErrorTitle',
      message: 'boom',
    },
  });
});

it('uses the unknown-error translation for non-Error quick-action failures', () => {
  notifyQuickActionError(12, 'unexpected');

  expect(sendTabMessageMock).toHaveBeenCalledWith(12, {
    type: 'SHOW_TOAST',
    payload: {
      type: 'error',
      title: 'background.runtime.captureErrorTitle',
      message: 'content.runtime.unknownError',
    },
  });
});
