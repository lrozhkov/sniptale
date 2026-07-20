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
  const selectors: string[] = [];
  const selectorPrefix = 'body.sniptale-capture-ui-hidden ';

  for (const line of stylesheet.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith(selectorPrefix)) {
      if (selectors.length > 0) {
        break;
      }
      continue;
    }

    selectors.push(removeSelectorTerminator(trimmedLine));
  }

  return selectors;
}

const captureHiddenSelectors = readCaptureHiddenSelectors(runtimeEffectsStylesheet);

function expectCaptureHiddenSelector(selector: string): void {
  expect(captureHiddenSelectors).toContain(`body.sniptale-capture-ui-hidden ${selector}`);
}

it('hides transient app UI during screenshot capture without hiding captured annotations', () => {
  [
    '.sniptale-action-toolbar',
    '.sniptale-toolbar-portal-wrapper',
    '.sniptale-frame-settings-popover',
    '.sniptale-step-badge-popover',
    '.sniptale-callout-settings-popover',
    '.sniptale-callout-format-toolbar',
    '.sniptale-content-size-tooltip',
    '.sniptale-highlight-hover',
    '.sniptale-blocking-overlay',
    '.sniptale-editing-blocking-overlay',
    '.sniptale-resize-handle',
    '.sniptale-quick-edit-hover',
  ].forEach(expectCaptureHiddenSelector);

  expect(captureHiddenSelectors).not.toContain(
    'body.sniptale-capture-ui-hidden .sniptale-frame-container'
  );
  expect(captureHiddenSelectors).not.toContain(
    'body.sniptale-capture-ui-hidden .sniptale-interactive-frame'
  );
  expect(captureHiddenSelectors).not.toContain(
    'body.sniptale-capture-ui-hidden .sniptale-step-badge'
  );
  expect(captureHiddenSelectors).not.toContain('body.sniptale-capture-ui-hidden .sniptale-callout');
  expect(captureHiddenSelectors).not.toContain(
    'body.sniptale-capture-ui-hidden .sniptale-blur-overlay'
  );
  expect(captureHiddenSelectors).not.toContain(
    'body.sniptale-capture-ui-hidden .sniptale-focus-overlay'
  );
});
