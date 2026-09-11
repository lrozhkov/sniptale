import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readEffectPresentationDocument } from './presentation-document';

const source = readFileSync(
  'packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-callout.sniptale-effect.json',
  'utf8'
);

it('shares frozen metadata for exact sources and validates changed sources', () => {
  const first = readEffectPresentationDocument(source);
  expect(first.document).toBeDefined();
  expect(readEffectPresentationDocument(source)).toBe(first);
  expect(Object.isFrozen(first.document!.program.commands)).toBe(true);
  expect(() => {
    first.document!.program.commands.length = 0;
  }).toThrow();
  expect(readEffectPresentationDocument('{}').document).toBeUndefined();
  expect(readEffectPresentationDocument(source + '\n')).not.toBe(first);
});

it('evicts least recently used documents instead of retaining every catalog forever', () => {
  const oldest = readEffectPresentationDocument(source + ' ');
  for (let i = 0; i < 32; i++) readEffectPresentationDocument(source + '\n'.repeat(i + 1));
  expect(readEffectPresentationDocument(source + ' ')).not.toBe(oldest);
});

it('does not retain oversized sources', () => {
  const large = source + ' '.repeat(2 * 1024 * 1024);
  expect(readEffectPresentationDocument(large)).not.toBe(readEffectPresentationDocument(large));
});
