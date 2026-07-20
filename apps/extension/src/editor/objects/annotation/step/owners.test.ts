import { expect, it } from 'vitest';
import { resolveStepGroupGeometry } from './geometry';
import { assignStepMetadata } from './metadata';
import { resolveStepOpacity, resolveStepText } from './style';

it('keeps size-level geometry in the step geometry owner', () => {
  expect(resolveStepGroupGeometry(3)).toEqual(
    expect.objectContaining({
      fontSize: 22.950000000000003,
      radius: 21.6,
    })
  );
  expect(resolveStepGroupGeometry(6).radius).toBeCloseTo(28.8);
});

it('keeps step opacity and empty-value rules in the style owner', () => {
  expect(resolveStepOpacity(Number.NaN)).toBe(1);
  expect(resolveStepOpacity(2)).toBe(1);
  expect(resolveStepText({ type: 'manual', value: '' } as never)).toBe('');
  expect(resolveStepText({ type: 'number', value: '' } as never)).toBe('1');
});

it('keeps persisted step fields in the metadata owner', () => {
  const group = {};

  assignStepMetadata(
    group as never,
    {
      alphabet: 'latin',
      color: '#ff671d',
      opacity: 0.5,
      sizeLevel: 4,
      strokeColor: '#111111',
      strokeOpacity: 0.75,
      strokeWidth: 3,
      textColor: '#ffffff',
      type: 'manual',
      value: 'QA',
    } as never
  );

  expect(group).toMatchObject({
    sniptaleStepAlphabet: 'latin',
    sniptaleStepColor: '#ff671d',
    sniptaleStepSizeLevel: 4,
    sniptaleStepType: 'manual',
    sniptaleStepValue: 'QA',
  });
});
