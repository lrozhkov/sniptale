// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { prepareEditorVectorDefinition, validateEditorVectorDefinition } from './prepare';
import {
  createEditorVectorInstance,
  isEditorVectorDefinition,
  isEditorVectorInstance,
  validateEditorVectorDefinitionDigest,
} from '../../../features/editor/document/vector-element';

const provenance = {
  sourceId: 'local',
  prefix: null,
  name: 'sample',
  author: null,
  authorUrl: null,
  license: null,
  licenseUrl: null,
};
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -3 24 30">${body}</svg>`;

describe('vector artwork preparation', () => {
  it('retains currentColor separately from explicit black and links matching paint', async () => {
    const definition = await prepareEditorVectorDefinition(
      svg(
        '<g fill="currentColor"><path d="M0 0h10v10z"/>' +
          '<rect x="1" y="2" width="3" height="4" rx="1" fill="black"/>' +
          '<circle r="2" fill="#000000"/></g>'
      ),
      provenance
    );
    expect(definition.viewBox).toEqual({ minX: -2, minY: -3, width: 24, height: 30 });
    expect(
      definition.slots.map((slot) => [slot.kind, slot.originalColor, slot.bindings.length])
    ).toEqual([
      ['current-color', '#000000', 1],
      ['explicit-color', '#000000', 2],
    ]);
    expect(definition.svg).toContain('rx="1"');
    expect(await validateEditorVectorDefinition(definition)).toEqual(definition);
    expect(await validateEditorVectorDefinitionDigest(definition)).toBe(true);
  });

  it('preserves own opacity, nested transforms, holes and smooth path commands', async () => {
    const definition = await prepareEditorVectorDefinition(
      svg(
        '<g opacity="0.5" transform="translate(2 3)"><g transform="rotate(15)">' +
          '<path fill-rule="evenodd" d="M0 0C1 2 3 4 5 6S7 8 9 10Q1 2 3 4T5 6A2 3 0 0 1 4 5Z"' +
          ' stroke="red" stroke-width="2"/></g></g>'
      ),
      provenance
    );
    expect(definition.svg).toContain('opacity="0.5"');
    expect(definition.svg).toContain('fill-rule="evenodd"');
    expect(definition.capabilities).toEqual({ palette: true, strokeScale: true });
    expect(await validateEditorVectorDefinition(definition)).toEqual(definition);
    const compactArc = await prepareEditorVectorDefinition(
      svg('<path d=" M0 0a2 3 0 011 2z "/>'),
      provenance
    );
    expect(await validateEditorVectorDefinition(compactArc)).toEqual(compactArc);
  });

  it('is deterministic and does not include library receipt time', async () => {
    const source = svg('<rect width="10" height="10" fill="red"/>');
    const first = await prepareEditorVectorDefinition(source, provenance);
    const second = await prepareEditorVectorDefinition(source, { ...provenance });
    expect(first).toEqual(second);
    expect(
      (await prepareEditorVectorDefinition(source, { ...provenance, sourceId: 'other' })).id
    ).not.toBe(first.id);
    const titled = await prepareEditorVectorDefinition(
      svg('<title>Name</title><desc>Artwork</desc><path d="M0 0h1v1z"/>'),
      provenance
    );
    expect(await validateEditorVectorDefinition(titled)).toEqual(titled);
    expect(Object.isFrozen(titled.slots[0]?.bindings)).toBe(true);
  });

  it.each([
    '<linearGradient/>',
    '<clipPath/>',
    '<mask/>',
    '<use href="#x"/>',
    '<text>font</text>',
    '<style>path{fill:red}</style>',
    '<script/>',
    '<image href="https://a.example/x"/>',
    '<path d="M0 0L1 1" onclick="alert(1)"/>',
    '<path d="M0 0L1 1" fill="url(#x)"/>',
    '<path d="M0 0L1 1" style="fill:red"/>',
    '<path d="M0 0X1 1"/>',
    '<path d="M0 0A1 1 0 3 0 1 1"/>',
    '<rect width="10%"/>',
    '<path d="M0 0" transform="translate(NaN)"/>',
  ])('refuses unsupported or unsafe profile before projection: %s', async (body) => {
    await expect(prepareEditorVectorDefinition(svg(body), provenance)).rejects.toThrow(
      'Vector element refused:'
    );
  });

  it('refuses DTD, entities and geometry/depth budgets', async () => {
    await expect(
      prepareEditorVectorDefinition(
        '<!DOCTYPE svg [<!ENTITY x "a">]>' + svg('<path d="M0 0"/>'),
        provenance
      )
    ).rejects.toThrow('unsafe-svg');
    await expect(
      prepareEditorVectorDefinition(svg('<path d="M0 0L131073 0"/>'), provenance)
    ).rejects.toThrow('budget-exceeded');
    await expect(
      prepareEditorVectorDefinition(
        svg('<g>'.repeat(41) + '<path d="M0 0"/>' + '</g>'.repeat(41)),
        provenance
      )
    ).rejects.toThrow('budget-exceeded');
    await expect(
      prepareEditorVectorDefinition(svg('<path d="M0 0"/>'.repeat(501)), provenance)
    ).rejects.toThrow('budget-exceeded');
  });

  it('refuses forged slots, payload and digest even when their structure is valid', async () => {
    const definition = await prepareEditorVectorDefinition(
      svg('<path d="M0 0h1v1z"/>'),
      provenance
    );
    const forged = { ...definition, svg: definition.svg.replace('h1', 'h2') };
    expect(isEditorVectorDefinition(forged)).toBe(true);
    await expect(validateEditorVectorDefinition(forged)).rejects.toThrow('invalid-definition');
    const instance = createEditorVectorInstance(definition.id);
    expect(isEditorVectorInstance(instance)).toBe(true);
    expect(isEditorVectorInstance({ ...instance, extra: true })).toBe(false);
    expect(
      isEditorVectorInstance({
        ...instance,
        overrides: { colors: { c0: 'url(x)' }, strokeScale: 1 },
      })
    ).toBe(false);
    expect(
      isEditorVectorDefinition({ ...definition, provenance: { ...provenance, receivedAt: 123 } })
    ).toBe(false);
  });
});

