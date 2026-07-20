// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import { NativeStatusPanel } from './status-panel';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function renderPanel(status: NativeAppRuntimeStatus): void {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<NativeStatusPanel status={status} onAction={vi.fn()} />);
  });
}

it('normalizes generic native status errors into user-facing copy', () => {
  renderPanel(
    createStatus({
      error: {
        code: 'unknown',
        message: 'Native host exited with code 1.',
        recoverable: true,
      },
      warnings: [
        {
          code: 'unknown',
          field: 'nativeHostExitCode',
          message: 'Native host exited with code 1.',
        },
      ],
    })
  );

  expect(container?.textContent).toContain('Не удалось выполнить действие приложения Sniptale.');
  expect(container?.textContent).toContain('Приложение сообщило о предупреждении.');
  expect(container?.textContent).not.toContain('Native host exited with code 1.');
  expect(container?.textContent).not.toContain('nativeHostExitCode');
});

it('deduplicates translated native status warnings', () => {
  renderPanel(
    createStatus({
      warnings: [
        { code: 'permission-denied', field: 'camera', message: 'Camera denied' },
        { code: 'policy-denied', field: 'screen', message: 'Screen denied' },
      ],
    })
  );

  expect(
    container?.textContent?.match(/Некоторые возможности приложения сейчас недоступны/g)
  ).toHaveLength(1);
  expect(container?.textContent).not.toContain('Camera denied');
  expect(container?.textContent).not.toContain('Screen denied');
});

it('shows operation-level screenshot failures without changing connection status copy', () => {
  renderPanel(
    createStatus({
      lastOperationError: {
        error: {
          code: 'unsupported-capability',
          message: 'transfer-channel unsupported',
          recoverable: true,
        },
        occurredAtEpochMs: 1,
        operation: 'screenshot',
        operationId: 'screenshot-1',
        phase: 'transfer-channel',
      },
    })
  );

  expect(container?.textContent).toContain('Подключено');
  expect(container?.textContent).toContain('Снимок экрана не сохранён');
  expect(container?.textContent).not.toContain('transfer-channel unsupported');
  expect(container?.textContent).not.toContain('screenshot-1');
});

function createStatus(patch: Partial<NativeAppRuntimeStatus> = {}): NativeAppRuntimeStatus {
  return {
    appStatus: null,
    capabilities: null,
    connectionState: 'connected',
    controllerLease: null,
    effectiveSettings: null,
    error: null,
    hostName: 'com.sniptale.native_host',
    install: null,
    lastHeartbeatAt: null,
    lastOperationError: null,
    platform: null,
    settingsRevision: null,
    trayActions: null,
    warnings: [],
    ...patch,
  };
}
