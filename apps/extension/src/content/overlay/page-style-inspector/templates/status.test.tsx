// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { PageStyleTemplate } from '@sniptale/runtime-contracts/page-style';
import { TemplateStatusBanner, useTemplateActionRunner } from './status';

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof useTemplateActionRunner> | null = null;

const template: PageStyleTemplate = {
  createdAt: 1,
  id: 'template-1',
  name: 'Template',
  patch: { assets: [], declarations: [] },
  propertySummary: [],
  updatedAt: 1,
};

function Harness() {
  latest = useTemplateActionRunner();
  return <TemplateStatusBanner status={latest.status} />;
}

function renderHarness() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(<Harness />);
  });
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  latest = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it('surfaces template action success and failure status', async () => {
  renderHarness();

  await act(async () => {
    await latest?.run({
      action: vi.fn(async () => undefined),
      kind: 'update',
      template,
    });
  });
  expect(document.body.textContent).toContain('Шаблон обновлен');

  await act(async () => {
    await latest?.run({
      action: vi.fn(async () => {
        throw new Error('storage failed');
      }),
      kind: 'delete',
      template,
    });
  });
  expect(document.body.textContent).toContain('Не удалось выполнить действие с шаблоном');
});

it('keeps pending visible and prevents stale action results from overwriting newer status', async () => {
  renderHarness();
  const firstAction = createDeferred();
  const secondAction = createDeferred();
  let firstRun: Promise<void> | undefined;
  let secondRun: Promise<void> | undefined;

  await act(async () => {
    firstRun = latest?.run({
      action: vi.fn(() => firstAction.promise),
      kind: 'apply',
      template,
    });
    await Promise.resolve();
  });
  expect(document.body.textContent).toContain('Обновление шаблона...');

  await act(async () => {
    secondRun = latest?.run({
      action: vi.fn(() => secondAction.promise),
      kind: 'update',
      template,
    });
    await Promise.resolve();
  });
  await act(async () => {
    secondAction.resolve();
    await secondRun;
  });
  expect(document.body.textContent).toContain('Шаблон обновлен');

  await act(async () => {
    firstAction.resolve();
    await firstRun;
  });
  expect(document.body.textContent).toContain('Шаблон обновлен');
  expect(document.body.textContent).not.toContain('Шаблон применен');
});

it('renders cleanup warnings returned by a completed action', async () => {
  renderHarness();

  await act(async () => {
    await latest?.run({
      action: vi.fn(async () => ({
        message: 'cleanup warning',
        state: 'warning' as const,
      })),
      kind: 'delete',
      template,
    });
  });

  expect(document.body.textContent).toContain('cleanup warning');
});
