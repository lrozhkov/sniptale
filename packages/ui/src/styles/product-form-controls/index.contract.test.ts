import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const productFormControlsStylesheet = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const productRangeStylesheet = readFileSync(new URL('./range.css', import.meta.url), 'utf8');
const productSelectStylesheet = readFileSync(new URL('./select.css', import.meta.url), 'utf8');

function readRangeRuleBlock(selector: string, occurrence = 0): string {
  let blockStart = -1;
  let searchFrom = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    blockStart = productRangeStylesheet.indexOf(selector, searchFrom);
    searchFrom = blockStart + selector.length;
  }

  expect(blockStart).toBeGreaterThanOrEqual(0);
  const bodyStart = productRangeStylesheet.indexOf('{', blockStart);
  const bodyEnd = productRangeStylesheet.indexOf('\n}', bodyStart);
  expect(bodyStart).toBeGreaterThanOrEqual(0);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return productRangeStylesheet.slice(bodyStart, bodyEnd);
}

function expectProductRangeThumbContract() {
  const webkitThumbBlock = readRangeRuleBlock('.sniptale-range::-webkit-slider-thumb');
  const mozThumbBlock = readRangeRuleBlock('.sniptale-range::-moz-range-thumb');
  const webkitThumbOffsetBlock = readRangeRuleBlock('.sniptale-range::-webkit-slider-thumb', 1);
  const webkitThumbHoverBlock = readRangeRuleBlock(
    '.sniptale-range:hover:not(:active)::-webkit-slider-thumb'
  );
  const mozThumbHoverBlock = readRangeRuleBlock(
    '.sniptale-range:hover:not(:active)::-moz-range-thumb'
  );
  const webkitThumbActiveBlock = readRangeRuleBlock('.sniptale-range:active::-webkit-slider-thumb');
  const mozThumbActiveBlock = readRangeRuleBlock('.sniptale-range:active::-moz-range-thumb');

  expect(productRangeStylesheet).toContain('--sniptale-range-thumb-inner-inset: 5px;');
  expect(productRangeStylesheet).toContain('--sniptale-range-thumb-hover-inset: 2px;');
  expect(productRangeStylesheet).toContain('--sniptale-range-shell-border-hover: transparent;');
  expect(productRangeStylesheet).toContain('--sniptale-range-shell-bg-hover: transparent;');
  expect(productRangeStylesheet).toContain('--sniptale-range-shell-shadow-hover: none;');
  expect(productRangeStylesheet).toContain('--sniptale-range-shell-border-active: transparent;');
  expect(productRangeStylesheet).toContain('--sniptale-range-shell-bg-active: transparent;');
  expect(productRangeStylesheet).toContain('--sniptale-range-shell-shadow-active: none;');
  expect(webkitThumbBlock).toContain('var(--sniptale-range-thumb-inner-inset)');
  expect(webkitThumbBlock).toContain(
    'background: color-mix(in srgb, var(--sniptale-color-accent) 44%, white 56%);'
  );
  expect(webkitThumbBlock).toContain('color-mix(in srgb, white 96%, #fffcf8 4%)');
  expect(webkitThumbBlock).toContain('transition: box-shadow 0.18s ease-out;');
  expect(mozThumbBlock).toContain('var(--sniptale-range-thumb-inner-inset)');
  expect(mozThumbBlock).toContain(
    'background: color-mix(in srgb, var(--sniptale-color-accent) 44%, white 56%);'
  );
  expect(mozThumbBlock).toContain('color-mix(in srgb, white 96%, #fffcf8 4%)');
  expect(mozThumbBlock).toContain('transition: box-shadow 0.18s ease-out;');
  expect(webkitThumbHoverBlock).toContain(
    '--sniptale-range-thumb-inner-inset: var(--sniptale-range-thumb-hover-inset);'
  );
  expect(mozThumbHoverBlock).toContain(
    '--sniptale-range-thumb-inner-inset: var(--sniptale-range-thumb-hover-inset);'
  );
  expect(webkitThumbActiveBlock).toContain('--sniptale-range-thumb-inner-inset: 3.5px;');
  expect(webkitThumbActiveBlock).toContain('transition: none;');
  expect(mozThumbActiveBlock).toContain('--sniptale-range-thumb-inner-inset: 3.5px;');
  expect(mozThumbActiveBlock).toContain('transition: none;');
  expect(webkitThumbOffsetBlock).toContain(
    'calc((var(--sniptale-range-track-height) - var(--sniptale-range-thumb-size)) / 2)'
  );
}

