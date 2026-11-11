// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Canvas, Rect } from 'fabric';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { ImageAIInspector } from './inspector';
import { ImageAttachments } from './attachments';
import { ImageParametersEditor } from './parameters';
import { createImageEditorSession, type ImageEditorSession } from './session';
import type {
  EditorImageSnapshot,
  ImageApplyController,
  ImageBounds,
} from '../controller/ai-image/types';
import type { requestAIScenarioModelSelection } from '../../workflows/ai-settings/query';
import type { ImageParameters } from '../../contracts/ai/image';
import { resolveImageModelProfile } from '../../contracts/ai/image-profile';

type Catalog = Awaited<ReturnType<typeof requestAIScenarioModelSelection>>;
const io = vi.hoisted(() => ({
  read: vi.fn<typeof import('../../workflows/ai-settings/query').requestAIScenarioModelSelection>(),
  remember: vi.fn(async () => {}),
  maintain: vi.fn(async () => {}),
  readFile: vi.fn<(_: Blob) => Promise<string>>(),
  current: vi.fn(() => true),
  update: vi.fn(() => true),
}));
vi.mock('../../workflows/ai-settings/query', () => ({
  requestAIScenarioModelSelection: io.read,
  rememberAIScenarioModelSelection: io.remember,
  refreshManagedAICatalogs: io.maintain,
}));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
vi.mock('../../platform/media-utils/data-url', () => ({ blobToDataUrl: io.readFile }));
vi.mock('../controller/ai-image/snapshot', () => ({
  captureImageEditorSnapshot: vi.fn(),
  prepareImageEditorSnapshot: vi.fn(),
  isImageSnapshotCurrent: io.current,
}));
vi.mock('../controller/ai-image/apply', () => ({
  applyImageEditorResult: vi.fn(),
  canUpdateImageResult: io.update,
  isImageApplyResultPresent: io.update,
}));
vi.mock('../workflows/open-generated-image-document', () => ({
  openGeneratedImageDocument: vi.fn(),
}));
vi.mock('./client', () => ({ runImageEditorJob: vi.fn() }));
vi.mock('fabric', async (original) => ({
  ...(await original<typeof import('fabric')>()),
  Canvas: class {},
}));
vi.mock('../application/controller-context', () => ({ useEditorController: () => controller }));
vi.mock('../state/useEditorStore', () => ({
  useEditorStore: Object.assign((select: (_: typeof store) => unknown) => select(store), {
    getState: () => store,
  }),
}));
vi.mock('../../features/ai/model-selector', () => ({
  AIModelSelector: (props: {
    models: Array<{ id: string; displayName: string }>;
    selectedModelId: string | null;
    disabled: boolean;
    onSelect(id: string): void;
  }) => (
    <select
      aria-label="model"
      value={props.selectedModelId ?? ''}
      disabled={props.disabled}
      onChange={(event) => props.onSelect(event.currentTarget.value)}
    >
      <option value="" />
      {props.models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.displayName}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('../chrome/ui', async () => {
  const { forwardRef } = await import('react');
  type SelectProps = {
    options: ReadonlyArray<{ value: string; label: string }>;
    value: string;
    disabled?: boolean;
    label?: string;
    'aria-label'?: string;
    onChange(value: string): void;
  };
  const Select = (props: SelectProps) => (
    <select
      aria-label={props.label ?? props['aria-label']}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  return {
    CompactSelect: Select,
    SelectField: Select,
    CompactInput: (props: ComponentProps<'input'>) => <input {...props} />,
    EditorIconButton: forwardRef<HTMLButtonElement, ComponentProps<'button'>>((props, ref) => (
      <button {...props} ref={ref} aria-label={props.title} />
    )),
  };
});
vi.mock('@sniptale/ui/product-feedback/confirm-dialog', () => ({
  ProductConfirmDialog: (props: {
    title: string;
    confirmText: string;
    cancelText: string;
    onConfirm(): void;
    onCancel(): void;
  }) => (
    <div role="alertdialog" aria-label={props.title}>
      <button onClick={props.onCancel}>{props.cancelText}</button>
      <button onClick={props.onConfirm}>{props.confirmText}</button>
    </div>
  ),
}));

const image = {
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZw' +
    'AAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=',
  width: 2,
  height: 3,
};
let catalog: Catalog;
let host: HTMLDivElement, root: Root, session: ImageEditorSession;
let controller: ImageApplyController & {
  setActiveTool: (_: string) => void;
  getPublicApiAdapter(): ImageApplyController;
};
let store: {
  cropSelection: ImageBounds | null;
  selection: { selectedObjectCount: number };
  setActiveTool: (_: string) => void;
};
type Deps = Required<NonNullable<Parameters<typeof createImageEditorSession>[1]>>;
let deps: { [K in keyof Deps]: ReturnType<typeof vi.fn<Deps[K]>> };
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
function createCatalog(): Catalog {
  return {
    scenario: 'image-generation',
    globalSystemPrompt: '',
    remembered: null,
    resolution: { status: 'initial', modelId: 'first', previousSelection: null, reason: null },
    providers: [
      {
        id: 'provider',
        name: 'Provider',
        connectionType: 'openai-compatible',
        imageApi: 'routerai',
        destinationKind: 'external',
        destinationBinding: `sha256:${'a'.repeat(64)}`,
        hasStoredApiKey: true,
        createdAt: 1,
      },
    ],
    models: ['first', 'second'].map((id) => ({
      id,
      providerId: 'provider',
      displayName: id,
      modelCode: id === 'first' ? 'black-forest-labs/flux-3-image-klein' : 'other-image',
      capabilities: {
        operations: { 'image-generation': 'supported', 'image-editing': 'supported' },
        input: { text: 'supported', image: 'supported' },
        output: { image: 'supported' },
        features: {},
      },
    })),
  };
}
function setupSession() {
  const canvas = new Canvas();
  controller = {
    canvas,
    source: null,
    originalDocument: null,
    canvasDocumentSize: { width: 100, height: 100 },
    prepareObject: vi.fn(),
    setSource: vi.fn(),
    commitHistory: vi.fn(),
    syncRuntimeState: vi.fn(),
    withHistoryMuted: (run) => run(),
    ensureBrowserFrameOnTop: vi.fn(),
    setActiveTool: vi.fn(),
    getPublicApiAdapter: () => controller,
  };
  deps = {
    capture: vi.fn(async (_controller, options): Promise<EditorImageSnapshot> => ({
      id: crypto.randomUUID(),
      canvas,
      originalDocument: null,
      sourceId: 'source',
      sourceDataUrl: image.dataUrl,
      sourceTransform: null,
      intention: options.intention,
      order: [],
      sources: [],
      names: ['Layer one', 'Layer two'],
      replacementAllowed: options.intention === 'source',
      raster: options.intention === 'new-image' ? null : image,
      captureRaster: options.intention === 'new-image' ? null : image,
      captureBounds: { left: 0, top: 0, width: 2, height: 3 },
      inputBounds: { left: 0, top: 0, width: 2, height: 3 },
      targetBounds: { left: 0, top: 0, width: 2, height: 3 },
      contextMode: options.context ?? 'surroundings',
      regionSource: options.regionSource ?? 'canvas',
    })),
    prepare: vi.fn(async (source) => source),
    apply: vi.fn(async () => ({ object: new Rect(), signature: 'accepted' })),
    openDocument: vi.fn(async () => {}),
    run: vi.fn(async ({ request, receive }) => {
      for (let variant = 0; variant < request.context.parameters.variants; variant++)
        receive({ type: 'image', requestId: request.requestId, variant, image, costRub: 0.85 });
    }),
  };
  session = createImageEditorSession(() => controller, deps);
}
async function render(node: ReactNode = <ImageAIInspector session={session} />) {
  await act(async () => root.render(<CommandPressScope value={false}>{node}</CommandPressScope>));
}
function button(name: string): HTMLButtonElement {
  const result = [...document.querySelectorAll('button')].find(
    (node) =>
      node.getAttribute('aria-label') === name || node.title === name || node.textContent === name
  );
  if (!result) throw new Error(`Missing button: ${name}`);
  return result;
}
async function click(name: string) {
  await act(async () => button(name).click());
}
async function select(label: string, value: string) {
  if (label === 'editor.ai.variants') {
    const group = document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
    const option = [...group.querySelectorAll('button')].find(
      (button) => button.textContent === value
    )!;
    await act(async () => option.click());
    return;
  }
  const input = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function enter(value: string, selector = '[data-ui="editor.ai.prompt"]') {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  io.current.mockReturnValue(true);
  io.update.mockReturnValue(true);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  store = {
    cropSelection: { left: 0, top: 0, width: 2, height: 3 },
    selection: { selectedObjectCount: 2 },
    setActiveTool: vi.fn(),
  };
  catalog = createCatalog();
  io.read.mockImplementation(async (scenario) => ({ ...catalog, scenario }));
  io.readFile.mockResolvedValue(image.dataUrl);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  setupSession();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalScroll)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

it('previews variants, refines the chosen result and applies without duplicating it', async () => {
  await render();
  await select('editor.ai.variants', '3');
  await enter('Draw a square');
  expect(deps.run).not.toHaveBeenCalled();
  await click('editor.ai.generate');
  expect(session.getSnapshot().steps[0]?.variants.filter(Boolean)).toHaveLength(3);
  expect(controller.commitHistory).not.toHaveBeenCalled();
  await click('editor.ai.variants 2');
  await enter('Refine this choice');
  await select('editor.ai.variants', '1');
  await click('editor.ai.generate');
  expect(deps.run.mock.calls[1]?.[0].request.context.images).toEqual([
    { ...image, role: 'source' },
  ]);
  await click('editor.ai.original');
  expect(document.querySelector('[data-ui="editor.ai.preview-image"]')?.getAttribute('href')).toBe(
    deps.run.mock.calls[1]?.[0].request.context.images[0]?.dataUrl
  );
  await click('editor.ai.result');
  await click('editor.ai.apply');
  expect(deps.apply).toHaveBeenCalledOnce();
  expect(button('editor.ai.apply').disabled).toBe(true);
  await click('editor.ai.openDocument');
  expect(deps.openDocument).toHaveBeenCalledWith(image, 'editor.ai.newLayerName');
  await click('editor.ai.useOriginal');
  expect(session.getSnapshot().base).toBeNull();
});

it('captures an explicitly chosen region and keeps its context visible before dispatch', async () => {
  await render();
  await select('editor.ai.source', 'region');
  await select('editor.ai.regionSource', 'source');
  await select('editor.ai.context', 'whole');
  await click('editor.ai.selectRegion');
  expect(controller.setActiveTool).toHaveBeenCalledWith('crop');
  expect(store.setActiveTool).toHaveBeenCalledWith('crop');
  await click('editor.ai.refreshSource');
  expect(deps.capture).toHaveBeenCalledWith(
    controller,
    expect.objectContaining({ intention: 'region', context: 'whole', regionSource: 'source' })
  );
  await click('editor.ai.openSourcePreview');
  expect(document.querySelector('[aria-label="editor.ai.editArea"]')).not.toBeNull();
  await enter('Change the chosen area');
  await click('editor.ai.generate');
  expect(deps.run.mock.calls[0]?.[0].request.context.intention).toBe('region');
  await click('editor.ai.original');
  expect(document.querySelector('[data-ui="editor.ai.preview-image"]')?.getAttribute('href')).toBe(
    image.dataUrl
  );
  await click('editor.ai.result');
  await select('editor.ai.source', 'layers');
  await click('editor.ai.refreshSource');
  expect(host.textContent).toContain('Layer one');
  expect(host.textContent).toContain('Layer two');
  expect(host.textContent).toContain('editor.ai.layersNotice');
});

it('keeps generation unavailable when configuration fails and lets the user retry', async () => {
  io.read.mockRejectedValueOnce(new Error('unavailable'));
  await render();
  expect(button('editor.ai.generate').disabled).toBe(true);
  await click('editor.ai.retryModels');
  await enter('Retry with the visible model');
  await click('editor.ai.generate');
  expect(deps.run).toHaveBeenCalledOnce();
});

it('navigates the session menu by keyboard and requires confirmation to clear retained work', async () => {
  await render();
  await enter('Keep this result');
  await click('editor.ai.generate');
  const trigger = button('editor.ai.menu');
  await click('editor.ai.menu');
  const first = button('editor.ai.newTask'),
    last = button('editor.ai.clear');
  expect(document.activeElement).toBe(first);
  for (const [key, expected] of [
    ['End', last],
    ['ArrowUp', first],
    ['ArrowDown', last],
    ['Home', first],
  ] as const) {
    await act(async () =>
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    );
    expect(document.activeElement).toBe(expected);
  }
  await act(async () =>
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(document.activeElement).toBe(trigger);
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await click('editor.ai.menu');
  await act(async () =>
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
  );
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await click('editor.ai.menu');
  await click('editor.ai.newTask');
  expect(session.getSnapshot().steps).toHaveLength(1);
  expect(session.getSelectedVariant()).toBeNull();
  await click('editor.ai.menu');
  await click('editor.ai.clear');
  await click('editor.ai.cancel');
  expect(session.getSnapshot().steps).toHaveLength(1);
  await click('editor.ai.menu');
  await click('editor.ai.clear');
  await click('editor.ai.confirmClear');
  expect(session.getSnapshot().steps).toHaveLength(0);
  expect(document.activeElement).toBe(trigger);
});

it('stops a partial request and ignores its late result while preserving the prompt', async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  deps.run.mockImplementationOnce(async ({ request, receive }) => {
    receive({ type: 'image', requestId: request.requestId, variant: 0, image });
    await held;
    receive({ type: 'image', requestId: request.requestId, variant: 1, image });
  });
  await render();
  await enter('Retain the unfinished instruction');
  await click('editor.ai.generate');
  expect(session.getSnapshot().status).toBe('generating');
  const count = document.querySelector('[aria-label="editor.ai.variants"]')!;
  expect([...count.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
  await click('editor.ai.stop');
  await act(async () => release());
  expect(session.getSnapshot().error).toBe('cancelled');
  expect(session.getSnapshot().steps[0]?.variants.filter(Boolean)).toHaveLength(1);
  expect(session.getSnapshot().draft.prompt).toBe('Retain the unfinished instruction');
  expect(host.textContent).toContain('editor.ai.stopped');
});

it('uses an explicitly selected refinement model and preserves the result after preparation failure', async () => {
  await render();
  await enter('Original');
  await click('editor.ai.generate');
  await select('model', 'second');
  await click('editor.ai.adaptParameters');
  await enter('Use the chosen model');
  io.read.mockRejectedValueOnce(new Error('catalog unavailable'));
  await click('editor.ai.generate');
  expect(deps.run).toHaveBeenCalledOnce();
  expect(session.getSelectedVariant()).not.toBeNull();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('editor.ai.error');
  await click('editor.ai.generate');
  expect(deps.run.mock.calls[1]?.[0].request.modelId).toBe('second');
  expect(deps.run.mock.calls[1]?.[0].request.context.images).toHaveLength(1);
});

it('retains explicit settings across model changes and requires resolution before dispatch', async () => {
  catalog.models[1]!.modelCode = 'google/gemini-3.1-flash-lite-image';
  await render();
  await select('editor.ai.variants', '3');
  await select('editor.ai.resolution', '4K');
  await select('editor.ai.ratio', '16:9');
  await enter('Preserve my settings');
  await select('model', 'second');
  expect(session.getSnapshot().draft.parameters).toMatchObject({
    variants: 3,
    resolution: '4K',
    aspectRatio: '16:9',
  });
  expect(button('editor.ai.generate').disabled).toBe(true);
  expect(deps.run).not.toHaveBeenCalled();
  await click('editor.ai.adaptParameters');
  expect(session.getSnapshot().draft.parameters).toMatchObject({
    variants: 3,
    resolution: '1K',
    aspectRatio: '16:9',
  });
  await click('editor.ai.generate');
  expect(deps.run.mock.calls[0]?.[0].request.context.parameters).toMatchObject({
    variants: 3,
    resolution: '1K',
    aspectRatio: '16:9',
  });
});

it('does not offer an unsupported native image protocol', async () => {
  catalog.providers[0]!.connectionType = 'google';
  catalog.providers[0]!.imageApi = undefined;
  await render();
  await enter('Do not send');
  expect(button('editor.ai.generate').disabled).toBe(true);
  expect(host.textContent).toContain('editor.ai.modelUnsupported');
  expect(deps.run).not.toHaveBeenCalled();
});

it('updates only declared parameter choices and validates the seed input', async () => {
  const profile = resolveImageModelProfile(
    { operation: 'image-generation', modelCode: 'gpt-image-1-mini' },
    { connectionType: 'openai' },
    'image-generation'
  );
  if (!profile) throw new Error('Missing native image fixture profile');
  let value: ImageParameters = { ...profile.defaults };
  const changed = vi.fn((next: ImageParameters) => {
    value = next;
  });
  const surface = () => (
    <ImageParametersEditor profile={profile} value={value} disabled={false} onChange={changed} />
  );
  await render(surface());
  for (const [label, choice, key] of [
    ['editor.ai.size', '1536x1024', 'size'],
    ['editor.ai.quality', 'high', 'quality'],
    ['editor.ai.format', 'webp', 'outputFormat'],
    ['editor.ai.background', 'transparent', 'background'],
  ] as const) {
    await select(label, choice);
    expect(value[key]).toBe(choice);
    await render(surface());
  }
  expect(document.querySelector('option[value="high"]')?.textContent).toBe('editor.ai.high');
  await render();
  await enter('-1', 'input[type="number"]');
  expect(session.getSnapshot().draft.parameters.seed).toBeUndefined();
  await enter('7', 'input[type="number"]');
  expect(session.getSnapshot().draft.parameters.seed).toBe(7);
  await enter('', 'input[type="number"]');
  expect(session.getSnapshot().draft.parameters.seed).toBeUndefined();
});

async function attach(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

it('prepares, previews and removes a valid reference while retaining previous images on invalid input', async () => {
  const changed = vi.fn(),
    pending = vi.fn();
  await render(
    <ImageAttachments
      operationId="one"
      images={[]}
      disabled={false}
      onChange={changed}
      onPendingChange={pending}
    />
  );
  await attach([new File(['png'], 'reference.png', { type: 'image/png' })]);
  expect(changed).toHaveBeenLastCalledWith([image]);
  expect(pending).toHaveBeenLastCalledWith(false);
  await render(
    <ImageAttachments
      operationId="one"
      images={[image]}
      disabled={false}
      onChange={changed}
      onPendingChange={pending}
    />
  );
  expect(host.querySelector('img')?.getAttribute('src')).toBe(image.dataUrl);
  await click('editor.ai.removeReference');
  expect(changed).toHaveBeenLastCalledWith([]);
  changed.mockClear();
  await attach([new File(['svg'], 'bad.svg', { type: 'image/svg+xml' })]);
  expect(changed).not.toHaveBeenCalled();
  expect(host.textContent).toContain('editor.ai.fileError');
  io.readFile.mockResolvedValueOnce('data:image/png;base64,broken');
  await attach([new File(['broken'], 'broken.png', { type: 'image/png' })]);
  expect(changed).not.toHaveBeenCalled();
  expect(host.querySelector('img')?.getAttribute('src')).toBe(image.dataUrl);
});

it('discards a late reference read after a new operation and rejects excessive attachment size', async () => {
  const changed = vi.fn(),
    pending = vi.fn();
  let release!: (_: string) => void;
  io.readFile.mockReturnValueOnce(
    new Promise<string>((resolve) => {
      release = resolve;
    })
  );
  const surface = (operationId: string) => (
    <ImageAttachments
      operationId={operationId}
      images={[]}
      disabled={false}
      onChange={changed}
      onPendingChange={pending}
    />
  );
  await render(surface('one'));
  await attach([new File(['png'], 'late.png', { type: 'image/png' })]);
  expect(pending).toHaveBeenLastCalledWith(true);
  await render(surface('two'));
  await act(async () => release(image.dataUrl));
  expect(changed).not.toHaveBeenCalled();
  expect(pending).toHaveBeenLastCalledWith(false);
  const oversized = new File(['png'], 'large.png', { type: 'image/png' });
  Object.defineProperty(oversized, 'size', { value: 17 * 1024 * 1024 });
  await attach([oversized]);
  expect(changed).not.toHaveBeenCalled();
  expect(host.textContent).toContain('editor.ai.fileError');
});

it('retains a count chosen before the first model configuration arrives', async () => {
  let complete!: (result: Catalog) => void;
  io.read.mockReturnValueOnce(new Promise<Catalog>((resolve) => (complete = resolve)));
  await render();
  await select('editor.ai.variants', '3');
  expect(session.getSnapshot().draft.parameters.variants).toBe(3);
  await act(async () => complete(catalog));
  expect(session.getSnapshot().draft.parameters).toMatchObject({
    variants: 3,
    resolution: '768',
    aspectRatio: '1:1',
    outputFormat: 'png',
  });
  await enter('Preserve my selected count');
  await click('editor.ai.generate');
  expect(deps.run.mock.calls[0]?.[0].request.context.parameters.variants).toBe(3);
});

it('fills missing model defaults and retains an explicit provider default through adaptation', async () => {
  catalog.models[0]!.modelCode = 'aaa-generic-image';
  catalog.models[1]!.modelCode = 'black-forest-labs/flux-3-image-klein';
  await render();
  await select('editor.ai.variants', '3');
  await select('model', 'second');
  expect(session.getSnapshot().draft.parameters).toMatchObject({
    variants: 3,
    resolution: '768',
    aspectRatio: '1:1',
    outputFormat: 'png',
  });
  await select('editor.ai.resolution', '');
  await select('model', 'first');
  await click('editor.ai.adaptParameters');
  await select('model', 'second');
  expect(session.getSnapshot().draft.parameters.resolution).toBeUndefined();
  await enter('Use the provider resolution default');
  await click('editor.ai.generate');
  expect(deps.run.mock.calls[0]?.[0].request.context.parameters.resolution).toBeUndefined();
  expect(Object.hasOwn(deps.run.mock.calls[0]![0].request.context.parameters, 'resolution')).toBe(
    false
  );
  expect(deps.run.mock.calls[0]?.[0].request.context.parameters.variants).toBe(3);
});

it('keeps preview outside the inspector and restores focus without changing document history', async () => {
  await render();
  await select('editor.ai.variants', '3');
  await enter('Generate three choices');
  await click('editor.ai.generate');
  const preview = document.querySelector<HTMLElement>('[data-ui="editor.ai.preview"]')!;
  expect(preview).not.toBeNull();
  expect(host.querySelector('[data-ui="editor.ai.preview"]')).toBeNull();
  expect(
    document
      .querySelector('[data-ui="editor.ai.inspector"]')
      ?.querySelector('[data-ui="editor.ai.preview-image"]')
  ).toBeNull();
  await enter('Keep typing while the preview is open');
  expect(session.getSnapshot().draft.prompt).toBe('Keep typing while the preview is open');
  const variant = preview.querySelector<HTMLButtonElement>('[aria-label="editor.ai.variants 2"]')!;
  await act(async () => variant.click());
  expect(session.getSnapshot().selected?.variant).toBe(1);
  await click('100%');
  const focus = document.activeElement;
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(document.querySelector('[data-ui="editor.ai.preview"]')).toBeNull();
  expect(document.activeElement).toBe(focus);
  await click('editor.ai.openPreview');
  await act(async () => button('common.actions.close').focus());
  await click('common.actions.close');
  expect(document.activeElement).toBe(button('editor.ai.openPreview'));
  expect(controller.commitHistory).not.toHaveBeenCalled();
  expect(deps.apply).not.toHaveBeenCalled();
});
