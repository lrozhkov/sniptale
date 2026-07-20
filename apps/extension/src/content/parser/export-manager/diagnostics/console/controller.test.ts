// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createConsoleDiagnosticsCaptureController } from './controller';

function createConsoleTarget() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

it('captures console entries and restores original methods on dispose', () => {
  const consoleTarget = createConsoleTarget();
  const controller = createConsoleDiagnosticsCaptureController({
    consoleTarget,
    getNow: () => '2026-03-23T12:00:00.000Z',
    windowTarget: window,
  });

  controller.install();
  consoleTarget.log('hello', { value: 1 });

  expect(controller.getSnapshot().entries).toEqual([
    expect.objectContaining({
      data: { value: '***' },
      kind: 'console',
      level: 'log',
      message: 'hello {"value":"***"}',
      timestamp: '2026-03-23T12:00:00.000Z',
    }),
  ]);

  controller.dispose();
  consoleTarget.log('after dispose');

  expect(controller.getSnapshot().entries).toHaveLength(0);
});

it('installs window error capture only once for the same controller instance', () => {
  const addEventListener = vi.spyOn(window, 'addEventListener');
  const controller = createConsoleDiagnosticsCaptureController({
    consoleTarget: createConsoleTarget(),
    windowTarget: window,
  });

  controller.install();
  controller.install();

  expect(addEventListener).toHaveBeenCalledWith('error', expect.any(Function), true);
  expect(addEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function), true);
  expect(addEventListener).toHaveBeenCalledTimes(2);
});

it('captures window errors and unhandled rejections in the snapshot', () => {
  const controller = createConsoleDiagnosticsCaptureController({
    consoleTarget: createConsoleTarget(),
    getNow: () => '2026-03-23T13:00:00.000Z',
    windowTarget: window,
  });

  controller.install();
  window.dispatchEvent(
    new ErrorEvent('error', {
      filename: 'https://example.com/app.js',
      message: 'boom',
    })
  );
  const rejectionEvent = new Event('unhandledrejection');
  Object.defineProperty(rejectionEvent, 'reason', {
    value: new Error('nope'),
  });
  window.dispatchEvent(rejectionEvent);

  expect(controller.getSnapshot().entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'error',
        level: 'error',
        message: 'boom',
        timestamp: '2026-03-23T13:00:00.000Z',
      }),
      expect.objectContaining({
        kind: 'unhandledrejection',
        level: 'error',
        message: expect.stringContaining('Unhandled promise rejection:'),
        timestamp: '2026-03-23T13:00:00.000Z',
      }),
    ])
  );
});
