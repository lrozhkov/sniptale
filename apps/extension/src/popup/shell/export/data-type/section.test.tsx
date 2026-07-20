// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import { ExportDataTypeSection } from './section';

type SectionProps = ComponentProps<typeof ExportDataTypeSection>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(overrides: Partial<SectionProps> = {}): SectionProps {
  return {
    disabled: false,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: false,
    includeMarkdown: false,
    isExpanded: false,
    isOpen: true,
    onClose: vi.fn(),
    onOpen: vi.fn(),
    setIncludeBasicLogs: vi.fn(),
    setIncludeCssDiagnostics: vi.fn(),
    setIncludeFiles: vi.fn(),
    setIncludeFullPageScreenshot: vi.fn(),
    setIncludeHarDomLogs: vi.fn(),
    setIncludeImages: vi.fn(),
    setIncludeJson: vi.fn(),
    setIncludeMarkdown: vi.fn(),
    ...overrides,
  };
}

async function renderSection(overrides: Partial<SectionProps> = {}) {
  const props = createProps(overrides);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<ExportDataTypeSection {...props} />);
  });

  return props;
}

function findButton(text: string): HTMLButtonElement {
  const button = Array.from(container?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent === text
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${text}`);
  }
  return button;
}

async function setFilter(value: string) {
  const input = container?.querySelector('input[type="text"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders selected summary items and opens the drawer', async () => {
  const props = await renderSection({ includeJson: true, isExpanded: true, isOpen: false });

  expect(container?.textContent).toContain('t:popup.export.includeJsonLabel');
  expect(container?.querySelector('section')?.className).toContain('flex-1');

  await act(async () => findButton('t:popup.export.editButton').click());

  expect(props.onOpen).toHaveBeenCalledOnce();
});

it('selects only visible inactive options and renders the empty filter state', async () => {
  const setIncludeJson = vi.fn<SectionProps['setIncludeJson']>();
  const props = await renderSection({ setIncludeJson });

  await setFilter('json');
  expect(container?.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);

  const visibleCheckbox = container?.querySelector('input[type="checkbox"]');
  if (!(visibleCheckbox instanceof HTMLInputElement)) {
    throw new Error('Missing visible data type checkbox');
  }
  await act(async () => {
    visibleCheckbox.click();
  });
  expect(setIncludeJson).toHaveBeenCalledWith(expect.any(Function));
  setIncludeJson.mockClear();

  await act(async () => findButton('t:popup.export.selectAllTabsButton').click());
  expect(setIncludeJson).toHaveBeenCalledWith(true);
  expect(props.setIncludeMarkdown).not.toHaveBeenCalled();

  await setFilter('not-a-data-type');
  expect(container?.textContent).toContain('t:popup.export.noSelectedDataTypes');
});

it('clears selected options and forwards row toggles in disabled presentation', async () => {
  const setIncludeJson = vi.fn<SectionProps['setIncludeJson']>();
  const props = await renderSection({
    disabled: true,
    includeBasicLogs: true,
    includeCssDiagnostics: true,
    includeFiles: true,
    includeFullPageScreenshot: true,
    includeHarDomLogs: true,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
    setIncludeJson,
  });

  const checkboxes = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []
  );
  expect(checkboxes.every((checkbox) => checkbox.disabled)).toBe(true);

  await act(async () => findButton('t:popup.export.clearAllTabsButton').click());
  expect(setIncludeJson).toHaveBeenCalledWith(false);
  expect(props.setIncludeFullPageScreenshot).toHaveBeenCalledWith(false);

  setIncludeJson.mockClear();
  checkboxes[0]?.dispatchEvent(new Event('change', { bubbles: true }));
  expect(setIncludeJson).not.toHaveBeenCalled();
});
