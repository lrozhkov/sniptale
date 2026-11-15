// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { prepareEditorVectorDefinition } from '../../objects/vector-elements/prepare';
import { createEditorIconAppearance, getEditorVectorPresentation } from './presentation';

async function prepare(content: string) {
  return prepareEditorVectorDefinition(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${content}</svg>`,
    {
      sourceId: 'local',
      prefix: null,
      name: null,
      author: null,
      authorUrl: null,
      license: null,
      licenseUrl: null,
    }
  );
}
function preview(url: string) {
  return new DOMParser().parseFromString(decodeURIComponent(url.split(',')[1]!), 'image/svg+xml');
}
describe('catalog appearance rendering', () => {
  it.each([false, true])('preserves alpha when changing monochrome ink (dark=%s)', async (dark) => {
    const definition = await prepare(
      '<path d="M0 0h10v10z" fill="#ff000080"/><path d="M10 10h10v10z" fill="#ff000000"/>'
    );
    const original = JSON.stringify(definition);
    const result = getEditorVectorPresentation(definition, dark);
    const ink = dark ? '#f5f5f5' : '#202020';
    expect(Object.values(result.colors)).toContain(`${ink}80`);
    expect(Object.values(result.colors)).toContain(`${ink}00`);
    expect(preview(result.previewUrl).querySelector('path')?.getAttribute('fill')).toBe(`${ink}80`);
    expect(JSON.stringify(definition)).toBe(original);
  });
  it('preserves multicolor artwork and applies only explicit palette, opacity and stroke changes', async () => {
    const definition = await prepare(
      '<path d="M0 0h10v10z" fill="#ff000080" stroke="#0000ff" stroke-width="2"/>'
    );
    const original = JSON.stringify(definition);
    const themed = getEditorVectorPresentation(definition, true);
    expect(themed.colors).toEqual({});
    const result = getEditorVectorPresentation(definition, {
      ...createEditorIconAppearance(true),
      colors: { '#ff000080': '#00ff00' },
      opacity: 0.6,
      strokeScale: 1.5,
    });
    const document = preview(result.previewUrl);
    expect(document.querySelector('path')?.getAttribute('fill')).toBe('#00ff0080');
    expect(document.querySelector('path')?.getAttribute('stroke')).toBe('#0000ff');
    expect(document.querySelector('path')?.getAttribute('stroke-width')).toBe('3');
    expect(document.documentElement.getAttribute('opacity')).toBe('0.6');
    expect(result.opacity).toBe(0.6);
    expect(result.strokeScale).toBe(1.5);
    expect(JSON.stringify(definition)).toBe(original);
  });
});
