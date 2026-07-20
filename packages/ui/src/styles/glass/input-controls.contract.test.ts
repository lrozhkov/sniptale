import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const glassInputControlsStylesheet = readFileSync(
  new URL('./input-controls.css', import.meta.url),
  'utf8'
);

function readRuleBlock(selector: string, occurrence = 0): string {
  let blockStart = -1;
  let searchFrom = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    blockStart = glassInputControlsStylesheet.indexOf(selector, searchFrom);
    searchFrom = blockStart + selector.length;
  }

  expect(blockStart).toBeGreaterThanOrEqual(0);
  const bodyStart = glassInputControlsStylesheet.indexOf('{', blockStart);
  const bodyEnd = glassInputControlsStylesheet.indexOf('\n}', bodyStart);
  expect(bodyStart).toBeGreaterThanOrEqual(0);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return glassInputControlsStylesheet.slice(bodyStart, bodyEnd);
}

function expectGlassRangeThumbContract() {
  const webkitThumbBlock = readRuleBlock('.sniptale-glass-range::-webkit-slider-thumb');
  const webkitThumbOffsetBlock = readRuleBlock('.sniptale-glass-range::-webkit-slider-thumb', 1);
  const webkitThumbHoverBlock = readRuleBlock(
    '.sniptale-glass-range:hover:not(:active)::-webkit-slider-thumb'
  );
  const webkitThumbActiveBlock = readRuleBlock(
    '.sniptale-glass-range:active::-webkit-slider-thumb'
  );
  const mozThumbBlock = readRuleBlock('.sniptale-glass-range::-moz-range-thumb');
  const mozThumbHoverBlock = readRuleBlock(
    '.sniptale-glass-range:hover:not(:active)::-moz-range-thumb'
  );
  const mozThumbActiveBlock = readRuleBlock('.sniptale-glass-range:active::-moz-range-thumb');

  expect(glassInputControlsStylesheet).toContain('--sniptale-range-thumb-inner-inset: 6px;');
  expect(glassInputControlsStylesheet).toContain('--sniptale-range-thumb-hover-inset: 2px;');
  expect(webkitThumbBlock).toContain('var(--sniptale-range-thumb-inner-inset)');
  expect(webkitThumbBlock).toContain(
    'background: color-mix(in srgb, var(--sniptale-color-accent) 58%, white 42%);'
  );
  expect(webkitThumbBlock).toContain('color-mix(in srgb, white 94%, #fffcf8 6%)');
  expect(webkitThumbBlock).toContain('transition: box-shadow 0.18s ease-out;');
  expect(webkitThumbHoverBlock).toContain(
    '--sniptale-range-thumb-inner-inset: var(--sniptale-range-thumb-hover-inset);'
  );
  expect(webkitThumbActiveBlock).toContain('--sniptale-range-thumb-inner-inset: 6px;');
  expect(webkitThumbActiveBlock).toContain('transition: none;');
  expect(webkitThumbOffsetBlock).toContain(
    'calc((var(--sniptale-range-track-height) - var(--sniptale-range-thumb-size)) / 2)'
  );
  expect(mozThumbBlock).toContain('var(--sniptale-range-thumb-inner-inset)');
  expect(mozThumbBlock).toContain(
    'background: color-mix(in srgb, var(--sniptale-color-accent) 58%, white 42%);'
  );
  expect(mozThumbBlock).toContain('color-mix(in srgb, white 94%, #fffcf8 6%)');
  expect(mozThumbBlock).toContain('transition: box-shadow 0.18s ease-out;');
  expect(mozThumbHoverBlock).toContain(
    '--sniptale-range-thumb-inner-inset: var(--sniptale-range-thumb-hover-inset);'
  );
  expect(mozThumbActiveBlock).toContain('--sniptale-range-thumb-inner-inset: 6px;');
  expect(mozThumbActiveBlock).toContain('transition: none;');
}

describe('glass.input-controls contract', () => {
  it('keeps switch, range, and input chrome on the input owner', () => {
    expect(glassInputControlsStylesheet).toContain('.sniptale-glass-switch {');
    expect(glassInputControlsStylesheet).toContain('.sniptale-glass-range {');
    expect(glassInputControlsStylesheet).toContain('.sniptale-glass-input {');
  });

  it('keeps destructive and utility text treatments without swallowing color-specific chrome', () => {
    expect(glassInputControlsStylesheet).toContain('.sniptale-glass-destructive {');
    expect(glassInputControlsStylesheet).toContain('.sniptale-glass-muted {');
    expect(glassInputControlsStylesheet).not.toContain('.sniptale-glass-color-trigger {');
    expect(glassInputControlsStylesheet).toContain('min-height: 40px;');
    expect(glassInputControlsStylesheet).toContain('border: none;');
    expect(glassInputControlsStylesheet).toContain('font-size: 12px;');
  });

  it('keeps glass inputs and sliders explicitly editable/selectable', () => {
    expect(glassInputControlsStylesheet).toContain('.sniptale-glass-range {');
    expect(glassInputControlsStylesheet).toContain('.sniptale-glass-input {');
    expect(glassInputControlsStylesheet).toContain('user-select: text;');
    expect(glassInputControlsStylesheet).toContain('-webkit-user-select: text;');
  });
});

describe('glass.input-controls range contract', () => {
  it('keeps range active fill on the input owner', () => {
    const webkitTrackBlock = readRuleBlock('.sniptale-glass-range::-webkit-slider-runnable-track');
    const mozTrackBlock = readRuleBlock('.sniptale-glass-range::-moz-range-track');
    const mozProgressBlock = readRuleBlock('.sniptale-glass-range::-moz-range-progress');

    expect(glassInputControlsStylesheet).toContain('--sniptale-range-fill-ratio: 0%;');
    expect(glassInputControlsStylesheet).toContain('--sniptale-range-track-height: 8px;');
    expect(glassInputControlsStylesheet).toContain('height: 28px;');
    expect(glassInputControlsStylesheet).not.toContain(
      '.sniptale-glass-range::-webkit-slider-runnable-track,\n.sniptale-glass-range::-moz-range-track'
    );
    expect(webkitTrackBlock).toContain('height: var(--sniptale-range-track-height);');
    expect(webkitTrackBlock).toContain('border: 1px solid');
    expect(webkitTrackBlock).toContain('var(--sniptale-range-fill-ratio)');
    expect(webkitTrackBlock).toContain('transparent var(--sniptale-range-fill-ratio)');
    expect(mozTrackBlock).toContain('height: var(--sniptale-range-track-height);');
    expect(mozTrackBlock).toContain('border: 1px solid');
    expect(mozProgressBlock).toContain('height: var(--sniptale-range-track-height);');
    expect(mozProgressBlock).toContain('var(--sniptale-color-accent)');
  });

  it('keeps thumb hover animation and formula-based thumb centering on the input owner', () => {
    expectGlassRangeThumbContract();
  });
});
