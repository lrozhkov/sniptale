// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as svgSanitizer from '@sniptale/platform/security/sanitizers/svg';
import {
  computeEditorVectorDefinitionDigest,
  createEditorVectorInstance,
  isEditorVectorDefinition,
  validateEditorVectorDefinitionDigest,
} from '../../../features/editor/document/vector-element';
import { prepareEditorVectorDefinition } from './prepare';
import {
  createEditorVectorRuntime,
  previewEditorVectorRuntime,
  updateEditorVectorRuntime,
} from './runtime';
import accepted from './prepare.accepted-fixtures.json';

const observations = vi.hoisted(() => ({ fabricInputs: [] as string[] }));
vi.mock('fabric', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fabric')>();
  return {
    ...actual,
    loadSVGFromString: vi.fn<typeof actual.loadSVGFromString>((...arguments_) => {
      observations.fabricInputs.push(arguments_[0]);
      return actual.loadSVGFromString(...arguments_);
    }),
  };
});

beforeEach(() => {
  observations.fabricInputs.length = 0;
});
afterEach(() => vi.restoreAllMocks());

it('passes only revalidated XML to Fabric after currentColor materialization and serialization', async () => {
  const definition = await prepareEditorVectorDefinition(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<g color="red" transform="translate(1 2)" opacity="0.5">' +
      '<path d="M0 0h10v10z" fill="currentColor" stroke="blue"/></g></svg>',
    accepted[0]!.definition.provenance
  );
  const group = await createEditorVectorRuntime(
    definition,
    createEditorVectorInstance(definition.id)
  );
  try {
    expect(observations.fabricInputs).toHaveLength(1);
    const serialized = observations.fabricInputs[0]!;
    const parsed = new DOMParser().parseFromString(serialized, 'image/svg+xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    const path = parsed.querySelector('path');
    expect(path?.getAttribute('fill')).toBe('#ff0000');
    expect(path?.getAttribute('stroke')).toBe('#0000ff');
    expect(parsed.querySelector('g')?.getAttribute('opacity')).toBe('0.5');
    expect(parsed.querySelector('g')?.getAttribute('transform')).toBe('translate(1 2)');
    expect(parsed.querySelector('script,style,foreignObject,image,use,a')).toBeNull();
    for (const element of parsed.querySelectorAll('*')) {
      expect(element.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(Array.from(element.attributes).some((attribute) => /^on/iu.test(attribute.name))).toBe(
        false
      );
      expect(element.hasAttribute('style')).toBe(false);
      expect(element.hasAttribute('href')).toBe(false);
    }
    const reparsed = new XMLSerializer().serializeToString(parsed);
    const admitted = await prepareEditorVectorDefinition(reparsed, definition.provenance);
    expect(admitted.viewBox).toEqual(definition.viewBox);
    expect(admitted.svg).toContain('fill="#ff0000"');
    expect(group.getObjects()).toHaveLength(1);
  } finally {
    group.dispose();
  }
});

it('keeps palette previews and object transforms off the sanitization path', async () => {
  const definition = await prepareEditorVectorDefinition(
    accepted[0]!.source,
    accepted[0]!.definition.provenance
  );
  const instance = createEditorVectorInstance(definition.id);
  const group = await createEditorVectorRuntime(definition, instance);
  const sanitize = vi.spyOn(svgSanitizer, 'sanitizeSvgFragment');
  try {
    const styled = { ...instance, overrides: { colors: { c0: '#00ff00' }, strokeScale: 1 } };
    previewEditorVectorRuntime(group, styled);
    updateEditorVectorRuntime(group, styled);
    group.set({ left: 10, top: 15, scaleX: 2, scaleY: 0.5, angle: 25 });
    group.setCoords();
    expect(sanitize).not.toHaveBeenCalled();
    expect(observations.fabricInputs).toHaveLength(1);
    expect(group.sniptaleVectorElement?.overrides.colors).toEqual({ c0: '#00ff00' });
  } finally {
    group.dispose();
  }
});

it('refuses a correctly hashed hostile saved definition before Fabric sees it', async () => {
  const previous = accepted[0]!.definition;
  if (!isEditorVectorDefinition(previous)) throw new Error('Invalid accepted fixture');
  const source = {
    ...previous,
    svg: previous.svg.replace(
      '</svg>',
      '<image href="https://svg-attacker.invalid/restored"/></svg>'
    ),
  };
  const forged = { ...source, id: await computeEditorVectorDefinitionDigest(source) };
  expect(await validateEditorVectorDefinitionDigest(forged)).toBe(true);
  await expect(
    createEditorVectorRuntime(forged, createEditorVectorInstance(forged.id))
  ).rejects.toThrow('Vector element refused:');
  expect(observations.fabricInputs).toEqual([]);
});
