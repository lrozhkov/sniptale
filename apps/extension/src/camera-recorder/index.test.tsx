import { expect, it, vi } from 'vitest';

const { createRuntimeMessagingTransportMock, renderPageShellMock } = vi.hoisted(() => ({
  createRuntimeMessagingTransportMock: vi.fn(() => ({
    sendRuntimeMessage: vi.fn(),
    sendTabMessage: vi.fn(),
  })),
  renderPageShellMock: vi.fn(),
}));

vi.mock('../ui/page-bootstrap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui/page-bootstrap')>()),
  renderPageShell: renderPageShellMock,
}));
vi.mock('../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: createRuntimeMessagingTransportMock,
}));
vi.mock('@sniptale/ui/styles', () => ({}));
vi.mock('./shell/app', () => ({
  CameraRecorderApp: () => null,
}));

it('boots the camera recorder page with an injected runtime transport', async () => {
  await import('./index');

  expect(createRuntimeMessagingTransportMock).toHaveBeenCalledOnce();
  expect(renderPageShellMock).toHaveBeenCalledWith(
    expect.objectContaining({
      namespace: 'CameraRecorderEntrypoint',
      strictMode: true,
    })
  );
});
