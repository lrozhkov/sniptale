// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Group } from 'fabric';
import { createRoot, type Root } from 'react-dom/client';
import { createEditorVectorInstance } from '../../../features/editor/document/vector-element';
import { prepareEditorVectorDefinition } from '../../objects/vector-elements/prepare';
import { createEditorVectorRuntime } from '../../objects/vector-elements/runtime';
import { EditorVectorProperties } from './vector-tools';
import type { CompactColorSelectorProps } from '../../../ui/color-selector';
import type { EditorVectorStyleEdit } from '../../controller/public-api/vector-elements';

const mocks = vi.hoisted(() => ({
  objects: [] as unknown[],
  state: { layers: [{ id: 'vector', selected: true }], history: { index: 0 } },
  edit: { preview: vi.fn(() => true), commit: vi.fn(() => true), cancel: vi.fn() },
  controller: {
    canvas: { getActiveObjects: () => mocks.objects },
    beginVectorStyleEdit: vi.fn(),
    applyLayerTransformation: vi.fn(async () => {}),
  },
  session: { refresh: vi.fn(async () => {}), savePreset: vi.fn(async () => true) },
  library: { local: { presets: [] }, busy: false },
}));
vi.mock('../../application/controller-context', () => ({
  useEditorController: () => mocks.controller,
}));
vi.mock('../../application/vector-elements/context', () => ({
  useEditorVectorLibrarySession: () => mocks.session,
  useEditorVectorLibrarySnapshot: () => mocks.library,
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
}));
vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock('../../../ui/color-selector', () => ({
  CompactColorSelector: (props: CompactColorSelectorProps) => (
    <div>
      <button onClick={() => props.onOpenChange?.(true)}>open color</button>
      <button onClick={() => props.onPreviewChange?.('#00ff00')}>preview color</button>
      <button onClick={() => props.onChange('#00ff00')}>apply color</button>
      <button onClick={() => props.onPreviewReset?.(props.value)}>cancel color</button>
    </div>
  ),
}));
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.library.local.presets = [];
  mocks.library.busy = false;
  mocks.session.savePreset.mockResolvedValue(true);
  mocks.edit.preview.mockReturnValue(true);
  mocks.state.layers = [{ id: 'vector', selected: true }];
  mocks.state.history.index = 0;
  const definition = await prepareEditorVectorDefinition(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h10v10z" fill="currentColor"/></svg>',
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
  const group = await createEditorVectorRuntime(
    definition,
    createEditorVectorInstance(definition.id)
  );
  group.sniptaleId = 'vector';
  mocks.objects = [group];
  mocks.controller.beginVectorStyleEdit.mockResolvedValue(mocks.edit);
});
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function button(name: string) {
  const value = Array.from(host.querySelectorAll('button')).find(
    (value) => value.getAttribute('aria-label') === name || value.textContent === name
  );
  if (!value) throw new Error(`Missing button ${name}`);
  return value;
}
async function renderToolbar() {
  await act(async () => {
    root.render(<EditorVectorProperties />);
  });
}
async function click(name: string) {
  await act(async () => {
    button(name).click();
  });
}
describe('vector styling toolbar', () => {
  it.each(['cancel', 'unmount', 'selection'])(
    'refuses a delayed preview after %s',
    async (reason) => {
      let accept: (edit: EditorVectorStyleEdit) => void = () => {
        throw new Error('No pending edit');
      };
      mocks.controller.beginVectorStyleEdit.mockImplementationOnce(
        () =>
          new Promise<EditorVectorStyleEdit>((resolve) => {
            accept = resolve;
          })
      );
      await renderToolbar();
      await click('open color');
      await click('preview color');
      if (reason === 'cancel') await click('cancel color');
      else if (reason === 'unmount') await act(async () => root.render(null));
      else {
        mocks.objects = [];
        mocks.state.layers = [{ id: 'vector', selected: false }];
        await renderToolbar();
      }
      await act(async () => accept(mocks.edit));
      expect(mocks.edit.cancel).toHaveBeenCalled();
      expect(mocks.edit.preview).not.toHaveBeenCalled();
      expect(mocks.edit.commit).not.toHaveBeenCalled();
    }
  );
  it('previews color and confirms through one accepted controller commit', async () => {
    await renderToolbar();
    await click('open color');
    await click('preview color');
    expect(mocks.edit.preview).toHaveBeenCalledWith({ colors: { c0: '#00ff00' } });
    expect(mocks.edit.commit).not.toHaveBeenCalled();
    await click('apply color');
    expect(mocks.edit.commit).toHaveBeenCalledOnce();
  });
  it('cancels picker without committing history', async () => {
    await renderToolbar();
    await click('preview color');
    expect(mocks.edit.preview).toHaveBeenCalled();
    await click('cancel color');
    expect(mocks.edit.cancel).toHaveBeenCalled();
    expect(mocks.edit.commit).not.toHaveBeenCalled();
    expect(mocks.edit.commit).not.toHaveBeenCalled();
  });
  it('omits stroke scaling for an element with no strokes and keeps ordinary numeric inputs', async () => {
    await renderToolbar();
    expect(host.textContent).not.toContain('editor.elements.strokeScale');
    expect(host.querySelector('input[type="range"]')).toBeNull();
    expect(host.querySelector('input[aria-label="editor.elements.opacity"]')).not.toBeNull();
  });
});

