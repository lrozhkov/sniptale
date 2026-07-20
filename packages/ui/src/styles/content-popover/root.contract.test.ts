import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const contentPopoverIndexStylesheet = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const contentPopoverSurfaceStylesheet = readFileSync(
  new URL('./surface.css', import.meta.url),
  'utf8'
);
const contentPopoverOwnerStylesheet = [
  contentPopoverIndexStylesheet,
  contentPopoverSurfaceStylesheet,
].join('\n');

function expectDarkSafeThumb(block: string) {
  expect(block).toContain('background: color-mix(');
  expect(block).toContain('var(--sniptale-color-accent) 52%');
  expect(block).toContain('white 48%');
  expect(block).toContain('var(--sniptale-range-thumb-inner-inset)');
  expect(block).toContain('color-mix(in srgb, white 94%, #fffcf8 6%)');
}

function readRuleBlock(selector: string, occurrence = 0): string {
  let blockStart = -1;
  let searchFrom = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    blockStart = contentPopoverOwnerStylesheet.indexOf(selector, searchFrom);
    searchFrom = blockStart + selector.length;
  }

  expect(blockStart).toBeGreaterThanOrEqual(0);
  const bodyStart = contentPopoverOwnerStylesheet.indexOf('{', blockStart);
  const bodyEnd = contentPopoverOwnerStylesheet.indexOf('\n}', bodyStart);
  expect(bodyStart).toBeGreaterThanOrEqual(0);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return contentPopoverOwnerStylesheet.slice(bodyStart, bodyEnd);
}

function verifyRangeActiveFillContract() {
  const rangeTrackBlock = readRuleBlock(
    '.sniptale-content-popover .sniptale-glass-range::-webkit-slider-runnable-track'
  );
  const mozTrackBlock = readRuleBlock(
    '.sniptale-content-popover .sniptale-glass-range::-moz-range-track'
  );
  const mozProgressBlock = readRuleBlock(
    '.sniptale-content-popover .sniptale-glass-range::-moz-range-progress'
  );

  expect(contentPopoverOwnerStylesheet).not.toContain(
    '.sniptale-content-popover .sniptale-glass-range::-webkit-slider-runnable-track,\n' +
      '.sniptale-content-popover .sniptale-glass-range::-moz-range-track'
  );
  expect(rangeTrackBlock).toContain('height: var(--sniptale-range-track-height);');
  expect(rangeTrackBlock).toContain('border: 1px solid');
  expect(rangeTrackBlock).toContain('var(--sniptale-range-fill-ratio)');
  expect(rangeTrackBlock).toContain('transparent var(--sniptale-range-fill-ratio)');
  expect(mozTrackBlock).toContain('height: var(--sniptale-range-track-height);');
  expect(mozTrackBlock).toContain('border: 1px solid');
  expect(mozProgressBlock).toContain('height: var(--sniptale-range-track-height);');
  expect(mozProgressBlock).toContain('var(--sniptale-color-accent)');
}

describe('content-popover surface contract', () => {
  it('keeps the canonical content-popover owner stylesheet as the surface owner', () => {
    expect(contentPopoverIndexStylesheet).toContain("@import './surface.css';");
    expect(contentPopoverOwnerStylesheet).toContain('.sniptale-content-popover {');
    expect(contentPopoverOwnerStylesheet).toContain('.sniptale-content-popover-section,');
    expect(contentPopoverOwnerStylesheet).toContain('.sniptale-content-popover,');
    expect(contentPopoverOwnerStylesheet).toContain('.sniptale-content-popover * {');
    expect(contentPopoverOwnerStylesheet).toContain('user-select: none;');
    expect(contentPopoverOwnerStylesheet).toContain('-webkit-user-select: none;');
    expect(contentPopoverOwnerStylesheet).toContain(
      '.sniptale-content-popover :is(input, textarea, select, [contenteditable]),'
    );
    expect(contentPopoverOwnerStylesheet).toContain(
      '.sniptale-content-popover [contenteditable] * {'
    );
  });

  it('keeps content popover range sizing on the shared centering contract', () => {
    expect(contentPopoverOwnerStylesheet).toContain('--sniptale-range-track-height: 6px;');
    expect(contentPopoverOwnerStylesheet).toContain('--sniptale-range-thumb-size: 16px;');
    expect(contentPopoverOwnerStylesheet).toContain(
      'calc((var(--sniptale-range-track-height) - var(--sniptale-range-thumb-size)) / 2)'
    );
  });

  it(
    'keeps content popover range active fill visible in the highlighter popover',
    verifyRangeActiveFillContract
  );
});

