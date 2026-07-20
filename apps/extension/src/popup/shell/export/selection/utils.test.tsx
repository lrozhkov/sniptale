// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cx, formatPhaseLabel, getResultBadgeClassName, renderResultIcon } from './utils';

function createProgress(phase: Parameters<typeof formatPhaseLabel>[0]['phase']) {
  return {
    phase,
    message: '',
    current: 0,
    total: 0,
    errors: [],
  };
}

function createSuccessResult() {
  return {
    success: true as const,
    filename: 'export.zip',
    errors: [],
    stats: {
      filesCount: 0,
      filesFailed: 0,
      rowsCount: 0,
      sectionsCount: 0,
    },
  };
}

function createErrorResult() {
  return {
    success: false as const,
    errors: ['failed'],
    stats: {
      filesCount: 0,
      filesFailed: 0,
      rowsCount: 0,
      sectionsCount: 0,
    },
  };
}

describe('export utils', () => {
  it('joins only truthy class names', () => {
    expect(cx('alpha', false, null, undefined, 'beta')).toBe('alpha beta');
  });

  it('returns localized labels for active export phases', () => {
    expect(formatPhaseLabel(createProgress('scanning'))).toBe('Сканирование...');
    expect(formatPhaseLabel(createProgress('downloading'))).toBe('Скачивание...');
    expect(formatPhaseLabel(createProgress('zipping'))).toBe('Архивация...');
  });

  it('returns localized labels for terminal and idle phases', () => {
    expect(formatPhaseLabel(createProgress('done'))).toBe('Экспорт');
    expect(formatPhaseLabel(createProgress('error'))).toContain('Ошибка');
    expect(formatPhaseLabel(createProgress('idle'))).toBe('Ожидание');
  });

  it('formats every export phase explicitly, including idle before work starts', () => {
    expect([
      formatPhaseLabel(createProgress('idle')),
      formatPhaseLabel(createProgress('scanning')),
      formatPhaseLabel(createProgress('downloading')),
      formatPhaseLabel(createProgress('zipping')),
      formatPhaseLabel(createProgress('done')),
      formatPhaseLabel(createProgress('error')),
    ]).toHaveLength(6);
  });

  it('returns the proper badge classes for success, error, and idle states', () => {
    expect(getResultBadgeClassName(createSuccessResult())).toContain('success');
    expect(getResultBadgeClassName(createErrorResult())).toContain('danger');
    expect(getResultBadgeClassName(null)).toContain('border-soft');
  });

  it('renders the proper icon for success, error, and idle states', () => {
    expect(renderToStaticMarkup(renderResultIcon(createSuccessResult()))).toContain('svg');
    expect(renderToStaticMarkup(renderResultIcon(createErrorResult()))).toContain('danger');
    expect(renderToStaticMarkup(renderResultIcon(null))).toContain('animate-spin');
  });
});
