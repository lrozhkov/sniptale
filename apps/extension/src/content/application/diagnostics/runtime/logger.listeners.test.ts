// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  setupDiagnosticActionListeners,
  setupDiagnosticErrorListeners,
  teardownDiagnosticActionListeners,
  teardownDiagnosticErrorListeners,
} from './logger.listeners';

function createActionHandlers() {
  return {
    handleKeyAction: vi.fn(),
    handleScrollAction: vi.fn(),
    handleUserAction: vi.fn(),
  };
}

function createErrorHandlers() {
  return {
    handleUnhandledRejection: vi.fn(),
    handleWindowError: vi.fn(),
  };
}

describe('logger listener wiring', () => {
  it('registers and removes diagnostic error listeners with capture enabled', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const handlers = createErrorHandlers();

    setupDiagnosticErrorListeners(handlers);
    teardownDiagnosticErrorListeners(handlers);

    expect(addSpy).toHaveBeenNthCalledWith(1, 'error', handlers.handleWindowError, true);
    expect(addSpy).toHaveBeenNthCalledWith(
      2,
      'unhandledrejection',
      handlers.handleUnhandledRejection,
      true
    );
    expect(removeSpy).toHaveBeenNthCalledWith(1, 'error', handlers.handleWindowError, true);
    expect(removeSpy).toHaveBeenNthCalledWith(
      2,
      'unhandledrejection',
      handlers.handleUnhandledRejection,
      true
    );
  });

  it('registers and removes diagnostic action listeners with capture enabled', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const handlers = createActionHandlers();

    setupDiagnosticActionListeners(handlers);
    teardownDiagnosticActionListeners(handlers);

    expect(addSpy).toHaveBeenCalledWith('click', handlers.handleUserAction, true);
    expect(addSpy).toHaveBeenCalledWith('keydown', handlers.handleKeyAction, true);
    expect(addSpy).toHaveBeenCalledWith('scroll', handlers.handleScrollAction, true);
    expect(removeSpy).toHaveBeenCalledWith('click', handlers.handleUserAction, true);
    expect(removeSpy).toHaveBeenCalledWith('keydown', handlers.handleKeyAction, true);
    expect(removeSpy).toHaveBeenCalledWith('scroll', handlers.handleScrollAction, true);
  });
});
