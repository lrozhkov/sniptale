// @vitest-environment jsdom
import { Canvas, Group } from 'fabric';
import { expect, it, vi } from 'vitest';
import { createEditorVectorInstance } from '../../../features/editor/document/vector-element';
import { prepareEditorVectorDefinition } from '../../objects/vector-elements/prepare';
import {
  createEditorVectorRuntime,
  previewEditorVectorRuntime,
  previewEditorVectorOpacity,
} from '../../objects/vector-elements/runtime';
import { renderEditorCanvasToDataUrl } from './export';
import { serializeCanvasObjects } from './serialization';

const provenance = {
  sourceId: 'local',
  prefix: null,
  name: null,
  author: null,
  authorUrl: null,
  license: null,
  licenseUrl: null,
};
it('exports accepted nested vectors while restoring exact live color stroke and opacity drafts', async () => {
  const definition = await prepareEditorVectorDefinition(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" fill="red" stroke="blue" stroke-width="2"/></svg>',
    provenance
  );
  const instance = createEditorVectorInstance(definition.id);
  const object = await createEditorVectorRuntime(definition, instance);
  const canvas = new Canvas(undefined, { width: 80, height: 80, renderOnAddRemove: false });
  canvas.add(new Group([new Group([object])], { left: 15, top: 15 }));
  const options = { format: 'png' as const, quality: 1 };
  try {
    canvas.renderAll();
    const accepted = renderEditorCanvasToDataUrl(canvas, options);
    const metadata = serializeCanvasObjects(canvas);
    previewEditorVectorRuntime(object, {
      ...instance,
      overrides: { colors: { c0: '#00ff00' }, strokeScale: 3 },
    });
    previewEditorVectorOpacity(object, 0.35);
    canvas.renderAll();
    const draft = canvas.lowerCanvasEl.toDataURL();
    expect(draft).not.toBe(accepted);
    expect(serializeCanvasObjects(canvas)).toBe(metadata);
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    const network = vi.spyOn(globalThis, 'fetch');
    try {
      expect(renderEditorCanvasToDataUrl(canvas, options)).toBe(accepted);
      expect(parse).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
      network.mockRestore();
    }
    expect(serializeCanvasObjects(canvas)).toBe(metadata);
    expect(object.opacity).toBe(0.35);
    canvas.renderAll();
    expect(canvas.lowerCanvasEl.toDataURL()).toBe(draft);
    const render = vi.spyOn(canvas, 'toCanvasElement').mockImplementationOnce(() => {
      throw new Error('draw refused');
    });
    expect(() => renderEditorCanvasToDataUrl(canvas, options)).toThrow('draw refused');
    render.mockRestore();
    expect(object.opacity).toBe(0.35);
    expect(serializeCanvasObjects(canvas)).toBe(metadata);
    canvas.renderAll();
    expect(canvas.lowerCanvasEl.toDataURL()).toBe(draft);
  } finally {
    await canvas.dispose();
  }
});
