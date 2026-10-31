import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import manifest from '../../../../../public/video-effects/collection.json';
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

it('ships admitted annotation controls with localized units, names and intentional widgets', () => {
  const annotations = manifest.effectDocuments.filter((entry) =>
    entry.path.startsWith('effects/annotations/')
  );
  expect(annotations).toHaveLength(6);
  for (const entry of annotations) {
    const source = readFileSync(`apps/extension/public/video-effects/${entry.path}`, 'utf8');
    expect(Buffer.byteLength(source)).toBe(entry.byteLength);
    expect(createHash('sha256').update(source).digest('hex')).toBe(entry.sha256);
    const parsed = readEffectPresentationDocument(source);
    expect(parsed.document, entry.id).toBeDefined();
    if (!parsed.document) throw new Error('Invalid shipped annotation');
    for (const control of parsed.document.controls) {
      expect(control.icon).toBeUndefined();
      for (const option of control.options ?? []) expect(option.icon).toBeUndefined();
      for (const locale of ['en', 'ru']) {
        expect(control.label?.[locale], `${entry.id}.${control.id}.${locale}`).toBeTruthy();
        expect(control.label?.[locale]).not.toMatch(/[%°]|\(px\)|\(%/u);
      }
      if (control.kind === 'number' && !control.options)
        expect(control.unit, `${entry.id}.${control.id}`).toBeTruthy();
      if (control.options)
        expect(control.presentation).toBe(control.id === 'sequence' ? 'segmented' : 'dropdown');
    }
  }
});

it.each(manifest.effectDocuments.filter((entry) => !entry.path.startsWith('effects/annotations/')))(
  'ships readable parameter units for $id',
  (entry) => {
    const source = readFileSync(`apps/extension/public/video-effects/${entry.path}`, 'utf8');
    expect(Buffer.byteLength(source)).toBe(entry.byteLength);
    expect(createHash('sha256').update(source).digest('hex')).toBe(entry.sha256);
    const parsed = readEffectPresentationDocument(source);
    expect(parsed.document, entry.id).toBeDefined();
    if (!parsed.document) throw new Error('Invalid shipped effect');
    for (const control of parsed.document.controls) {
      expect(control.icon).toBeUndefined();
      for (const option of control.options ?? []) expect(option.icon).toBeUndefined();
      for (const locale of ['en', 'ru']) {
        expect(control.label?.[locale], `${entry.id}.${control.id}.${locale}`).toBeTruthy();
        expect(control.label?.[locale]).not.toMatch(/[%°]|\((?:px|Hz|Гц)\)/u);
      }
      if (control.kind === 'number' && !control.options)
        expect(control.unit, `${entry.id}.${control.id}`).toBeTruthy();
      if (control.id === 'edge') expect(control.label?.en).toBe('Fade duration');
      if (entry.id === 'sniptale-video-grain' && control.id === 'speed')
        expect(control.unit).toBe('hz');
    }
  }
);

it.each(['sniptale-title', 'sniptale-callout'])(
  'keeps optional nested icons absent when they add no accurate distinction in %s',
  (id) => {
    const entry = manifest.effectDocuments.find((entry) => entry.id === id)!;
    const source = readFileSync(`apps/extension/public/video-effects/${entry.path}`, 'utf8');
    const document = readEffectPresentationDocument(source).document!;
    expect(document.controlGroups).toHaveLength(1);
    expect(document.controlGroups?.[0]?.icon).toBeUndefined();
  }
);
