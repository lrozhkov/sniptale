// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExportProgressSectionView } from './view';
import type { ExportProgressSectionProps } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(
  overrides: Partial<ExportProgressSectionProps> = {}
): ExportProgressSectionProps {
  return {
    isExporting: true,
    onCancel: vi.fn(),
    progress: {
      phase: 'downloading',
      message: 'Собираем файлы',
      current: 2,
      total: 5,
      errors: ['Первое предупреждение', 'Второе предупреждение'],
    },
    progressSteps: [
      { key: 'json', label: 'JSON', status: 'done', statusLabel: 'Готово' },
      { key: 'markdown', label: 'Markdown', status: 'done', statusLabel: 'Готово' },
      { key: 'files', label: 'Файлы', status: 'active', statusLabel: 'В процессе' },
    ],
    result: null,
    ...overrides,
  };
}

async function renderSection(props: ReturnType<typeof createProps>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ExportProgressSectionView {...props} />);
  });
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

async function verifyActiveProgressState() {
  const props = createProps();

  await renderSection(props);

  expect(container?.textContent).toContain('Собираем материалы');
  expect(container?.textContent).toContain('JSON');
  expect(container?.textContent).toContain('Файлы');
  expect(container?.textContent).toContain('В процессе');
  expect(container?.textContent).toContain('Первое предупреждение');
  expect(container?.textContent).not.toContain('Остановить сбор');
  expect(container?.querySelector('button')).toBeNull();
  expect(props.onCancel).not.toHaveBeenCalled();
}

async function verifyLocalizedProgressDescription() {
  await renderSection(
    createProps({
      progress: {
        phase: 'scanning',
        message: 'Capturing full-page screenshot...',
        current: 2,
        total: 5,
        errors: [],
      },
      progressSteps: [
        { key: 'json', label: 'JSON', status: 'done', statusLabel: 'Готово' },
        { key: 'markdown', label: 'Markdown', status: 'done', statusLabel: 'Готово' },
        {
          key: 'fullPageScreenshot',
          label: 'Скриншот',
          status: 'active',
          statusLabel: 'В процессе',
        },
      ],
    })
  );

  expect(container?.textContent).not.toContain('Capturing full-page screenshot...');
  expect(container?.textContent).toContain('Скриншот');
}

async function verifyCompletedState() {
  await renderSection(
    createProps({
      isExporting: false,
      progress: {
        phase: 'done',
        message: 'Экспорт завершён',
        current: 5,
        total: 5,
        errors: [],
      },
      progressSteps: [
        { key: 'json', label: 'JSON', status: 'done', statusLabel: 'Готово' },
        { key: 'files', label: 'Файлы', status: 'done', statusLabel: 'Готово' },
      ],
      result: {
        success: true,
        filename: 'export.zip',
        errors: [],
        stats: {
          sectionsCount: 1,
          rowsCount: 2,
          filesCount: 3,
          filesFailed: 0,
        },
      },
    })
  );

  expect(container?.textContent?.match(/Экспорт завершен/g)?.length).toBe(1);
  expect(container?.textContent).toContain('export.zip');
  expect(container?.querySelector('[title="export.zip"]')?.textContent).toContain('export.zip');
  expect(container?.textContent).not.toContain('Можно снова запустить экспорт');
  expect(container?.querySelector('button')).toBeNull();
}

async function verifyFailedState() {
  await renderSection(
    createProps({
      isExporting: false,
      progress: {
        phase: 'error',
        message: 'Остановлено',
        current: 0,
        total: 0,
        errors: ['Сбор отменен'],
      },
      progressSteps: [
        { key: 'json', label: 'JSON', status: 'done', statusLabel: 'Готово' },
        { key: 'basicLogs', label: 'Базовые логи', status: 'error', statusLabel: 'Есть проблема' },
      ],
      result: {
        success: false,
        errors: ['Сбор отменен'],
        stats: {
          sectionsCount: 0,
          rowsCount: 0,
          filesCount: 0,
          filesFailed: 0,
        },
      },
    })
  );

  expect(container?.textContent).toContain('Сбор отменен');
  expect(container?.textContent).toContain('Есть проблема');
  expect(container?.textContent).toContain('Экспорт завершён с ошибками');
}

