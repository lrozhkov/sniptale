// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
  translate: (key: string) => `t:${key}`,
}));

import { ExportDataTypeSection } from './section';

type SectionProps = ComponentProps<typeof ExportDataTypeSection>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(overrides: Partial<SectionProps> = {}): SectionProps {
  return {
    destination: 'export',
    disabled: false,
    includeAnnotations: false,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includePageDiagnostics: false,
    includeImages: false,
    includeJson: false,
    includeMarkdown: false,
    includeWebCopy: false,
    isExpanded: false,
    isOpen: true,
    onClose: vi.fn(),
    onOpen: vi.fn(),
    packagePreferences: {
      actions: {
        setIncludeAnnotations: vi.fn(),
        setIncludeBasicLogs: vi.fn(),
        setIncludeCssDiagnostics: vi.fn(),
        setIncludeFiles: vi.fn(),
        setIncludeFullPageScreenshot: vi.fn(),
        setIncludePageDiagnostics: vi.fn(),
        setIncludeImages: vi.fn(),
        setIncludeJson: vi.fn(),
        setIncludeMarkdown: vi.fn(),
      },
      includeWebCopy: false,
      setIncludeWebCopy: vi.fn(),
      values: {
        includeAnnotations: false,
        includeBasicLogs: false,
        includeCssDiagnostics: false,
        includeFiles: false,
        includeFullPageScreenshot: false,
        includePageDiagnostics: false,
        includeImages: false,
        includeJson: false,
        includeMarkdown: false,
      },
    },
    setIncludeBasicLogs: vi.fn(),
    setIncludeAnnotations: vi.fn(),
    setIncludeCssDiagnostics: vi.fn(),
    setIncludeFiles: vi.fn(),
    setIncludeFullPageScreenshot: vi.fn(),
    setIncludePageDiagnostics: vi.fn(),
    setIncludeImages: vi.fn(),
    setIncludeJson: vi.fn(),
    setIncludeMarkdown: vi.fn(),
    setIncludeWebCopy: vi.fn(),
    webCopyResources: {
      anonymousCrossOriginAssetsEnabled: true,
      authenticatedSameOriginAssetsEnabled: true,
      externalAssetRedirectsEnabled: true,
      externalLinksEnabled: false,
      error: null,
      pending: null,
      setAnonymousCrossOriginAssetsEnabled: vi.fn(),
      setAuthenticatedSameOriginAssetsEnabled: vi.fn(),
      setExternalAssetRedirectsEnabled: vi.fn(),
      setExternalLinksEnabled: vi.fn(),
    },
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

  const trigger = container?.querySelector<HTMLButtonElement>(
    '[data-ui="popup.export.selection-trigger"]'
  );
  await act(async () => trigger?.click());

  expect(props.onOpen).toHaveBeenCalledOnce();
});

it('opens capture behavior settings from the Package contents row', async () => {
  const onOpenSettings = vi.fn();
  await renderSection({ isOpen: false, onOpenSettings });

  const settingsButton = container?.querySelector<HTMLButtonElement>(
    '[aria-label="t:popup.export.packageCaptureSettingsTitle"]'
  );
  await act(async () => settingsButton?.click());

  expect(onOpenSettings).toHaveBeenCalledOnce();
});

it('renders the capture behavior controls in the settings curtain', async () => {
  await renderSection({
    isOpen: true,
    isSettingsOpen: true,
    captureBehavior: {
      floatingElements: 'once',
      freezeMotion: true,
      preloadLazyContent: true,
    },
  });

  expect(container?.textContent).toContain('t:popup.export.packageCaptureSettingsTitle');
  expect(container?.textContent).toContain('t:popup.export.captureLazyContentLabel');
  expect(container?.textContent).toContain('t:popup.export.captureFloatingElementsLabel');
});

