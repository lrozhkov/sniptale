// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendDiagnosticContentEvent = vi.fn();

vi.mock('./logger.helpers', async () => {
  const actual = await vi.importActual<typeof import('./logger.helpers')>('./logger.helpers');

  return {
    ...actual,
    sendDiagnosticContentEvent,
  };
});

describe('createDiagnosticLoggerController', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    sendDiagnosticContentEvent.mockReset();
  });

  it('captures enabled user actions and stops after disable', async () => {
    const { createDiagnosticLoggerController } = await import('./logger');
    const controller = createDiagnosticLoggerController();
    const button = document.createElement('button');
    button.textContent = 'Save';
    document.body.appendChild(button);

    controller.enable('rec-1');
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(sendDiagnosticContentEvent).toHaveBeenCalledTimes(1);
    expect(sendDiagnosticContentEvent.mock.calls[0]?.[0]).toMatchObject({
      event: {
        kind: 'action',
        level: 'log',
      },
      isEnabled: true,
      sessionRecordingId: 'rec-1',
    });

    controller.disable();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(sendDiagnosticContentEvent).toHaveBeenCalledTimes(1);
  });

  it('clears pending scroll throttles when disposed', async () => {
    vi.useFakeTimers();
    const { createDiagnosticLoggerController } = await import('./logger');
    const controller = createDiagnosticLoggerController();

    controller.enable('rec-2');
    document.dispatchEvent(new Event('scroll', { bubbles: true }));
    controller.dispose();
    vi.runAllTimers();

    expect(sendDiagnosticContentEvent).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