describe('product-form-controls contract', () => {
  it('keeps product range track and thumb rendering under the shared form owner', () => {
    const webkitTrackBlock = readRangeRuleBlock('.sniptale-range::-webkit-slider-runnable-track');
    const mozTrackBlock = readRangeRuleBlock('.sniptale-range::-moz-range-track');
    const mozProgressBlock = readRangeRuleBlock('.sniptale-range::-moz-range-progress');

    expect(productFormControlsStylesheet).toContain("@import './range.css';");
    expect(productRangeStylesheet).toContain('--sniptale-range-fill-ratio: 50%;');
    expect(productRangeStylesheet).toContain('--sniptale-range-shell-height: 40px;');
    expect(productRangeStylesheet).toContain('--sniptale-range-shell-padding-inline: 0px;');
    expect(productRangeStylesheet).toContain('--sniptale-range-shell-border-idle: transparent;');
    expect(productRangeStylesheet).toContain('.sniptale-range:hover {');
    expect(productRangeStylesheet).toContain('.sniptale-range:focus-visible,');
    expect(productRangeStylesheet).toContain('--sniptale-range-track-height: 6px;');
    expect(webkitTrackBlock).toContain('height: var(--sniptale-range-track-height);');
    expect(webkitTrackBlock).not.toContain('transform:');
    expect(webkitTrackBlock).toContain('var(--sniptale-range-fill-ratio)');
    expect(mozTrackBlock).toContain('height: var(--sniptale-range-track-height);');
    expect(mozTrackBlock).not.toContain('transform:');
    expect(mozProgressBlock).toContain('height: var(--sniptale-range-track-height);');
    expect(mozProgressBlock).not.toContain('transform:');
    expect(mozProgressBlock).toContain('var(--sniptale-color-accent)');
    expectProductRangeThumbContract();
  });

  it('keeps a darker checked toggle thumb contract for light-theme contrast', () => {
    expect(productFormControlsStylesheet).toContain(
      '.sniptale-product-toggle-checked .sniptale-product-toggle-thumb {'
    );
    expect(productFormControlsStylesheet).toContain('var(--sniptale-color-accent-soft-strong) 38%');
    expect(productFormControlsStylesheet).not.toContain(
      'background: color-mix(in srgb, var(--sniptale-color-surface-panel) 74%, white 26%);'
    );
  });

  it('keeps compact select labels single-line in triggers and two-line clamped in menus', () => {
    expect(productFormControlsStylesheet).toContain("@import './select.css';");
    expect(productSelectStylesheet).toContain('--sniptale-field-bg-idle: transparent;');
    expect(productSelectStylesheet).toContain(
      '.sniptale-select:hover:not(.sniptale-select-disabled) {'
    );
    expect(productSelectStylesheet).toContain('.sniptale-select-open {');
    expect(productSelectStylesheet).toContain('.sniptale-select-value-label-trigger {');
    expect(productSelectStylesheet).toContain('text-overflow: ellipsis;');
    expect(productSelectStylesheet).toContain('white-space: nowrap;');
    expect(productSelectStylesheet).toContain('.sniptale-select-value-label-menu {');
    expect(productSelectStylesheet).toContain('-webkit-line-clamp: 2;');
    expect(productSelectStylesheet).toContain('word-break: break-word;');
  });
});
