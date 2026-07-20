// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Check } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const browserStorageMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

const loggerErrorMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock(
  '../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      local: browserStorageMocks,
    },
  })
);

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
  },
}));

import { DisclosureButton, usePersistentDisclosureState } from './disclosure-shared';
import {
  actionMetaClassName,
  getActionButtonClassName,
  getActionIconClassName,
  resolveActionFeedbackBadge,
} from './helpers';
import type { EditorDocumentActionCommand } from './model/types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof usePersistentDisclosureState> | null = null;

function renderHarness(storageKey = 'disclosure-key') {
  function Harness() {
    latestState = usePersistentDisclosureState(storageKey);
    return null;
  }

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  browserStorageMocks.get.mockResolvedValue({});
  browserStorageMocks.set.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

it('falls back to the closed state when disclosure preference loading fails', async () => {
  browserStorageMocks.get.mockRejectedValueOnce(new Error('read failed'));

  renderHarness();
  await flushEffects();

  expect(latestState?.isOpen).toBe(false);
  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to load disclosure preference',
    expect.any(Error),
    { storageKey: 'disclosure-key' }
  );
});

it('keeps the disclosure interactive and surfaces save failures', async () => {
  browserStorageMocks.set.mockRejectedValueOnce(new Error('write failed'));

  renderHarness();
  await flushEffects();

  act(() => {
    latestState?.toggle();
  });
  await flushEffects();

  expect(latestState?.isOpen).toBe(true);
  expect(toastErrorMock).toHaveBeenCalledWith('common.states.error');
});

it('renders the disclosure trigger as a transparent row until hover or focus', () => {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <DisclosureButton
        title="Save"
        summary="Default"
        isOpen={false}
        onToggle={vi.fn()}
        icon={<span aria-hidden="true" />}
      />
    );
  });

  const button = container.querySelector('button');
  expect(button?.className).toContain('bg-transparent');
  expect(button?.className).toContain('hover:bg-');
  expect(button?.className).not.toContain('surface-input');
  const summary = Array.from(container.querySelectorAll('span'))
    .reverse()
    .find((span) => span.textContent === 'Default');
  expect(summary?.className).toContain('text-[12px] font-bold uppercase');
  expect(summary?.className).not.toContain('tracking-');
});

it('keeps document action metadata aligned with compact label typography', () => {
  expect(actionMetaClassName).toContain('font-semibold uppercase');
  expect(actionMetaClassName).not.toContain('tracking-');
});

it('resolves compact document action emphasis and feedback badges', () => {
  const action = (emphasis: EditorDocumentActionCommand['emphasis'], id = 'save-image') =>
    ({
      emphasis,
      icon: Check,
      id,
      kind: 'command',
      label: id,
      onClick: vi.fn(),
    }) as unknown as EditorDocumentActionCommand;

  expect(getActionButtonClassName(action('primary'))).toContain('bg-transparent');
  expect(getActionButtonClassName(action('secondary'))).toContain('bg-transparent');
  expect(getActionButtonClassName(action('neutral'))).toContain('bg-transparent');
  expect(getActionButtonClassName(action('danger'))).toContain('danger');
  expect(getActionButtonClassName(action('tertiary'))).toContain('text-[12px]');
  expect(getActionIconClassName(action('primary'))).toContain('accent-emphasis');
  expect(getActionIconClassName(action('danger'))).toContain('danger');
  expect(getActionIconClassName(action('neutral'))).toContain('text-secondary');
  expect(resolveActionFeedbackBadge(action('primary'), 'saving')).not.toBeNull();
  expect(resolveActionFeedbackBadge(action('primary'), 'saved')).not.toBeNull();
  expect(resolveActionFeedbackBadge(action('primary'), 'idle')).toBeNull();
  expect(resolveActionFeedbackBadge(action('primary', 'open-image'), 'saved')).toBeNull();
});
