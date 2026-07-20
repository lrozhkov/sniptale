import type { DiagnosticActionHandlers } from './logger.actions';
import type { DiagnosticErrorHandlers } from './logger.errors';

export function setupDiagnosticErrorListeners(handlers: DiagnosticErrorHandlers): void {
  window.addEventListener('error', handlers.handleWindowError, true);
  window.addEventListener('unhandledrejection', handlers.handleUnhandledRejection, true);
}

export function teardownDiagnosticErrorListeners(handlers: DiagnosticErrorHandlers): void {
  window.removeEventListener('error', handlers.handleWindowError, true);
  window.removeEventListener('unhandledrejection', handlers.handleUnhandledRejection, true);
}

export function setupDiagnosticActionListeners(handlers: DiagnosticActionHandlers): void {
  document.addEventListener('click', handlers.handleUserAction, true);
  document.addEventListener('input', handlers.handleUserAction, true);
  document.addEventListener('change', handlers.handleUserAction, true);
  document.addEventListener('keydown', handlers.handleKeyAction, true);
  document.addEventListener('scroll', handlers.handleScrollAction, true);
}

export function teardownDiagnosticActionListeners(handlers: DiagnosticActionHandlers): void {
  document.removeEventListener('click', handlers.handleUserAction, true);
  document.removeEventListener('input', handlers.handleUserAction, true);
  document.removeEventListener('change', handlers.handleUserAction, true);
  document.removeEventListener('keydown', handlers.handleKeyAction, true);
  document.removeEventListener('scroll', handlers.handleScrollAction, true);
}
