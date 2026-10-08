// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMaintenanceLogEntry } from '../../../../composition/persistence/library-lifecycle/maintenance-log-model';
import { translate } from '../../../../platform/i18n';
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  subscribe: vi.fn(),
  download: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('../../../../composition/persistence/diagnostics/runtime-log', () => ({
  createRuntimeLog: () => ({ read: async () => [], subscribe: () => () => undefined }),
}));
vi.mock('../../../../composition/persistence/library-lifecycle/maintenance-log', () => ({
  createMaintenanceLog: () => ({ read: mocks.read, subscribe: mocks.subscribe }),
}));

import { EventsLogsSection } from './index';
let container: HTMLDivElement;
let root: Root;
let changed: () => void;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:log');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => mocks.download());
  mocks.read.mockResolvedValue([
    createMaintenanceLogEntry(
      { operation: 'trash', code: 'expired', counts: { deleted: 2 } },
      1000
    ),
    createMaintenanceLogEntry(
      { operation: 'physical-delete', code: 'invalid', counts: { retained: 3 } },
      2000
    ),
  ]);
  mocks.subscribe.mockImplementation((listener) => {
    changed = listener;
    return mocks.unsubscribe;
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function button(label: string) {
  return Array.from(container.querySelectorAll('button')).find(
    (node) => node.textContent === label
  )!;
}
async function open() {
  await act(async () => {
    root.render(<EventsLogsSection />);
  });
}
it('loads on mount, filters messages and exports JSONL; unsubscribes on unmount', async () => {
  await open();
  expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  const input = container.querySelector('input')!;
  expect(document.activeElement).toBe(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'invalid'
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  act(() => button(translate('settings.eventsLogs.export')).click());
  expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  expect(mocks.download).toHaveBeenCalledOnce();
  act(() => root.render(null));
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it('shows storage failure and recovers on refresh without polling', async () => {
  mocks.read.mockRejectedValueOnce(new Error('storage unavailable'));
  await open();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    translate('settings.eventsLogs.unavailable')
  );
  await act(async () => button(translate('settings.eventsLogs.refresh')).click());
  expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  mocks.read.mockResolvedValue([]);
  await act(async () => changed());
  expect(container.textContent).toContain(translate('settings.eventsLogs.empty'));
  expect(button(translate('settings.eventsLogs.export')).disabled).toBe(true);
});

async function choose(label: string, value: string) {
  await act(async () =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()
  );
  const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
    (node) => node.textContent === value
  )!;
  await act(async () => option.click());
}
it('combines status, operation and period filters and surfaces export failure', async () => {
  mocks.read.mockResolvedValue([
    createMaintenanceLogEntry({ operation: 'trash', code: 'expired' }, Date.now()),
    createMaintenanceLogEntry({ operation: 'physical-delete', code: 'invalid' }, 1000),
  ]);
  await open();
  await choose(
    translate('settings.eventsLogs.status'),
    translate('settings.eventsLogs.statuses.completed')
  );
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  mocks.download.mockImplementationOnce(() => {
    throw new Error('download unavailable');
  });
  act(() => button(translate('settings.eventsLogs.export')).click());
  expect(container.textContent).toContain(translate('settings.eventsLogs.exportFailed'));
  await choose(
    translate('settings.eventsLogs.operation'),
    translate('settings.eventsLogs.operations.physical-delete')
  );
  expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
  await choose(translate('settings.eventsLogs.operation'), translate('settings.eventsLogs.all'));
  await choose(translate('settings.eventsLogs.status'), translate('settings.eventsLogs.all'));
  await choose(translate('settings.eventsLogs.period'), translate('settings.eventsLogs.day'));
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  await choose(translate('settings.eventsLogs.period'), translate('settings.eventsLogs.week'));
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
});