async function selectMulticolorVector() {
  const definition = await prepareEditorVectorDefinition(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h10v10z" fill="#ff0000" stroke="#ff0000" stroke-width="1"/><path d="M10 10h10v10z" fill="#0000ff"/></svg>',
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
  const instance = createEditorVectorInstance(definition.id);
  instance.overrides.colors[definition.slots[0]!.id] = '#abcdef';
  instance.overrides.strokeScale = 2;
  const group = await createEditorVectorRuntime(definition, instance);
  group.sniptaleId = 'vector';
  mocks.objects = [group];
  return definition;
}
describe('vector selection commands', () => {
  it('cancels a color preview before horizontal and vertical reflection', async () => {
    await renderToolbar();
    await click('preview color');
    await click('editor.layerEffects.flipHorizontal');
    expect(mocks.edit.cancel).toHaveBeenCalled();
    expect(mocks.controller.applyLayerTransformation).toHaveBeenCalledWith(
      'vector',
      'flip-horizontal'
    );
    await click('editor.layerEffects.flipVertical');
    expect(mocks.controller.applyLayerTransformation).toHaveBeenCalledWith(
      'vector',
      'flip-vertical'
    );
    expect(mocks.edit.commit).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('editor.elements.reset');
    expect(host.textContent).not.toContain('editor.elements.presets');
  });
  it('closes and cancels the disclosure on Escape', async () => {
    await renderToolbar();
    await click('preview color');
    await act(async () =>
      button('preview color').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    );
    expect(mocks.edit.cancel).toHaveBeenCalled();
    expect(mocks.edit.commit).not.toHaveBeenCalled();
  });
  it('keeps opacity but omits shared styles and reflection for mixed definitions', async () => {
    const original = mocks.objects[0];
    await selectMulticolorVector();
    mocks.objects.push(original);
    await renderToolbar();
    expect(host.querySelector('input[aria-label="editor.elements.opacity"]')).not.toBeNull();
    expect(host.textContent).not.toContain('editor.elements.presets');
    expect(host.textContent).not.toContain('editor.elements.reset');
    expect(host.querySelector('[data-ui="editor.vector.flip-horizontal"]')).toBeNull();
  });
  it('renders no vector controls for a non-vector selection', async () => {
    mocks.objects = [new Group()];
    await renderToolbar();
    expect(host.textContent).toBe('');
  });
  it('reports a refused reflection without committing a style', async () => {
    mocks.controller.applyLayerTransformation.mockRejectedValueOnce(new Error('Refused'));
    await renderToolbar();
    await click('editor.layerEffects.flipHorizontal');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'editor.elements.operationFailed'
    );
    expect(mocks.edit.commit).not.toHaveBeenCalled();
  });
});

it('commits inline opacity on Enter without a subpanel, reset or presets', async () => {
  await renderToolbar();
  const input = host.querySelector<HTMLInputElement>('input[aria-label="editor.elements.opacity"]');
  if (!input) throw new Error('Missing opacity');
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '60');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(mocks.edit.preview).toHaveBeenCalledWith({ opacity: 0.6 });
  expect(mocks.edit.commit).toHaveBeenCalledOnce();
  expect(host.querySelector('input[type="range"]')).toBeNull();
  expect(host.textContent).not.toContain('editor.elements.presets');
  expect(host.textContent).not.toContain('editor.elements.reset');
});
