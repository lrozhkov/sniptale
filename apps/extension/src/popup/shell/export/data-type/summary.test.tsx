// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => `t:${key}`,
}));

import { renderDataTypeSummaryItems, type DataTypeSummaryItem } from './summary';
import type { ExportOptionToggleProps } from './options/data';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createToggleProps(): ExportOptionToggleProps {
  return {
    disabled: false,
    includeBasicLogs: true,
    includeCssDiagnostics: true,
    includeFiles: true,
    includeFullPageScreenshot: true,
    includeHarDomLogs: true,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
    setIncludeBasicLogs: vi.fn(),
    setIncludeCssDiagnostics: vi.fn(),
    setIncludeFiles: vi.fn(),
    setIncludeFullPageScreenshot: vi.fn(),
    setIncludeHarDomLogs: vi.fn(),
    setIncludeImages: vi.fn(),
    setIncludeJson: vi.fn(),
    setIncludeMarkdown: vi.fn(),
  };
}

function createSummaryItem(key: DataTypeSummaryItem['key'], label: string): DataTypeSummaryItem {
  const Icon = (props: { className?: string }) => <svg className={props.className} />;

  return {
    accentClassName: 'text-[var(--sniptale-color-accent)]',
    icon: Icon,
    key,
    label,
  };
}

async function renderSummary(items: DataTypeSummaryItem[], toggleProps = createToggleProps()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(renderDataTypeSummaryItems(items, toggleProps));
  });

  return toggleProps;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('renderDataTypeSummaryItems', () => {
  it('renders the empty-state hint when nothing is selected', async () => {
    await renderSummary([]);

    expect(container?.textContent).toContain('t:popup.export.noSelectedDataTypes');
  });

  it('switches to a two-column summary and removes selected items inline', async () => {
    const toggleProps = await renderSummary([
      createSummaryItem('json', 'JSON'),
      createSummaryItem('markdown', 'Markdown'),
      createSummaryItem('files', 'Файлы'),
      createSummaryItem('images', 'Изображения'),
      createSummaryItem('basicLogs', 'Базовые логи'),
    ]);

    expect(
      container?.querySelector('[data-testid="export-data-type-summary"]')?.className
    ).toContain('grid-cols-2');

    await act(async () => {
      container?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(toggleProps.setIncludeJson).toHaveBeenCalledWith(false);
    expect(container?.querySelector('button')?.getAttribute('title')).toBe(
      't:popup.export.removeFromSelectionAction'
    );
  });
});
