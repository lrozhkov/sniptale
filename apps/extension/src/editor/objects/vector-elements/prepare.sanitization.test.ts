// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as svgSanitizer from '@sniptale/platform/security/sanitizers/svg';
import {
  computeEditorVectorDefinitionDigest,
  isEditorVectorDefinition,
  validateEditorVectorDefinitionDigest,
} from '../../../features/editor/document/vector-element';
import { prepareEditorVectorDefinition, validateEditorVectorDefinition } from './prepare';
import accepted from './prepare.accepted-fixtures.json';

const provenance = accepted[0]!.definition.provenance;
const shape = '<path d="M0 0h10v10z" fill="currentColor"/>';
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;

afterEach(() => vi.restoreAllMocks());

describe('strict admission before SVG sanitization', () => {
  it.each([
    '<script>globalThis.svgAttackExecuted=1</script>',
    '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject>',
    '<g xmlns="http://www.w3.org/1999/xhtml"><script>bad()</script></g>',
    '<g xmlns:x="http://www.w3.org/1999/xlink"><use x:href="javascript:bad()"/></g>',
    '<image href="https://svg-attacker.invalid/image"/>',
    '<a href="https://svg-attacker.invalid/"><path d="M0 0h1z"/></a>',
    '<use href="#other"/>',
    '<style>@import "https://svg-attacker.invalid/style";</style>',
    '<path d="M0 0" onload="bad()"/>',
    '<path d="M0 0" ONLOAD="bad()"/>',
    '<path d="M0 0" fill="u&#114;l(https://svg-attacker.invalid/fill)"/>',
    '<path d="M0 0" style="fill: red"/>',
    '<path d="M0 0" fill="var(--paint)"/>',
    '<path d="M0 0" href="java&#x73;cript:bad()"/>',
    '<path d="M0 0" href="data:image/svg+xml,attack"/>',
    '<animate attributeName="href" values="javascript:bad()"/>',
    '<defs><linearGradient id="paint"/></defs>',
    '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>',
    '<text>Unsupported text</text>',
    '<g xmlns="http://www.w3.org/1998/Math/MathML"><mtext><style><!--</style></mtext></g>',
  ])('refuses the complete artwork instead of deleting unsupported content: %s', async (body) => {
    const sanitize = vi.spyOn(svgSanitizer, 'sanitizeSvgFragment');
    await expect(prepareEditorVectorDefinition(svg(shape + body), provenance)).rejects.toThrow(
      'Vector element refused:'
    );
    expect(sanitize).not.toHaveBeenCalled();
  });

  it.each([
    '<!DOCTYPE svg [<!ENTITY payload SYSTEM "https://svg-attacker.invalid/entity">]>',
    '<?xml-stylesheet href="https://svg-attacker.invalid/style"?>',
  ])('rejects declarations before XML parsing: %s', async (prefix) => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    await expect(prepareEditorVectorDefinition(prefix + svg(shape), provenance)).rejects.toThrow(
      'unsafe-svg'
    );
    expect(parse).not.toHaveBeenCalled();
  });

  it('retains the exact accepted raw byte boundary before canonicalization', async () => {
    const base = svg(shape);
    const padding = ' '.repeat(2097152 - new TextEncoder().encode(base).byteLength);
    const input = svg(padding + shape);
    expect(new TextEncoder().encode(input)).toHaveLength(2097152);
    await expect(prepareEditorVectorDefinition(input, provenance)).resolves.toBeDefined();
  });

  it('enforces the UTF-8 size bound before parsing or sanitization', async () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    const sanitize = vi.spyOn(svgSanitizer, 'sanitizeSvgFragment');
    const input = svg(`<desc>${'😀'.repeat(524288)}</desc>${shape}`);
    expect(input.length).toBeLessThan(2097152);
    await expect(prepareEditorVectorDefinition(input, provenance)).rejects.toThrow(
      'budget-exceeded'
    );
    expect(parse).not.toHaveBeenCalled();
    expect(sanitize).not.toHaveBeenCalled();
  });
});

describe('existing resource limits before DOMPurify', () => {
  it.each([
    ['depth', '<g>'.repeat(41) + shape + '</g>'.repeat(41)],
    ['nodes', '<g/>'.repeat(5000) + shape],
    ['shapes', '<path d="M0 0"/>'.repeat(501)],
    ['commands', `<path d="M0 0${'L1 1'.repeat(5000)}"/>`],
    ['numeric magnitude', '<path d="M0 0L131073 0"/>'],
    ['transforms', `<path d="M0 0" transform="${'translate(0) '.repeat(41)}"/>`],
  ])('rejects the exceeded %s budget before sanitization', async (_name, body) => {
    const sanitize = vi.spyOn(svgSanitizer, 'sanitizeSvgFragment');
    await expect(prepareEditorVectorDefinition(svg(body), provenance)).rejects.toThrow(
      'budget-exceeded'
    );
    expect(sanitize).not.toHaveBeenCalled();
  });

  it.each([
    ['depth', '<g>'.repeat(39) + shape + '</g>'.repeat(39)],
    ['nodes', '<g/>'.repeat(4998) + shape],
    ['shapes', '<path d="M0 0"/>'.repeat(500)],
    ['commands', `<path d="M0 0${'L1 1'.repeat(4999)}"/>`],
    ['numeric magnitude', '<path d="M0 0L131072 0"/>'],
    ['transforms', `<path d="M0 0" transform="${'translate(0) '.repeat(40)}"/>`],
  ])('preserves the accepted %s boundary', async (_name, body) => {
    await expect(prepareEditorVectorDefinition(svg(body), provenance)).resolves.toBeDefined();
  });
});