it('lets the full collapsed summary claim its intrinsic height', async () => {
  await renderSection({
    includeAnnotations: true,
    includeBasicLogs: true,
    includeCssDiagnostics: true,
    includeFiles: true,
    includeFullPageScreenshot: true,
    includeViewportScreenshot: true,
    includePageDiagnostics: true,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
    isOpen: false,
  });

  const trigger = container?.querySelector<HTMLButtonElement>(
    '[data-ui="popup.export.selection-trigger"]'
  );
  const summaryBody = document.getElementById(trigger?.getAttribute('aria-controls') ?? '');
  const summary = summaryBody?.querySelector('[data-testid="export-data-type-summary"]');

  expect(summary?.children).toHaveLength(10);
  expect(summary?.className).toContain('grid-cols-2');
  expect(Math.ceil((summary?.children.length ?? 0) / 2)).toBe(5);
  expect(summaryBody?.className).not.toContain('max-h-[');
});

it('does not expose removal for the full-page screenshot required by Web Copy', async () => {
  await renderSection({
    includeFullPageScreenshot: true,
    includeWebCopy: true,
    isOpen: false,
  });

  expect(
    container?.querySelector(
      '[aria-label="t:popup.export.removeFromSelectionAction: t:popup.export.includeFullPageScreenshotLabel"]'
    )
  ).toBeNull();
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

it('places compact quick choices beside the filter and applies them to the full plan', async () => {
  const setIncludeWebCopy = vi.fn();
  const setIncludeFullPageScreenshot = vi.fn();
  const props = await renderSection({
    destination: 'save',
    setIncludeFullPageScreenshot,
    packagePreferences: {
      ...createProps().packagePreferences,
      includeWebCopy: true,
      setIncludeWebCopy,
    },
  });

  await setFilter('json');
  const quickSelection = container?.querySelector('[data-ui="popup.export.quick-selection"]');
  expect(quickSelection?.contains(container?.querySelector('input[type="text"]') ?? null)).toBe(
    true
  );
  expect(quickSelection?.textContent).not.toContain('t:popup.export.packagePresetLabel');
  expect(quickSelection?.textContent).not.toContain('t:popup.export.packagePresetFull');
  expect(quickSelection?.querySelectorAll('button')).toHaveLength(3);

  await act(async () => findButton('t:popup.export.packagePresetMaterials').click());
  expect(setIncludeWebCopy).not.toHaveBeenCalled();
  expect(setIncludeFullPageScreenshot).toHaveBeenCalledWith(true);
  expect(props.setIncludeFiles).toHaveBeenCalledWith(true);
  expect(props.setIncludeImages).toHaveBeenCalledWith(true);
  expect(props.setIncludeBasicLogs).not.toHaveBeenCalled();
});

it('clears optional Library contents without disabling the mandatory Web copy', async () => {
  const setIncludeWebCopy = vi.fn();
  const setIncludeFullPageScreenshot = vi.fn();
  const props = await renderSection({
    destination: 'save',
    includeAnnotations: true,
    includeBasicLogs: true,
    includeCssDiagnostics: true,
    includeFiles: true,
    includeFullPageScreenshot: true,
    includeViewportScreenshot: true,
    includePageDiagnostics: true,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
    packagePreferences: {
      ...createProps().packagePreferences,
      includeWebCopy: true,
      setIncludeWebCopy,
    },
    setIncludeFullPageScreenshot,
  });

  await act(async () => findButton('t:popup.export.clearAllTabsButton').click());

  expect(setIncludeWebCopy).not.toHaveBeenCalled();
  expect(setIncludeFullPageScreenshot).not.toHaveBeenCalled();
  expect(props.setIncludeJson).toHaveBeenCalledWith(false);
  expect(props.setIncludeFiles).toHaveBeenCalledWith(false);
  expect(props.setIncludeBasicLogs).toHaveBeenCalledWith(false);
});

it('clears selected options and forwards row toggles in disabled presentation', async () => {
  const setIncludeJson = vi.fn<SectionProps['setIncludeJson']>();
  const props = await renderSection({
    disabled: true,
    includeAnnotations: true,
    includeBasicLogs: true,
    includeCssDiagnostics: true,
    includeFiles: true,
    includeFullPageScreenshot: true,
    includeViewportScreenshot: true,
    includePageDiagnostics: true,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
    packagePreferences: {
      ...createProps().packagePreferences,
      includeWebCopy: true,
    },
    setIncludeJson,
  });

  const checkboxes = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []
  );
  expect(checkboxes.every((checkbox) => checkbox.disabled)).toBe(true);

  await act(async () => findButton('t:popup.export.clearAllTabsButton').click());
  expect(setIncludeJson).toHaveBeenCalledWith(false);
  expect(props.setIncludeFullPageScreenshot).not.toHaveBeenCalled();

  setIncludeJson.mockClear();
  checkboxes[0]?.dispatchEvent(new Event('change', { bubbles: true }));
  expect(setIncludeJson).not.toHaveBeenCalled();
});

it('locks Web copy and screenshot without adding visual labels while keeping diagnostics selectable', async () => {
  await renderSection({
    destination: 'save',
    includeFullPageScreenshot: true,
    packagePreferences: {
      ...createProps().packagePreferences,
      includeWebCopy: true,
      values: {
        ...createProps().packagePreferences.values,
        includeFullPageScreenshot: true,
      },
    },
  });

  expect(container?.textContent).toContain('t:popup.export.packageWebCopyDescription');
  expect(container?.textContent).toContain('t:popup.export.includeFullPageScreenshotLabel');
  expect(container?.textContent).toContain('t:popup.export.includePageDiagnosticsLabel');
  const requiredRows = Array.from(container?.querySelectorAll('label') ?? []).filter((label) =>
    ['t:popup.export.packageWebCopyLabel', 't:popup.export.includeFullPageScreenshotLabel'].some(
      (text) => label.textContent?.includes(text)
    )
  );
  expect(requiredRows).toHaveLength(2);
  expect(container?.textContent).not.toContain('t:popup.export.packageWebCopyRequired');
  expect(
    requiredRows.every(
      (row) => row.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled
    )
  ).toBe(true);
});

it('renders Web Copy inside the data grid and nests resource controls only while selected', async () => {
  const setIncludeWebCopy = vi.fn();
  const resources = createProps().webCopyResources;
  await renderSection({
    packagePreferences: {
      ...createProps().packagePreferences,
      includeWebCopy: true,
      setIncludeWebCopy,
    },
    webCopyResources: resources,
  });

  expect(container?.querySelector('[data-ui="popup.export.package-presets"]')).toBeNull();
  expect(container?.querySelector('[data-ui="popup.export.web-copy-card"]')).toBeNull();
  expect(container?.textContent).toContain('t:popup.export.packageWebCopyLabel');
  expect(container?.textContent).toContain('t:popup.export.webCopyCurrentSiteLabel');
  expect(container?.textContent).toContain('t:popup.export.webCopyExternalSitesLabel');
  expect(container?.textContent).toContain('t:popup.export.webCopyExternalRedirectsLabel');
  expect(container?.textContent).toContain('t:popup.export.webCopyExternalLinksLabel');
  const currentSiteControl = Array.from(container?.querySelectorAll('label') ?? []).find((label) =>
    label.textContent?.includes('t:popup.export.webCopyCurrentSiteLabel')
  );
  expect(currentSiteControl?.parentElement?.className).not.toContain('border-l');

  await act(async () => {
    const webCopyCheckbox = Array.from(
      container?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []
    ).find((checkbox) => checkbox.parentElement?.textContent?.includes('packageWebCopyLabel'));
    webCopyCheckbox?.click();
  });
  expect(setIncludeWebCopy).toHaveBeenCalledWith(expect.any(Function));
});

it('keeps redirect capture subordinate to external resource capture', async () => {
  const resources = createProps().webCopyResources;
  await renderSection({
    packagePreferences: {
      ...createProps().packagePreferences,
      includeWebCopy: true,
    },
    webCopyResources: {
      ...resources,
      anonymousCrossOriginAssetsEnabled: false,
      externalAssetRedirectsEnabled: true,
    },
  });

  const redirectRow = Array.from(container?.querySelectorAll('label') ?? []).find((label) =>
    label.textContent?.includes('t:popup.export.webCopyExternalRedirectsLabel')
  );
  expect(redirectRow?.querySelector<HTMLInputElement>('input')?.checked).toBe(true);
  expect(redirectRow?.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
});

it('does not add a separate private-data warning marker to the compact summary', async () => {
  await renderSection({ includePageDiagnostics: true, isOpen: false });

  expect(container?.textContent).not.toContain('t:popup.export.includePageDiagnosticsDisclosure');
  expect(container?.querySelector('[role="status"]')).toBeNull();
});
