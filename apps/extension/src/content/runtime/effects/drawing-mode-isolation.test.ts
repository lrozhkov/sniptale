import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const stylesheet = readFileSync(
  new URL('../../public/preparation-surface/effects.css', import.meta.url),
  'utf8'
);

function readRuleSelectors(declaration: string): string[] {
  const hostIndex = stylesheet.indexOf(':host(.sniptale-drawing-mode-active)');
  expect(hostIndex).toBeGreaterThan(0);
  const declarationIndex = stylesheet.indexOf(declaration, hostIndex);
  expect(declarationIndex).toBeGreaterThan(0);
  const ruleStart = stylesheet.lastIndexOf('}', declarationIndex) + 1;
  return stylesheet
    .slice(ruleStart, declarationIndex)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(',')
    .map((selector) => selector.replace('{', '').replace(/\s+/g, ' ').trim());
}

it('makes frame surfaces passive and hides annotation chrome while Drawing is active', () => {
  expect(readRuleSelectors('  pointer-events: none !important;')).toContain(
    ':host(.sniptale-drawing-mode-active) .sniptale-frame-container'
  );

  const hiddenSelectors = readRuleSelectors('  display: none !important;');
  [
    '.sniptale-action-toolbar',
    '.sniptale-frame-toolbar-trigger',
    '.sniptale-resize-handle',
    '.sniptale-step-badge-controls',
    '.sniptale-callout-adjacent-controls',
    '.sniptale-design-review-frame',
    '.sniptale-annotation-marker-layer',
    "[data-ui='content.design-review.popover']",
    "[data-ui='content.design-review.feedback-panel']",
  ].forEach((selector) =>
    expect(hiddenSelectors).toContain(`:host(.sniptale-drawing-mode-active) ${selector}`)
  );
});
