import { expect, it } from 'vitest';
import { createSourceImageFilter } from './contract';
import { compileSourceImageFilters } from './plan';
const logical = { width: 640, height: 360 };
it('makes neutral stack a true borrowed-source identity with no scratch or passes', () => {
  const plan = compileSourceImageFilters(
    { version: 1, filters: [createSourceImageFilter('color', 'neutral')] },
    logical
  );
  expect(plan).toMatchObject({ result: -1, scratchCount: 0, steps: [] });
});
it('orders filters, holds each original and never aliases a sampled target', () => {
  const stack = {
    version: 1,
    filters: Array.from({ length: 16 }, (_, i) =>
      createSourceImageFilter(i % 2 ? 'bloom' : 'blur', String(i))
    ),
  };
  const before = structuredClone(stack),
    plan = compileSourceImageFilters(stack, logical);
  expect(plan.scratchCount).toBeLessThanOrEqual(3);
  expect(plan.steps.length).toBeGreaterThan(64);
  for (const step of plan.steps) {
    expect(step.output).not.toBe(step.input);
    expect(step.output).not.toBe(step.base);
    expect(Object.isFrozen(step)).toBe(true);
  }
  expect(stack).toEqual(before);
  stack.filters[0]!.intensity = 0;
  expect(plan.steps.length).toBeGreaterThan(64);
});
it('uses upstream four-pass Kawase offsets in source logical pixels and blends intensity only once', () => {
  const blur = { ...createSourceImageFilter('blur', 'blur'), intensity: 0.25 };
  const plan = compileSourceImageFilters({ version: 1, filters: [blur] }, logical);
  expect(plan.steps.map((step) => step.kind)).toEqual([
    'kawase',
    'kawase',
    'kawase',
    'kawase',
    'mix',
  ]);
  expect(plan.steps.slice(0, 4).map((step) => step.values[0])).toEqual([8.5, 6.5, 4.5, 2.5]);
  expect(plan.steps.at(-1)?.values).toEqual([0.25]);
});
it.each([
  { width: 0, height: 1 },
  { width: Infinity, height: 1 },
  { width: 1, height: NaN },
])('refuses invalid logical coordinates %j', (size) => {
  expect(() => compileSourceImageFilters({ version: 1, filters: [] }, size)).toThrow();
});

it('snapshots all seed and project tick bits without using the source timestamp or a retained counter', () => {
  const grain = createSourceImageFilter('grain', 'grain');
  if (grain.kind !== 'grain') throw new Error('Expected grain');
  grain.parameters.seed = 4294967295;
  const value = { version: 1, filters: [grain] },
    time = 123456.75;
  const first = compileSourceImageFilters(value, logical, time);
  compileSourceImageFilters(value, logical, 99);
  expect(compileSourceImageFilters(value, logical, time)).toEqual(first);
  const step = first.steps[0]!,
    tick = Math.floor(time * 30) >>> 0;
  expect(step.values).toEqual([0.1, 65535, 65535, tick & 65535, tick >>> 16, 1]);
  expect(Object.isFrozen(step.values)).toBe(true);
  grain.parameters.seed = 0;
  expect(step.values.slice(1, 3)).toEqual([65535, 65535]);
});
it.each([NaN, Infinity, Number.MAX_VALUE])(
  'refuses nonrepresentable project time %s before rendering',
  (time) => {
    expect(() =>
      compileSourceImageFilters(
        { version: 1, filters: [createSourceImageFilter('grain', 'grain')] },
        logical,
        time
      )
    ).toThrow();
  }
);