describe('bounded SVG lexical grammar', () => {
  it('preserves numeric values when sign, decimal and exponent tokens share boundaries', async () => {
    const source = svg('<path d="M0 0h1v1z"/>').replace('-2 -3 24 30', '-.5+.25 2e1 3.');
    const prepared = await prepareEditorVectorDefinition(source, provenance);
    expect(prepared.viewBox).toEqual({ minX: -0.5, minY: 0.25, width: 20, height: 3 });
  });

  it.each([
    'translate(+.5 -.25)',
    'translate(1. 2e+1)',
    'translate(1-2)',
    'translate(1.2.3)',
    'translate(1e-2+3E1)',
    'translate(,,1,,2,,)',
    'matrix(1 0 0 1 +.5 -.2)',
    'rotate(1e-2-3.4+.5)',
    'scale(1-2)',
  ])('preserves accepted number tokens in %s', async (transform) => {
    const prepared = await prepareEditorVectorDefinition(
      svg(`<path d="M0 0h1v1z" transform="${transform}"/>`),
      provenance
    );
    expect(prepared.svg).toContain(`transform="${transform}"`);
    expect(await validateEditorVectorDefinition(prepared)).toEqual(prepared);
  });

  it.each(['.', '+.', '0x10', 'Infinity', 'NaN', '1e+', '1e2e3', '1..'])(
    'rejects malformed numeric tokens %s',
    async (value) => {
      await expect(
        prepareEditorVectorDefinition(
          svg(`<path d="M0 0" transform="translate(${value})"/>`),
          provenance
        )
      ).rejects.toThrow('invalid-svg');
    }
  );

  it.each(['M0 0A1. 2e0 3 011e1-2', 'M0 0A.5+.6-3 01+1-2', 'M0 0A1 2 3 0 1 1.2.3'])(
    'preserves compact arc tokens in %s',
    async (path) => {
      const prepared = await prepareEditorVectorDefinition(svg(`<path d="${path}"/>`), provenance);
      expect(prepared.svg).toContain(`d="${path}"`);
    }
  );

  it.each([
    'M0 0A,1 2 3 0 1 2 3',
    'M0 0A1 2 3 21 2 3',
    'M0 0A1 2 3 0.0 1 2 3',
    'M0 0A1 2 3 1e0 2 3',
  ])('rejects malformed arc flag tokens in %s', async (path) => {
    await expect(
      prepareEditorVectorDefinition(svg(`<path d="${path}"/>`), provenance)
    ).rejects.toThrow('invalid-svg');
  });

  it.each(['none', 'xMinYMin', 'xMidYMax meet', 'xMaxYMid\t slice'])(
    'preserves aspect ratio grammar %s',
    async (aspect) => {
      await expect(
        prepareEditorVectorDefinition(
          svg('<path d="M0 0"/>').replace('viewBox=', `preserveAspectRatio="${aspect}" viewBox=`),
          provenance
        )
      ).resolves.toBeDefined();
    }
  );

  it.each([
    ' none',
    'none meet',
    'xMinYMin ',
    'xMinYMin\t',
    'xMiddleYMid',
    'xMidYMid meet slice',
    'xMidYMidmeet',
  ])('rejects unsupported aspect ratio grammar %s', async (aspect) => {
    await expect(
      prepareEditorVectorDefinition(
        svg('<path d="M0 0"/>').replace('viewBox=', `preserveAspectRatio="${aspect}" viewBox=`),
        provenance
      )
    ).rejects.toThrow('unsupported-svg');
  });

  it('preserves invalid-token precedence and magnitude budgets for long numeric input', async () => {
    const digits = '9'.repeat(100000);
    await expect(
      prepareEditorVectorDefinition(
        svg(`<path d="M0 0" transform="translate(${digits}x)"/>`),
        provenance
      )
    ).rejects.toThrow('invalid-svg');
    await expect(
      prepareEditorVectorDefinition(svg(`<path d="M0 0A${digits}x"/>`), provenance)
    ).rejects.toThrow('budget-exceeded');
    await expect(
      prepareEditorVectorDefinition(
        svg('<path d="M0 0" transform="translate(131073)"/>'),
        provenance
      )
    ).rejects.toThrow('budget-exceeded');
  });
});
