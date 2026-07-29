// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { ElementSelectorAllocationError, getElementSelector } from './element';

afterEach(() => document.body.replaceChildren());

it('creates SVG selectors and can omit transient Sniptale identity', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('data-sniptale-id', 'temporary-1');
  circle.classList.add('chart-point');
  svg.append(circle);
  document.body.append(svg);

  expect(getElementSelector(circle)).toBe('[data-sniptale-id="temporary-1"]');
  expect(getElementSelector(circle, { includeSniptaleId: false })).toBe('circle.chart-point');
});

it('rejects detached targets and falls back to exact SVG paths and stable ids', () => {
  const orphan = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  expect(() => getElementSelector(orphan)).toThrow(ElementSelectorAllocationError);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const first = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  const second = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  svg.append(first, second);
  document.body.append(svg);

  expect(getElementSelector(second)).toBe('circle:nth-of-type(2)');
  second.id = 'point-2';
  expect(getElementSelector(second)).toBe('#point-2');
});

it('extends a structural selector until repeated deep SVG branches are exact', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const targets: SVGElement[] = [];

  for (let branchIndex = 0; branchIndex < 2; branchIndex += 1) {
    const branch = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let parent = branch;
    for (let depth = 0; depth < 6; depth += 1) {
      const child = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      parent.append(child);
      parent = child;
    }
    const target = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    parent.append(target);
    targets.push(target);
    svg.append(branch);
  }
  document.body.append(svg);

  const selector = getElementSelector(targets[1]!);

  expect(selector.split(' > ').length).toBeGreaterThan(5);
  expect(document.querySelectorAll(selector)).toHaveLength(1);
  expect(document.querySelector(selector)).toBe(targets[1]);
});

it('preserves case-sensitive SVG local names in round-trip selectors', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  svg.append(gradient, clipPath);
  document.body.append(svg);

  const gradientSelector = getElementSelector(gradient);
  const clipPathSelector = getElementSelector(clipPath);

  expect(gradientSelector).toContain('linearGradient');
  expect(clipPathSelector).toContain('clipPath');
  expect(document.querySelector(gradientSelector)).toBe(gradient);
  expect(document.querySelector(clipPathSelector)).toBe(clipPath);
});

it('escapes CSS-special SVG local names without losing case', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const dotted = document.createElementNS('http://www.w3.org/2000/svg', 'g.part');
  svg.append(dotted);
  document.body.append(svg);

  const selector = getElementSelector(dotted);

  expect(selector).toContain('g\\.part');
  expect(document.querySelectorAll(selector)).toHaveLength(1);
  expect(document.querySelector(selector)).toBe(dotted);
});

it('escapes hostile Sniptale identity values and round-trips to the exact element', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('data-sniptale-id', 'probe"] ~ circle[data-secret="value');
  svg.append(circle);
  document.body.append(svg);

  const selector = getElementSelector(circle);

  expect(selector).toContain('data-sniptale-id');
  expect(document.querySelectorAll(selector)).toHaveLength(1);
  expect(document.querySelector(selector)).toBe(circle);
});

it('rejects duplicate preferred identities and falls back to the exact element path', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const first = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  const second = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  first.id = 'duplicate';
  second.id = 'duplicate';
  first.setAttribute('data-sniptale-id', 'duplicate');
  second.setAttribute('data-sniptale-id', 'duplicate');
  svg.append(first, second);
  document.body.append(svg);

  const selector = getElementSelector(second);

  expect(selector).not.toContain('data-sniptale-id');
  expect(selector).not.toBe('#duplicate');
  expect(document.querySelectorAll(selector)).toHaveLength(1);
  expect(document.querySelector(selector)).toBe(second);
});