describe('content-popover destructive action contract', () => {
  it('keeps destructive popover actions on the matte danger button contract', () => {
    const destructiveButtonBlock = readRuleBlock(
      '.sniptale-content-popover .sniptale-glass-destructive'
    );

    expect(destructiveButtonBlock).toContain('border: none;');
    expect(destructiveButtonBlock).toContain('background: transparent;');
    expect(destructiveButtonBlock).toContain('var(--sniptale-color-danger) 72%');
  });
});

function verifyRangeThumbContract() {
  const webkitThumbBlock = readRuleBlock(
    '.sniptale-content-popover .sniptale-glass-range::-webkit-slider-thumb'
  );
  const webkitThumbHoverBlock = readRuleBlock(
    '.sniptale-content-popover .sniptale-glass-range:hover:not(:active)::-webkit-slider-thumb'
  );
  const webkitThumbActiveBlock = readRuleBlock(
    '.sniptale-content-popover .sniptale-glass-range:active::-webkit-slider-thumb'
  );
  const mozThumbBlock = readRuleBlock(
    '.sniptale-content-popover .sniptale-glass-range::-moz-range-thumb'
  );
  const mozThumbHoverBlock = readRuleBlock(
    '.sniptale-content-popover .sniptale-glass-range:hover:not(:active)::-moz-range-thumb'
  );
  const mozThumbActiveBlock = readRuleBlock(
    '.sniptale-content-popover .sniptale-glass-range:active::-moz-range-thumb'
  );
  const thumbOffsetBlock = readRuleBlock(
    '.sniptale-content-popover .sniptale-glass-range::-webkit-slider-thumb',
    1
  );

  expectDarkSafeThumb(webkitThumbBlock);
  expectDarkSafeThumb(mozThumbBlock);
  expect(contentPopoverOwnerStylesheet).toContain('--sniptale-range-thumb-inner-inset: 5px;');
  expect(contentPopoverOwnerStylesheet).toContain('--sniptale-range-thumb-hover-inset: 2px;');
  expect(webkitThumbBlock).toContain('transition: box-shadow 0.18s ease-out;');
  expect(mozThumbBlock).toContain('transition: box-shadow 0.18s ease-out;');
  expect(webkitThumbHoverBlock).toContain(
    '--sniptale-range-thumb-inner-inset: var(--sniptale-range-thumb-hover-inset);'
  );
  expect(mozThumbHoverBlock).toContain(
    '--sniptale-range-thumb-inner-inset: var(--sniptale-range-thumb-hover-inset);'
  );
  expect(webkitThumbActiveBlock).toContain('--sniptale-range-thumb-inner-inset: 5px;');
  expect(webkitThumbActiveBlock).toContain('transition: none;');
  expect(mozThumbActiveBlock).toContain('--sniptale-range-thumb-inner-inset: 5px;');
  expect(mozThumbActiveBlock).toContain('transition: none;');
  expect(thumbOffsetBlock).toContain(
    'calc((var(--sniptale-range-track-height) - var(--sniptale-range-thumb-size)) / 2)'
  );
}

describe('content-popover range thumb contract', () => {
  it('keeps content popover range thumb dark-safe and centered', verifyRangeThumbContract);

  it('does not leak range fill variables into the content popover switch track', () => {
    expect(readRuleBlock('.sniptale-content-popover .sniptale-glass-switch')).not.toContain(
      '--sniptale-range-fill-ratio'
    );
  });
});
