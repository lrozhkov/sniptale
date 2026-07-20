import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';

const { handlePageAccessMessageMock, respondAsyncRouteMock } = vi.hoisted(() => ({
  handlePageAccessMessageMock: vi.fn(),
  respondAsyncRouteMock: vi.fn(),
}));

vi.mock('../../routing-contracts/response', () => ({
  createRouteErrorResponse: vi.fn(),
  respondAsyncRoute: respondAsyncRouteMock,
  respondAsyncRouteEffect: vi.fn(),
  respondAsyncRouteWithLogger: vi.fn(),
  respondAsyncSuccess: vi.fn(),
}));

vi.mock('./service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./service')>()),
  clearPageAccessTabActivation: vi.fn(),
  handlePageAccessMessage: handlePageAccessMessageMock,
  unregisterRemovedPageAccessOrigins: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  handlePageAccessMessageMock.mockResolvedValue({ success: true });
});

it('ignores non-page-access runtime messages', async () => {
  const { routePageAccessMessage } = await import('./route');
  const sendResponse = vi.fn();

  expect(routePageAccessMessage(null, sendResponse)).toBe(false);
  expect(routePageAccessMessage({ type: MessageType.OPEN_EDITOR_WITH_IMAGE }, sendResponse)).toBe(
    false
  );
  expect(
    routePageAccessMessage(
      { operation: 'spoofed-operation', type: MessageType.PAGE_ACCESS },
      sendResponse
    )
  ).toBe(false);
  expect(
    routePageAccessMessage(
      { operation: PageAccessOperation.READ_STATUS, tabId: '1', type: MessageType.PAGE_ACCESS },
      sendResponse
    )
  ).toBe(false);

  expect(respondAsyncRouteMock).not.toHaveBeenCalled();
});

it('routes page-access messages through the async route responder', async () => {
  const { routePageAccessMessage } = await import('./route');
  const sendResponse = vi.fn();
  const message = {
    operation: PageAccessOperation.READ_STATUS,
    type: MessageType.PAGE_ACCESS,
  };

  expect(routePageAccessMessage(message, sendResponse)).toBe(true);

  expect(handlePageAccessMessageMock).toHaveBeenCalledWith(message);
  expect(respondAsyncRouteMock).toHaveBeenCalledWith(expect.any(Promise), sendResponse);
});
