// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { PageStylesSection } from '.';

const mocks = vi.hoisted(() => ({
  listRules: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  formatDateTime: (value: number) => `date:${value}`,
  translate: (key: string) => key,
}));

vi.mock('../../../composition/persistence/page-style/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/page-style/storage')>()),
  listPageStyleRestoreRules: mocks.listRules,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createRule(overrides: Partial<PageStyleRestoreRule> = {}): PageStyleRestoreRule {
  return {
    createdAt: 1_000,
    enabled: true,
    id: 'rule-1',
    name: 'Primary card',
    patch: { assets: [], declarations: [{ property: 'color', value: '#111111' }] },
    propertySummary: ['color'],
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      domain: 'example.com',
      exactAddress: 'https://example.com/orders',
    },
    selector: { locator: '.card-title' },
    updatedAt: 2_000,
    ...overrides,
  };
}

async function renderSection() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => root?.render(<PageStylesSection />));
  await act(async () => Promise.resolve());
}

function getSelectTrigger(label: string): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"][aria-haspopup="listbox"]`
  );
  if (!button) {
    throw new Error(`Missing select trigger: ${label}`);
  }

  return button;
}

async function chooseSelectOption(label: string, optionLabel: string) {
  await act(async () => {
    getSelectTrigger(label).click();
  });

  expect(container?.querySelector('[role="listbox"]')).not.toBeNull();

  const option = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  ).find((button) => button.textContent?.includes(optionLabel));
  if (!option) {
    throw new Error(`Missing option: ${optionLabel}`);
  }

  await act(async () => {
    option.click();
  });
}

function changeInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.listRules.mockResolvedValue([
    createRule(),
    createRule({
      enabled: false,
      id: 'rule-2',
      name: 'Admin header',
      propertySummary: ['background-image'],
      scope: {
        active: PAGE_STYLE_SCOPE_TYPES.DOMAIN,
        domain: 'admin.example.test',
        exactAddress: 'https://admin.example.test/home',
      },
    }),
  ]);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('PageStylesSection filters', () => {
  it('renders ProductSelect filters and filters by affected property', async () => {
    await renderSection();

    expect(container?.querySelectorAll('select')).toHaveLength(0);
    expect(container?.querySelectorAll('[data-ui="shared.ui.product-select"]')).toHaveLength(2);
    expect(getSelectTrigger('settings.pageStyles.propertyLabel').className).toContain(
      'sniptale-select'
    );

    await chooseSelectOption(
      'settings.pageStyles.propertyLabel',
      'settings.pageStyles.properties.color'
    );

    expect(container?.textContent).toContain('Primary card');
    expect(container?.textContent).not.toContain('Admin header');
  });

  it('filters by status through styled listbox controls', async () => {
    await renderSection();

    await chooseSelectOption('settings.pageStyles.statusLabel', 'settings.pageStyles.disabled');

    expect(container?.textContent).not.toContain('Primary card');
    expect(container?.textContent).toContain('Admin header');
  });

  it('filters by address and domain with app-styled search inputs', async () => {
    await renderSection();

    const addressInput = Array.from(
      container?.querySelectorAll<HTMLInputElement>('input') ?? []
    ).find((input) => input.placeholder === 'settings.pageStyles.addressPlaceholder');

    await act(async () => {
      if (!addressInput) {
        throw new Error('Missing address filter input');
      }
      changeInputValue(addressInput, 'admin.example.test');
    });

    expect(addressInput?.className).toContain('rounded-[12px]');
    expect(container?.textContent).not.toContain('Primary card');
    expect(container?.textContent).toContain('Admin header');
  });
});
