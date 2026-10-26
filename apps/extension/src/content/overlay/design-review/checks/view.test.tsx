// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TranslationKey } from '../../../../platform/i18n';
import type { ReviewCheckFinding } from '../../../selection/design-review/checks/scan';
import type { DesignReviewChecks } from '../session/checks';
import { DesignReviewChecksView } from './view';

const locale = vi.hoisted(() => ({ current: 'ru' as 'ru' | 'en' }));
vi.mock('../../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../platform/i18n')>();
  return { ...actual, translate: (key: TranslationKey) => actual.translate(key, locale.current) };
});
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function createChecks(): DesignReviewChecks {
  const target = document.createElement('p');
  target.textContent = 'Source text';
  document.body.append(target);
  return {
    scope: 'selected',
    setScope: vi.fn(),
    unavailable: false,
    navigationFailed: false,
    setNavigationFailed: vi.fn(),
    newScan: vi.fn(),
    recheck: vi.fn(),
    canScan: true,
    currentViewport: { width: 1920, height: 900 },
    rootUnavailable: false,
    viewportChanged: true,
    result: {
      root: target,
      scope: 'selected',
      rootLabel: 'p',
      completedAt: 1,
      viewport: { width: 1280, height: 560, frame: false },
      visited: 2,
      inspected: 2,
      truncated: false,
      totalFindings: 1,
      findings: [
        {
          id: 'contrast',
          target,
          label: 'p',
          kind: 'contrast',
          evidence: { ratio: 2.11, required: 4.5, foreground: '#aaa', background: '#fff' },
        },
      ],
      skipped: { hidden: 0, owned: 0, boundaries: 1, unknownNames: 2, unknownContrast: 3 },
    },
  };
}
it.each([
  {
    language: 'ru' as const,
    reason: 'Контраст текста ниже порога',
    show: 'Показать',
    properties: 'Свойства',
    comment: 'Добавить замечание',
    recheck: 'Повторить проверку',
  },
  {
    language: 'en' as const,
    reason: 'Text contrast is below the threshold',
    show: 'Show',
    properties: 'Properties',
    comment: 'Add feedback',
    recheck: 'Recheck',
  },
])('shows localized evidence and requires explicit actions in $language', (copy) => {
  locale.current = copy.language;
  const checks = createChecks();
  const onFinding = vi.fn();
  const source = checks.result!.root;
  const before = source.outerHTML;
  act(() => root.render(<DesignReviewChecksView checks={checks} onFinding={onFinding} />));
  expect(host.textContent).toContain(copy.reason);
  expect(host.textContent).toContain('2.11 / 4.5');
  expect(host.textContent).toContain('1280 × 560');
  expect(host.textContent).toContain('1920 × 900');
  expect(onFinding).not.toHaveBeenCalled();
  expect(checks.newScan).not.toHaveBeenCalled();
  expect(checks.recheck).not.toHaveBeenCalled();
  const button = (text: string) =>
    [...host.querySelectorAll('button')].find((item) => item.textContent === text)!;
  for (const [text, action] of [
    [copy.show, 'show'],
    [copy.properties, 'inspect'],
    [copy.comment, 'comment'],
  ] as const) {
    act(() => button(text).click());
    expect(onFinding).toHaveBeenLastCalledWith(checks.result!.findings[0], action);
  }
  act(() => button(copy.recheck).click());
  expect(checks.recheck).toHaveBeenCalledOnce();
  expect(onFinding).toHaveBeenCalledTimes(3);
  expect(source.outerHTML).toBe(before);
});

