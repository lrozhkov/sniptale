import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import corpus from '../fixtures/structural/parity.json';
import lock from '../fixtures/structural/source-lock.json';
import { validateEffectV1Document, parseEffectV1Source } from '../index';

function replaceAtPath(
  document: unknown,
  path: readonly (string | number)[],
  value: unknown
): unknown {
  const [key, ...rest] = path;
  if (key === undefined) return structuredClone(value);
  if (Array.isArray(document) && typeof key === 'number') {
    return document.map((child: unknown, index: number) =>
      index === key ? replaceAtPath(child, rest, value) : child
    );
  }
  if (document !== null && typeof document === 'object' && !Array.isArray(document)) {
    const entries = Object.entries(document);
    const child: unknown = entries.find(([name]) => name === key)?.[1];
    return { ...document, [key]: replaceAtPath(child, rest, value) };
  }
  throw new Error(`Missing mutation parent at ${String(key)}`);
}

it.each(['authoring', 'retained'] as const)(
  'matches every frozen SDK structural case in %s mode',
  (presentationPolicy) => {
    const failures: {
      id: number;
      seed: string;
      path: (string | number)[];
      expected: boolean;
      actual: boolean;
    }[] = [];
    let accepted = 0;
    let count = 0;
    for (const group of corpus.cases) {
      const seed = corpus.seeds.find((entry) => entry.id === group.seed);
      if (!seed) throw new Error(`Missing seed ${group.seed}`);
      for (const variant of group.variants) {
        const document = replaceAtPath(seed.document, group.path, variant.value);
        const before = JSON.stringify(document);
        const result =
          presentationPolicy === 'authoring'
            ? validateEffectV1Document(document, { presentationPolicy })
            : parseEffectV1Source(before, { presentationPolicy });
        expect(JSON.stringify(document)).toBe(before);
        if (result.ok) accepted++;
        count++;
        if (result.ok !== variant.accepted) {
          failures.push({
            id: variant.id,
            seed: group.seed,
            path: group.path,
            expected: variant.accepted,
            actual: result.ok,
          });
        }
        if (!variant.accepted && !result.ok) expect(result.document).toBeUndefined();
      }
    }
    expect(count).toBe(lock.caseCount);
    expect(failures, `${failures.length} structural admission mismatches`).toEqual([]);
    expect(accepted).toBe(lock.acceptedCount);
  }
);

it('locks the structural corpus and the unchanged public schema', () => {
  for (const [path, expected] of [
    ['../fixtures/structural/parity.json', lock.paritySha256],
    ['../fixtures/sniptale-effect-v1.schema.json', lock.schemaSha256],
  ] as const) {
    const bytes = readFileSync(new URL(path, import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected);
  }
});
