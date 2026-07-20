import { expect } from 'vitest';

import { buildComputedStyleDiagnosticAsset, MAX_COMPUTED_STYLE_TARGETS } from './runtime';

type ComputedStyleAsset = {
  totalTargets: number;
  targets: Array<{
    elementRef: string;
    path: string;
    rect: {
      height: number;
      width: number;
      x: number;
      y: number;
    };
    styles: Record<string, string>;
    tagName: string;
  }>;
};

function getTargetByPath(asset: ComputedStyleAsset, path: string) {
  const target = asset.targets.find((entry) => entry.path === path);

  if (!target) {
    throw new Error(`Missing computed-style target for path: ${path}`);
  }

  return target;
}

export function readComputedStyleAsset(): ComputedStyleAsset {
  const asset = buildComputedStyleDiagnosticAsset();

  expect(asset.path).toBe('logs/css/computed-styles.json');

  if (typeof asset.content !== 'string') {
    throw new Error('Computed-style diagnostics should be serialized as JSON text');
  }

  return JSON.parse(asset.content) as ComputedStyleAsset;
}

export function expectVisibleTargetAsset(asset: ComputedStyleAsset) {
  const targetPaths = asset.targets.map((target) => target.path);
  const actionTarget = getTargetByPath(
    asset,
    'html > body > main > section > button:nth-of-type(2)'
  );
  const serializedAsset = JSON.stringify(asset);

  expect(asset.totalTargets).toBe(5);
  expect(targetPaths).toEqual([
    'html',
    'html > body',
    'html > body > main',
    'html > body > main > section',
    'html > body > main > section > button:nth-of-type(2)',
  ]);
  expect(targetPaths).not.toContain('button#zero-box');
  expect(targetPaths).not.toContain('button#extension-button');
  expect(serializedAsset).not.toContain('user-jane@example.com');
  expect(serializedAsset).not.toContain('cta');
  expect(serializedAsset).not.toContain('primary');
  expect(actionTarget.elementRef).toBe('e5');
  expect(actionTarget.rect).toEqual({
    height: 48.44,
    width: 200,
    x: 1.23,
    y: 6.79,
  });
  expect(actionTarget.styles).toEqual({
    color: 'rgb(255, 0, 0)',
    display: 'inline-flex',
    opacity: '1',
    visibility: 'visible',
  });
  expect(actionTarget.tagName).toBe('button');
}

export function expectCappedTargetAsset(asset: ComputedStyleAsset) {
  const targetPaths = asset.targets.map((target) => target.path);

  expect(asset.totalTargets).toBe(MAX_COMPUTED_STYLE_TARGETS);
  expect(asset.targets[0]?.rect).toEqual({
    height: 10,
    width: 0,
    x: 0,
    y: 0,
  });
  expect(targetPaths.at(-1)).toBe('html > body > button:nth-of-type(22)');
  expect(targetPaths).not.toContain('html > body > button:nth-of-type(23)');
}