function button(text: string): HTMLButtonElement {
  const value = [...host.querySelectorAll('button')].find((item) => item.textContent === text);
  if (!value) throw new Error(`Missing button: ${text}`);
  return value;
}
it('keeps a failed scan result readable and offers explicit recovery', () => {
  locale.current = 'en';
  const checks = createChecks();
  checks.unavailable = true;
  checks.navigationFailed = true;
  checks.currentViewport = null;
  const onFinding = vi.fn();
  act(() => root.render(<DesignReviewChecksView checks={checks} onFinding={onFinding} />));
  expect(host.querySelectorAll('[role="alert"]')).toHaveLength(2);
  expect(host.textContent).toContain('previous result is stale and retained');
  expect(host.textContent).toContain('Navigation failed');
  expect(host.textContent).toContain('— × —');
  expect(host.textContent).toContain('2.11 / 4.5');
  act(() => button('New scan').click());
  act(() => button('Recheck').click());
  expect(checks.newScan).toHaveBeenCalledOnce();
  expect(checks.recheck).toHaveBeenCalledOnce();
  expect(onFinding).not.toHaveBeenCalled();
});
it('disables unavailable initial actions and permits changing the next scan scope', () => {
  locale.current = 'en';
  const checks = createChecks();
  checks.result = null;
  checks.canScan = false;
  checks.viewportChanged = false;
  act(() => root.render(<DesignReviewChecksView checks={checks} onFinding={vi.fn()} />));
  expect(button('New scan').disabled).toBe(true);
  expect(button('Recheck').disabled).toBe(true);
  act(() => {
    button('New scan').click();
    button('Recheck').click();
  });
  expect(checks.newScan).not.toHaveBeenCalled();
  expect(checks.recheck).not.toHaveBeenCalled();
  expect(host.querySelector('ol')).toBeNull();
  const scope = host.querySelector<HTMLButtonElement>('[aria-label="New scan scope"]')!;
  act(() => scope.click());
  const page = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (item) => item.textContent === 'Page'
  )!;
  act(() => page.click());
  expect(checks.setScope).toHaveBeenCalledWith('page');
});
it('reports incomplete empty scans and lets the user inspect scan limitations', () => {
  locale.current = 'en';
  const checks = createChecks();
  checks.rootUnavailable = true;
  checks.viewportChanged = false;
  checks.result!.scope = 'page';
  checks.result!.viewport.frame = true;
  checks.result!.findings = [];
  checks.result!.truncated = true;
  act(() => root.render(<DesignReviewChecksView checks={checks} onFinding={vi.fn()} />));
  expect(host.textContent).toContain('p · Page');
  expect(host.textContent).toContain('1280 × 560 · iframe');
  expect(host.textContent).toContain('scan is incomplete');
  expect(host.textContent).toContain('No hints found');
  const limits = host.querySelector('details')!;
  expect(limits.open).toBe(false);
  act(() => {
    limits.open = true;
    limits.dispatchEvent(new Event('toggle', { bubbles: true }));
  });
  expect(limits.open).toBe(true);
  expect(limits.textContent).toContain('Hidden / owned / iframe and shadow boundaries: 0 / 0 / 1');
  expect(limits.textContent).toContain('Field values are not read');
});
it('presents each finding evidence and offers Properties only for visual findings', () => {
  locale.current = 'en';
  const checks = createChecks();
  const target = checks.result!.root;
  const common = { target, label: 'target' };
  const findings: ReviewCheckFinding[] = [
    { ...common, id: 'alt', kind: 'missing-alt', evidence: { attribute: 'alt' } },
    { ...common, id: 'name', kind: 'missing-name', evidence: { tag: 'button' } },
    { ...common, id: 'label', kind: 'missing-label', evidence: { tag: 'input' } },
    { ...common, id: 'tab', kind: 'positive-tabindex', evidence: { value: 3 } },
    { ...common, id: 'size', kind: 'small-target', evidence: { width: 12.345, height: 19.876 } },
    {
      ...common,
      id: 'clip',
      kind: 'text-clipping',
      evidence: { clientWidth: 20, scrollWidth: 40 },
    },
    {
      ...common,
      id: 'overflow',
      kind: 'horizontal-overflow',
      evidence: { width: 1285.555, overflow: 5.555, available: 1280 },
    },
  ];
  checks.result!.findings = findings;
  const onFinding = vi.fn();
  act(() => root.render(<DesignReviewChecksView checks={checks} onFinding={onFinding} />));
  const rows = [...host.querySelectorAll('li')];
  for (const [index, value] of [
    'alt',
    'button',
    'input',
    'tabindex=3',
    '12.35 × 19.88',
    '20 / 40',
    '5.56 / 1280',
  ].entries()) {
    expect(rows[index]!.textContent).toContain(value);
    const actions = [...rows[index]!.querySelectorAll('button')];
    expect(actions.map((item) => item.textContent)).toEqual(
      index < 4 ? ['Show', 'Add feedback'] : ['Show', 'Properties', 'Add feedback']
    );
    act(() => actions[actions.length - 1]!.click());
    expect(onFinding).toHaveBeenLastCalledWith(findings[index], 'comment');
  }
});