async function verifyStartFailureProgressMessage() {
  await renderSection(
    createProps({
      isExporting: false,
      progress: {
        phase: 'error',
        message: 'Не удалось подготовить экспорт',
        current: 0,
        total: 0,
        errors: [],
      },
      progressSteps: [{ key: 'json', label: 'JSON', status: 'pending', statusLabel: 'Ожидает' }],
      result: null,
    })
  );

  expect(container?.textContent).toContain('Не удалось подготовить экспорт');
  expect(container?.textContent).toContain('Экспорт завершён с ошибками');
  expect(container?.querySelector('.animate-spin')).toBeNull();
}

async function verifyErrorListLayout() {
  await renderSection(
    createProps({
      isExporting: false,
      progress: {
        phase: 'error',
        message: 'Экспорт завершён с ошибками',
        current: 0,
        total: 3,
        errors: ['Ошибка 1', 'Ошибка 2'],
      },
      progressSteps: [
        { key: 'json', label: 'JSON', status: 'error', statusLabel: 'Есть проблема' },
        { key: 'markdown', label: 'Markdown', status: 'error', statusLabel: 'Есть проблема' },
        { key: 'files', label: 'Файлы', status: 'error', statusLabel: 'Есть проблема' },
      ],
      result: {
        success: false,
        errors: ['Ошибка 1', 'Ошибка 2'],
        stats: {
          sectionsCount: 0,
          rowsCount: 0,
          filesCount: 0,
          filesFailed: 0,
        },
      },
    })
  );

  const stepList = container?.querySelector('.overflow-y-auto');
  const errorListEntry = Array.from(container?.querySelectorAll('div') ?? []).find(
    (element) => element.textContent === '• Ошибка 1'
  );
  const errorList = errorListEntry?.parentElement ?? null;

  expect(stepList).not.toBeNull();
  expect(errorList).not.toBeNull();
  expect(stepList?.compareDocumentPosition(errorList as Node)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING
  );
}

describe('ExportProgressSectionView', () => {
  it('renders active export progress with step statuses and warnings', verifyActiveProgressState);

  it(
    'uses the localized phase summary instead of raw runtime progress messages',
    verifyLocalizedProgressDescription
  );

  it(
    'renders a single completed summary without extra follow-up copy after a successful export',
    verifyCompletedState
  );

  it(
    'renders the failure description from the export result when the export ends with errors',
    verifyFailedState
  );

  it(
    'surfaces the progress error message when export startup fails before a result exists',
    verifyStartFailureProgressMessage
  );

  it('keeps the error summary below a scrollable step list', verifyErrorListLayout);
});

describe('ExportProgressSectionView long step lists', () => {
  it('renders many export steps as a compact vertical list', async () => {
    await renderSection(
      createProps({
        progressSteps: [
          { key: 'json', label: 'JSON', status: 'done', statusLabel: 'Готово' },
          { key: 'markdown', label: 'Markdown', status: 'done', statusLabel: 'Готово' },
          { key: 'files', label: 'Файлы', status: 'active', statusLabel: 'В процессе' },
          { key: 'images', label: 'Изображения', status: 'pending', statusLabel: 'Ожидает' },
          { key: 'basicLogs', label: 'Базовые логи', status: 'pending', statusLabel: 'Ожидает' },
          { key: 'harDomLogs', label: 'Подробные логи', status: 'pending', statusLabel: 'Ожидает' },
          {
            key: 'cssDiagnostics',
            label: 'Стили страницы',
            status: 'pending',
            statusLabel: 'Ожидает',
          },
          {
            key: 'fullPageScreenshot',
            label: 'Скриншот',
            status: 'pending',
            statusLabel: 'Ожидает',
          },
        ],
      })
    );

    const rows = container?.querySelectorAll('[class*="border-dashed"]');
    expect(rows?.length).toBe(8);
  });
});
