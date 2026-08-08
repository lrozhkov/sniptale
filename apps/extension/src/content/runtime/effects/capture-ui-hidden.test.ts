import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const runtimeEffectsStylesheet = readFileSync(
  new URL('../../public/preparation-surface/effects.css', import.meta.url),
  'utf8'
);

function removeSelectorTerminator(value: string): string {
  if (value.endsWith(' {')) {
    return value.slice(0, -2).trim();
  }
  if (value.endsWith(',')) {
    return value.slice(0, -1).trim();
  }
  return value;
}

function readCaptureHiddenSelectors(stylesheet: string): string[] {
  const selectorHost = ':host(.sniptale-capture-ui-hidden)';
  const ruleStart = stylesheet.indexOf(selectorHost);
  const ruleEnd = stylesheet.indexOf('{', ruleStart);
  expect(ruleStart).toBeGreaterThanOrEqual(0);
  expect(ruleEnd).toBeGreaterThan(ruleStart);
  return stylesheet
    .slice(ruleStart, ruleEnd)
    .split(',')
    .map((selector) => selector.replace(/\s+/g, ' ').trim());
}

function readScaleCompensatedSelectors(stylesheet: string): string[] {
  const declaration = '  scale: var(--sniptale-content-ui-scale);';
  const declarationIndex = stylesheet.indexOf(declaration);
  expect(declarationIndex).toBeGreaterThan(0);
  const blockStart = stylesheet.lastIndexOf('}', declarationIndex) + 1;
  return stylesheet
    .slice(blockStart, declarationIndex)
    .split('\n')
    .map((line) => removeSelectorTerminator(line.trim()))
    .filter((line) => line.startsWith('.') || line.startsWith('['));
}

const captureHiddenSelectors = readCaptureHiddenSelectors(runtimeEffectsStylesheet);
const scaleCompensatedSelectors = readScaleCompensatedSelectors(runtimeEffectsStylesheet);

function expectCaptureHiddenSelector(selector: string): void {
  expect(captureHiddenSelectors).toContain(`:host(.sniptale-capture-ui-hidden) ${selector}`);
}

it('hides transient app UI during screenshot capture without hiding captured annotations', () => {
  [
    '.sniptale-action-toolbar',
    '.sniptale-toolbar-portal-wrapper',
    '.sniptale-frame-toolbar-trigger',
    '.sniptale-frame-toolbar-bridge',
    '.sniptale-frame-settings-popover',
    '.sniptale-frame-style-editor-layer',
    "[data-floating-ui-capture-transient='true']",
    '.sniptale-step-badge-popover',
    '.sniptale-callout-settings-popover',
    '.sniptale-callout-format-toolbar',
    '.sniptale-content-size-tooltip',
    '.sniptale-highlight-hover',
    '.sniptale-blocking-overlay',
    '.sniptale-editing-blocking-overlay',
    '.sniptale-resize-handle',
    '.sniptale-callout-drag-handle',
    '.sniptale-callout-adjacent-controls',
    '.sniptale-callout-tail-handle',
    '.sniptale-callout-settings-handle',
    '.sniptale-step-badge-controls',
    '.sniptale-free-frame-draft-portal',
    '.sniptale-quick-edit-hover',
    '.sniptale-annotation-marker-tooltip',
    '.sniptale-annotation-marker-drag-handle',
    ".sniptale-interactive-frame-fill[data-hide-during-capture='true']",
    ".sniptale-interactive-frame-stroke[data-hide-during-capture='true']",
  ].forEach(expectCaptureHiddenSelector);

  expect(captureHiddenSelectors).not.toContain(
    ':host(.sniptale-capture-ui-hidden) .sniptale-frame-container'
  );
  expect(captureHiddenSelectors).not.toContain(
    ':host(.sniptale-capture-ui-hidden) .sniptale-interactive-frame'
  );
  expect(captureHiddenSelectors).not.toContain(
    ':host(.sniptale-capture-ui-hidden) .sniptale-step-badge'
  );
  expect(captureHiddenSelectors).not.toContain(
    ':host(.sniptale-capture-ui-hidden) .sniptale-callout'
  );
  expect(captureHiddenSelectors).not.toContain(
    ':host(.sniptale-capture-ui-hidden) .sniptale-blur-overlay'
  );
  expect(captureHiddenSelectors).not.toContain(
    ':host(.sniptale-capture-ui-hidden) .sniptale-focus-overlay'
  );
  expect(captureHiddenSelectors).not.toContain(
    ':host(.sniptale-capture-ui-hidden) .sniptale-annotation-marker-layer'
  );
});

it('compensates extension chrome and fixed-metric annotations while page geometry keeps host zoom', () => {
  const captureTransientSelectors = new Set(
    captureHiddenSelectors.map((selector) =>
      selector.replace(':host(.sniptale-capture-ui-hidden) ', '')
    )
  );
  const independentlyHiddenAppSelectors = new Set([
    '.sniptale-toolbar',
    '.sniptale-show-toolbar-button',
    '.sniptale-callout-adjacent-controls',
    '.sniptale-modal',
    '.sniptale-main-toolbar-popover',
    '.sniptale-scenario-recorder-sidebar',
    '.sniptale-annotation-marker-chrome',
    "[data-ui='content.design-review.popover']",
    "[data-ui='content.design-review.feedback-panel']",
    "[data-ui='shared.toast.host']",
  ]);

  scaleCompensatedSelectors.forEach((selector) => {
    expect(
      captureTransientSelectors.has(selector) || independentlyHiddenAppSelectors.has(selector)
    ).toBe(true);
  });
  expect(scaleCompensatedSelectors).not.toContain('.sniptale-action-toolbar');
  expect(scaleCompensatedSelectors).not.toContain('.sniptale-app');
  expect(scaleCompensatedSelectors).not.toContain('.sniptale-frame-toolbar-trigger');
  expect(scaleCompensatedSelectors).not.toContain('.sniptale-callout-drag-handle');
  expect(scaleCompensatedSelectors).not.toContain('.sniptale-callout-settings-handle');
  [
    '.sniptale-highlight-hover',
    '.sniptale-blocking-overlay',
    '.sniptale-editing-blocking-overlay',
    '.sniptale-free-frame-draft-portal',
    '.sniptale-quick-edit-hover',
    '.sniptale-frame-container',
    '.sniptale-interactive-frame',
    '.sniptale-step-badge',
    '.sniptale-callout',
  ].forEach((selector) => expect(scaleCompensatedSelectors).not.toContain(selector));
});
