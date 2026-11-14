import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recipesFor,
  requiredFontText,
  renderRecipe,
  SPLIT_DEFINITION,
  splitDefinitionFor,
} from './corpus-recipes.mjs';

test('full design covers face/family pairs and independent template holdout', () => {
  const cases = recipesFor({ profile: 'full', seed: 1 });
  assert.equal(cases.length, 70);
  assert.equal(new Set(cases.map((entry) => entry.id)).size, cases.length);
  assert.ok(cases.reduce((total, entry) => total + entry.fragments.length, 0) >= 700);
  const textCases = cases.filter((entry) => entry.fragments.length);
  const faces = new Set(textCases.map((entry) => entry.fragments[0].fontId));
  for (const face of faces) {
    const own = textCases.filter((entry) => entry.fragments[0].fontId === face);
    assert.equal(new Set(own.map((entry) => entry.family)).size, 6);
    assert.equal(new Set(own.map((entry) => entry.size)).size, 5);
    assert.equal(new Set(own.map((entry) => entry.palette.id)).size, 5);
  }
  for (const entry of cases) assert.ok(SPLIT_DEFINITION[entry.split].includes(entry.family));
  assert.equal(
    SPLIT_DEFINITION.tuning.some((family) => SPLIT_DEFINITION.holdout.includes(family)),
    false
  );
  assert.deepEqual(
    new Set(textCases.map((entry) => entry.tags.find((tag) => tag.startsWith('roi-')))),
    new Set(['roi-inside', 'roi-edge', 'roi-partial'])
  );
});

test('seed controls text reproducibly; smoke retains scripts, negative and holdout', () => {
  const cases = recipesFor({ seed: 17 });
  assert.equal(cases.length, 8);
  assert.deepEqual(cases, recipesFor({ seed: 17 }));
  assert.notDeepEqual(cases, recipesFor({ seed: 18 }));
  const fonts = requiredFontText(cases);
  for (const id of [
    'sans',
    'serif-italic',
    'mono',
    'handwriting-latin',
    'handwriting-cyrillic',
    'arabic',
    'cjk',
  ])
    assert.ok(fonts[id]);
  assert.ok(cases.some((entry) => !entry.fragments.length));
  assert.ok(cases.some((entry) => entry.split === 'holdout'));
  assert.ok(
    cases
      .filter((entry) => entry.fragments.length)
      .every((entry) => [...entry.fragments[6].text].length === 1)
  );
  assert.ok(renderRecipe(cases[0]).includes('visibility:hidden'));
  assert.ok(!renderRecipe(cases[0]).includes('<script'));
  assert.throws(() => recipesFor({ profile: 'tiny' }));
  assert.throws(() => recipesFor({ seed: -1 }));
});

test('script dictionaries keep phrase diversity instead of exposing PRNG low-bit cycles', () => {
  const cases = recipesFor({ profile: 'full', seed: 1 });
  for (const face of ['arabic', 'cjk', 'handwriting-latin', 'handwriting-cyrillic']) {
    const texts = new Set(
      cases
        .filter((entry) => entry.fragments[0]?.fontId === face)
        .flatMap((entry) => entry.fragments.slice(0, 8).map((fragment) => fragment.text))
        .filter((text) => [...text].length > 1)
    );
    assert.ok(texts.size >= 3, `${face} must retain at least three dictionary phrases`);
  }
});

test('refreshed holdout changes independent layouts while preserving every tuning recipe', () => {
  for (const seed of [0, 1, 19, 0xffffffff]) {
    const original = recipesFor({ profile: 'full', seed });
    const refreshed = recipesFor({ profile: 'full', seed, holdoutRevision: 2 });
    const tuning = original.filter((entry) => entry.split === 'tuning');
    assert.equal(tuning.length, 48);
    assert.deepEqual(
      refreshed.filter((entry) => entry.split === 'tuning'),
      tuning
    );
    assert.deepEqual(
      refreshed.filter((entry) => entry.split === 'tuning').map(renderRecipe),
      tuning.map(renderRecipe)
    );
    const holdout = refreshed.filter((entry) => entry.split === 'holdout');
    assert.equal(holdout.length, 22);
    assert.ok(holdout.every((entry) => !original.some((old) => old.id === entry.id)));
    assert.deepEqual(new Set(holdout.map((entry) => entry.family)), new Set(['forms', 'timeline']));
    for (const entry of holdout) {
      assert.ok(splitDefinitionFor(2).holdout.includes(entry.family));
      if (entry.family === 'forms') {
        assert.equal(new Set(entry.fragments.map((fragment) => fragment.x)).size, 4);
        assert.ok(renderRecipe(entry).includes('rx="3"'));
      } else {
        assert.equal(new Set(entry.fragments.map((fragment) => fragment.x)).size, 1);
        assert.ok(
          entry.fragments.every((fragment) => fragment.align === 'left' && fragment.x > 108)
        );
        assert.ok(renderRecipe(entry).includes('M72 22V666'));
      }
    }
    assert.deepEqual(recipesFor({ profile: 'full', seed }), original);
  }
  assert.deepEqual(splitDefinitionFor(1), SPLIT_DEFINITION);
  assert.equal(splitDefinitionFor(2).version, 2);
  const smoke = recipesFor({ holdoutRevision: 2 });
  assert.equal(smoke.length, 8);
  assert.deepEqual(
    smoke.filter((entry) => entry.split === 'holdout').map((entry) => entry.family),
    ['forms', 'timeline']
  );
  for (const holdoutRevision of [0, 3, '2', null])
    assert.throws(() => recipesFor({ holdoutRevision }), /holdout revision/);
});