describe('sanitizer result admission', () => {
  it('passes admitted canonical artwork through the shared sanitizer', async () => {
    const sanitize = vi.spyOn(svgSanitizer, 'sanitizeSvgFragment');
    const prepared = await prepareEditorVectorDefinition(svg(shape), provenance);
    expect(sanitize).toHaveBeenCalledOnce();
    expect(sanitize.mock.calls[0]?.[0]).toBe(prepared.svg);
    expect(prepared.svg).toContain('fill="currentColor"');
  });

  it.each([
    ['geometry', (input: string) => input.replace('h10', 'h9')],
    ['palette', (input: string) => input.replace('fill="currentColor"', 'fill="red"')],
    ['opacity', (input: string) => input.replace('<path ', '<path opacity="0.5" ')],
    ['missing artwork', (input: string) => input.replace(/<path\b[^>]*><\/path>/u, '')],
    [
      'injected namespace',
      (input: string) => input.replace('http://www.w3.org/2000/svg', 'urn:foreign'),
    ],
    ['injected event', (input: string) => input.replace('<path ', '<path onclick="bad()" ')],
  ])('refuses a sanitizer result with %s changes', async (_name, change) => {
    vi.spyOn(svgSanitizer, 'sanitizeSvgFragment').mockImplementation((input) => change(input));
    await expect(prepareEditorVectorDefinition(svg(shape), provenance)).rejects.toThrow(
      'Vector element refused:'
    );
  });

  it('fails closed if the sanitizer cannot produce a safe result', async () => {
    vi.spyOn(svgSanitizer, 'sanitizeSvgFragment').mockReturnValue(null);
    await expect(prepareEditorVectorDefinition(svg(shape), provenance)).rejects.toThrow(
      'unsafe-svg'
    );
  });

  it('preserves admitted padded geometry tokens across sanitize, serialization and saved validation', async () => {
    const source = svg(
      '<g opacity=" 0.5 " transform=" translate(1 2) ">' +
        '<path d=" M0 0h10v10z " stroke-width=" 2 "/>' +
        '<rect x=" 1 " y=" 2 " width=" 3 " height=" 4 "/>' +
        '</g>'
    );
    const prepared = await prepareEditorVectorDefinition(source, provenance);
    expect(prepared.svg).toContain('opacity=" 0.5 "');
    expect(prepared.svg).toContain('transform=" translate(1 2) "');
    expect(prepared.svg).toContain('d=" M0 0h10v10z "');
    expect(prepared.svg).toContain('stroke-width=" 2 "');
    expect(prepared.svg).toContain('x=" 1 "');
    expect(await validateEditorVectorDefinition(prepared)).toEqual(prepared);
  });

  it.each(accepted)(
    'preserves the complete legacy definition and serialized reparses for $name',
    async (row) => {
      const prepared = await prepareEditorVectorDefinition(row.source, row.definition.provenance);
      expect(prepared).toEqual(row.definition);
      const reparsed = new DOMParser().parseFromString(prepared.svg, 'image/svg+xml');
      const serialized = new XMLSerializer().serializeToString(reparsed);
      expect(await prepareEditorVectorDefinition(serialized, prepared.provenance)).toEqual(
        prepared
      );
      expect(await validateEditorVectorDefinition(row.definition)).toEqual(row.definition);
    }
  );

  it.each([
    '<script>globalThis.svgAttackExecuted=1</script>',
    '<image href="https://svg-attacker.invalid/restore"/>',
    '<path d="M0 0" onclick="bad()"/>',
  ])('rejects a forged saved definition with a matching recomputed digest: %s', async (payload) => {
    const previous = accepted[0]!.definition;
    if (!isEditorVectorDefinition(previous)) throw new Error('Invalid accepted fixture');
    const source = { ...previous, svg: previous.svg.replace('</svg>', `${payload}</svg>`) };
    const forged = { ...source, id: await computeEditorVectorDefinitionDigest(source) };
    expect(isEditorVectorDefinition(forged)).toBe(true);
    expect(await validateEditorVectorDefinitionDigest(forged)).toBe(true);
    await expect(validateEditorVectorDefinition(forged)).rejects.toThrow('Vector element refused:');
    expect(previous).toEqual(accepted[0]!.definition);
  });
});
