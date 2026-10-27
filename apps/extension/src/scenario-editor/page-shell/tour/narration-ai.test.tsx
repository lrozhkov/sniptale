// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { TourNarrationAI } from './narration-ai';
import { TourWorkspace } from './workspace';
import { useGuidePanels } from '../panel-layout';
vi.mock('./canvas', () => ({
  TourCanvas: ({ onSelectObject }: { onSelectObject(id: string): void }) => (
    <button data-test-select-action onClick={() => onSelectObject('a')}>
      Select action
    </button>
  ),
}));
import { createTranslator } from '../../../platform/i18n';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
  type ScenarioNarrationText,
} from '../../../features/scenario/project/public';
import type { ScenarioNarrationAccess } from './use-narration-ai';
import type {
  ScenarioNarrationBasis,
  ScenarioNarrationPreview,
} from '../../../workflows/scenario-narration/generation';
const io = vi.hoisted(() => ({
  catalog: vi.fn(),
  remember: vi.fn(),
  prepare: vi.fn(),
  generate: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock('../../../workflows/ai-settings/query', () => ({
  requestAIScenarioModelSelection: io.catalog,
  rememberAIScenarioModelSelection: io.remember,
}));
vi.mock('../../../workflows/scenario-narration/generation', () => ({
  prepareScenarioNarrationBatch: io.prepare,
  generateScenarioNarration: io.generate,
  cleanupScenarioNarrationPreview: io.cleanup,
}));
type Catalog = Awaited<
  ReturnType<typeof import('../../../workflows/ai-settings/query').requestAIScenarioModelSelection>
>;
let fixture: Catalog;
let formVersion = 0;
let root: Root;
let host: HTMLDivElement;
const targets: ScenarioNarrationText[] = ['a', 'b', 'c'].map((objectId) => ({
  slideId: 's',
  objectId,
  text: `Authored ${objectId}`,
  narration: null,
}));
const access: ScenarioNarrationAccess = { prepareNarration: vi.fn(), applyNarration: vi.fn() };
function result(source: ScenarioNarrationBasis): ScenarioNarrationPreview {
  return {
    ...source,
    blob: new Blob(['wave'], { type: 'audio/wav' }),
    url: `blob:${source.scope.target.objectId}`,
    duration: 1,
    staged: { id: '12345678-1234-4234-8234-123456789abc', mimeType: 'audio/wav', size: 4 },
  };
}
function button(selector: string): HTMLButtonElement {
  const element = host.querySelector(selector);
  if (!(element instanceof HTMLButtonElement)) throw Error(selector);
  return element;
}
async function start() {
  const approval = host.querySelector('[data-ai-consent]');
  if (!(approval instanceof HTMLInputElement)) throw Error('approval');
  await act(async () => approval.click());
  await act(async () => button('[data-ai-generate]').click());
}
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  fixture = {
    scenario: 'scenario-speech',
    remembered: null,
    resolution: { status: 'initial', modelId: 'm', previousSelection: null, reason: null },
    globalSystemPrompt: '',
    models: [
      {
        id: 'm',
        providerId: 'p',
        modelCode: 'tts',
        displayName: 'Configured speech',
        operation: 'speech',
        audio: { speech: { voiceId: 'alloy', responseFormat: 'wav' } },
      },
    ],
    providers: [
      {
        id: 'p',
        name: 'Disclosed provider',
        incarnation: 'one',
        destinationBinding: `sha256:${'a'.repeat(64)}`,
        connectionType: 'openai-compatible',
        destinationKind: 'external',
        hasStoredApiKey: true,
        createdAt: 1,
      },
    ],
  };
  io.catalog.mockResolvedValue(fixture);
  io.remember.mockResolvedValue(undefined);
  vi.mocked(access.prepareNarration).mockResolvedValue({
    project: createGuideProject('Guide', 'p'),
    workspaceRevision: 1,
  });
  vi.mocked(access.applyNarration).mockResolvedValue(true);
  io.prepare.mockImplementation(async (_snapshot, selected: ScenarioNarrationText[]) =>
    selected.map((target) => ({
      scope: {
        workspaceId: 'p',
        workspaceRevision: 1,
        target: { kind: 'scenario-text', slideId: 's', objectId: target.objectId },
        sourceTextHash: 'a'.repeat(64),
      },
      text: target.text,
      expectedNarration: null,
    }))
  );
  io.generate.mockImplementation(async (source: ScenarioNarrationBasis) => result(source));
  io.cleanup.mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      <TourNarrationAI
        targets={targets}
        access={access}
        disabled={false}
        t={createTranslator('en')}
      />
    )
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('requires provider approval and explicit Apply before changing the current narration', async () => {
  expect(host.textContent).toContain('Disclosed provider');
  expect(host.textContent).toContain('Configured speech');
  expect(host.textContent).toContain('possible charge');
  expect(button('[data-ai-generate]').disabled).toBe(true);
  expect(io.generate).not.toHaveBeenCalled();
  await start();
  expect(io.generate).toHaveBeenCalledTimes(3);
  expect(io.generate.mock.calls[0]?.[2]).toEqual({
    modelId: 'm',
    approvedProviderId: 'p',
    approvedModelCode: 'tts',
    approvedDestination: `sha256:${'a'.repeat(64)}`,
  });
  expect(access.applyNarration).not.toHaveBeenCalled();
  expect(host.querySelectorAll('[data-ai-preview]')).toHaveLength(3);
  await act(async () => button('[data-ai-apply="a"]').click());
  expect(access.applyNarration).toHaveBeenCalledTimes(1);
  expect(io.cleanup).toHaveBeenCalledWith(expect.objectContaining({ url: 'blob:a' }));
  expect(host.querySelectorAll('[data-ai-preview]')).toHaveLength(2);
  expect(host.textContent).toContain('Applied');
});
it('retains ready batch previews when a later provider request fails', async () => {
  io.generate
    .mockImplementationOnce(async (source: ScenarioNarrationBasis) => result(source))
    .mockRejectedValueOnce(new Error('provider-failed'));
  await start();
  expect(host.querySelectorAll('[data-ai-preview]')).toHaveLength(2);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(access.applyNarration).not.toHaveBeenCalled();
  await act(async () => button('[data-ai-generate]').click());
  expect(io.generate).toHaveBeenCalledTimes(4);
  expect(io.generate.mock.calls[3]![0].scope.target.objectId).toBe('b');
  expect(host.querySelectorAll('[data-ai-preview]')).toHaveLength(3);
});
it('disables Apply All until generation settles and all ready results contain Blobs', async () => {
  let finish!: (value: ScenarioNarrationPreview) => void;
  io.generate
    .mockImplementationOnce(async (source: ScenarioNarrationBasis) => result(source))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
  await start();
  expect(host.querySelectorAll('[data-ai-preview]')).toHaveLength(1);
  expect(button('[data-ai-apply-all]').disabled).toBe(true);
  expect(host.querySelector('input[aria-label="Voice"]')?.closest('fieldset')?.disabled).toBe(true);
  expect(button('[data-ai-apply="a"]').disabled).toBe(true);
  await act(async () => {
    finish(
      result({
        scope: {
          workspaceId: 'p',
          workspaceRevision: 1,
          target: { kind: 'scenario-text', slideId: 's', objectId: 'b' },
          sourceTextHash: 'a'.repeat(64),
        },
        text: 'Authored b',
        expectedNarration: null,
      })
    );
  });
  expect(button('[data-ai-apply-all]').disabled).toBe(false);
  await act(async () => button('[data-ai-apply-all]').click());
  expect(access.applyNarration).toHaveBeenCalledTimes(3);
  for (const [preview] of vi.mocked(access.applyNarration).mock.calls)
    expect(preview.blob).toBeInstanceOf(Blob);
});

it('preserves the narration category and returns focus after closing the AI form', async () => {
  const project = createGuideProject('Guide', 'p');
  const slide = createTourImageSlide('s');
  slide.actions = [
    {
      type: 'annotation',
      object: { id: 'a', text: 'Authored a', anchor: null, appearance: null, narration: null },
    },
  ];
  project.tour = { ...createTourDocument(), slides: [slide] };
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  function Workspace() {
    const panels = useGuidePanels();
    return (
      <TourWorkspace
        project={project}
        images={{}}
        panels={panels}
        header={(controls) => controls}
        disabled={false}
        t={createTranslator('en')}
        onChange={() => undefined}
        onImport={async () => true}
        onImportNarration={async () => true}
        narrationAI={access}
      />
    );
  }
  await act(async () => root.render(<Workspace />));
  await act(async () => button('[data-test-select-action]').click());
  await act(async () => button('#guide-inspector-panel button[aria-label="Narration"]').click());
  const original = button('[data-ai-single]');
  original.focus();
  await act(async () => original.click());
  expect(host.querySelector('[data-tour-narration-ai]')).not.toBeNull();
  expect(host.querySelector('[data-ai-single]')).toBeNull();
  await start();
  expect(host.querySelectorAll('[data-ai-preview]')).toHaveLength(1);
  expect(host.querySelector('[data-ai-apply-all]')).toBeNull();
  await act(async () =>
    button('#guide-inspector-panel .guide-panel-heading .tour-inspector-back').click()
  );
  await act(async () => {
    for (const callback of frames.splice(0)) callback(0);
  });
  expect(
    host
      .querySelector('#guide-inspector-panel button[aria-label="Narration"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(host.querySelector('[data-ai-single]')).toBe(document.activeElement);
});

it('generates only the explicitly selected batch actions', async () => {
  const second = host.querySelector('[data-ai-target="b"]');
  if (!(second instanceof HTMLInputElement)) throw Error('target checkbox');
  await act(async () => second.click());
  await start();
  expect(io.generate.mock.calls.map(([source]) => source.scope.target.objectId)).toEqual([
    'a',
    'c',
  ]);
  expect(host.querySelectorAll('[data-ai-preview]')).toHaveLength(2);
  expect(access.applyNarration).not.toHaveBeenCalled();
});
it('recovers a failed catalog read through the existing reload command', async () => {
  io.catalog.mockRejectedValueOnce(new Error('settings unavailable'));
  await act(async () =>
    root.render(
      <TourNarrationAI
        key="catalog-retry"
        targets={targets}
        access={access}
        disabled={false}
        t={createTranslator('en')}
      />
    )
  );
  expect(button('[data-ai-generate]').disabled).toBe(true);
  const reload = [...host.querySelectorAll<HTMLButtonElement>('button')].find((node) =>
    node.textContent?.includes(createTranslator('en')('gallery.videoReview.speechReloadModels'))
  );
  if (!reload) throw Error('reload command');
  await act(async () => reload.click());
  expect(host.textContent).toContain('Disclosed provider');
  expect(host.querySelector('[data-ai-consent]')).not.toBeNull();
  expect(button('[data-ai-generate]').disabled).toBe(true);
  expect(io.generate).not.toHaveBeenCalled();
});
it('reports a refused source Save without starting provider work or losing existing narration', async () => {
  vi.mocked(access.prepareNarration).mockRejectedValueOnce(new Error('save-failed'));
  await start();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(io.generate).not.toHaveBeenCalled();
  expect(access.applyNarration).not.toHaveBeenCalled();
  expect(host.querySelectorAll('[data-ai-preview]')).toHaveLength(0);
});

it('discards an old voice preview and waits for explicit generation with changed parameters', async () => {
  await start();
  expect(host.querySelectorAll('[data-ai-preview]')).toHaveLength(3);
  const voice = host.querySelector('input[aria-label="Voice"]');
  if (!(voice instanceof HTMLInputElement)) throw Error('voice field');
  expect(voice.closest('fieldset')?.disabled).toBe(false);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw Error('input setter');
  await act(async () => {
    setter.call(voice, 'changed-voice');
    voice.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelectorAll('[data-ai-preview]')).toHaveLength(0);
  expect(io.cleanup).toHaveBeenCalledTimes(3);
  expect(io.generate).toHaveBeenCalledTimes(3);
  expect(button('[data-ai-generate]').disabled).toBe(false);
  await act(async () => button('[data-ai-generate]').click());
  expect(io.generate).toHaveBeenCalledTimes(6);
  for (const call of io.generate.mock.calls.slice(3)) expect(call[1].voiceId).toBe('changed-voice');
});
it('applies only currently selected batch results while keeping an unchecked individual result explicit', async () => {
  await start();
  const second = host.querySelector('[data-ai-target="b"]');
  if (!(second instanceof HTMLInputElement)) throw Error('target checkbox');
  expect(second.closest('fieldset')?.disabled).toBe(false);
  await act(async () => second.click());
  await act(async () => button('[data-ai-apply-all]').click());
  expect(
    vi.mocked(access.applyNarration).mock.calls.map(([preview]) => preview.scope.target.objectId)
  ).toEqual(['a', 'c']);
  expect(host.querySelectorAll('[data-ai-preview]')).toHaveLength(1);
  expect(button('[data-ai-apply="b"]').disabled).toBe(false);
  await act(async () => button('[data-ai-apply="b"]').click());
  expect(
    vi.mocked(access.applyNarration).mock.calls.map(([preview]) => preview.scope.target.objectId)
  ).toEqual(['a', 'c', 'b']);
  expect(io.generate).toHaveBeenCalledTimes(3);
});

async function remountCatalog(value: Catalog) {
  io.catalog.mockResolvedValue(value);
  await act(async () =>
    root.render(
      <TourNarrationAI
        key={++formVersion}
        targets={targets}
        access={access}
        disabled={false}
        t={createTranslator('en')}
      />
    )
  );
}
async function editVoice(value: string) {
  const field = host.querySelector('input[aria-label="Voice"]');
  if (!(field instanceof HTMLInputElement)) throw new Error('Missing voice field');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!set) throw new Error('Missing native input setter');
  await act(async () => {
    set.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('opens without preference or project writes and remembers first use before source Save', async () => {
  expect(io.catalog).toHaveBeenCalledWith('scenario-speech');
  expect(io.remember).not.toHaveBeenCalled();
  expect(access.prepareNarration).not.toHaveBeenCalled();
  await start();
  expect(io.remember).toHaveBeenCalledWith(
    expect.objectContaining({ scenario: 'scenario-speech' }),
    'scenario-speech',
    'm',
    'initial'
  );
  expect(io.remember.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(access.prepareNarration).mock.invocationCallOrder[0]!
  );
});

it('preserves the voice draft and allows retry after preference storage refuses generation', async () => {
  await editVoice('retained voice');
  io.remember.mockRejectedValueOnce(new Error('refused'));
  await start();
  expect(access.prepareNarration).not.toHaveBeenCalled();
  expect(io.generate).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Voice"]')?.value).toBe(
    'retained voice'
  );
  expect(host.textContent).toContain(
    createTranslator('en')('scenario.editor.guideAiSelectionFailed')
  );
  await act(async () => button('[data-ai-generate]').click());
  expect(io.generate).toHaveBeenCalledTimes(3);
  expect(io.generate.mock.calls[0]![1].voiceId).toBe('retained voice');
});

it('refuses a disappeared model during generation preparation without using another candidate', async () => {
  io.catalog.mockResolvedValueOnce({ ...fixture, models: [] });
  await start();
  expect(io.remember).not.toHaveBeenCalled();
  expect(access.prepareNarration).not.toHaveBeenCalled();
  expect(io.generate).not.toHaveBeenCalled();
  expect(button('[data-ai-generate]').disabled).toBe(true);
  expect(host.textContent).toContain(
    createTranslator('en')('scenario.editor.guideAiModelUnavailable')
  );
});

it.each(['cancel', 'close'] as const)(
  'settles %s during selection preparation without late source Save or paid work',
  async (action) => {
    let finish!: (value: Catalog) => void;
    io.catalog.mockImplementationOnce(
      () =>
        new Promise<Catalog>((resolve) => {
          finish = resolve;
        })
    );
    await start();
    const cancel = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent === createTranslator('en')('common.actions.cancel')
    );
    if (!cancel) throw new Error('Missing cancellation');
    await act(async () => {
      if (action === 'cancel') cancel.click();
      else root.render(null);
    });
    await act(async () => finish(fixture));
    expect(io.remember).not.toHaveBeenCalled();
    expect(access.prepareNarration).not.toHaveBeenCalled();
    expect(io.generate).not.toHaveBeenCalled();
  }
);

it.each([
  { connectionType: 'openai-compatible' as const, responseFormat: 'mp3' },
  { connectionType: 'google' as const, responseFormat: 'wav' },
  { connectionType: 'elevenlabs' as const, responseFormat: 'mp3' },
])(
  'requires explicit voice entry for a capability-only $connectionType speech model',
  async ({ connectionType, responseFormat }) => {
    await remountCatalog({
      ...fixture,
      providers: fixture.providers.map((entry) => ({
        ...entry,
        connectionType,
        management: 'automatic' as const,
      })),
      models: [
        {
          id: 'm',
          providerId: 'p',
          modelCode: 'catalog-speech',
          displayName: 'Catalog speech',
          source: 'catalog',
          capabilities: {
            operations: { speech: 'supported' },
            input: { text: 'supported' },
            output: { audio: 'supported' },
            features: {},
          },
        },
      ],
    });
    const approval = host.querySelector<HTMLInputElement>('[data-ai-consent]');
    await act(async () => approval?.click());
    expect(button('[data-ai-generate]').disabled).toBe(true);
    expect(io.remember).not.toHaveBeenCalled();
    await editVoice('explicit voice');
    expect(button('[data-ai-generate]').disabled).toBe(false);
    await act(async () => button('[data-ai-generate]').click());
    expect(io.generate.mock.calls[0]![1]).toMatchObject({
      modelId: 'm',
      voiceId: 'explicit voice',
      responseFormat,
    });
  }
);

it('persists explicit model choices while a failed choice preserves the accepted voice draft', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 100, 280, 32)
  );
  const other = {
    ...fixture.models[0]!,
    id: 'other',
    modelCode: 'other-voice',
    displayName: 'Other speech',
    audio: { speech: { voiceId: 'other voice', responseFormat: 'wav' as const } },
  };
  await remountCatalog({ ...fixture, models: [...fixture.models, other] });
  await editVoice('retained draft');
  const chooseOther = async () => {
    await act(async () => button('.sniptale-ai-model-selector-trigger').click());
    const option = [
      ...host.querySelectorAll<HTMLButtonElement>('.sniptale-dropdown-menu button'),
    ].find((node) => node.textContent?.includes('Other speech'));
    if (!option) throw new Error('Missing model option');
    await act(async () => option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  };
  io.remember.mockRejectedValueOnce(new Error('refused'));
  await chooseOther();
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Voice"]')?.value).toBe(
    'retained draft'
  );
  expect(button('.sniptale-ai-model-selector-trigger').textContent).toContain('Configured speech');
  await chooseOther();
  expect(io.remember).toHaveBeenLastCalledWith(
    expect.objectContaining({ scenario: 'scenario-speech' }),
    'scenario-speech',
    'other',
    'explicit'
  );
  expect(button('.sniptale-ai-model-selector-trigger').textContent).toContain('Other speech');
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Voice"]')?.value).toBe(
    'other voice'
  );
  expect(access.prepareNarration).not.toHaveBeenCalled();
  expect(access.applyNarration).not.toHaveBeenCalled();
  expect(io.generate).not.toHaveBeenCalled();
});

it('keeps a remembered missing narration model unresolved instead of selecting another model', async () => {
  const previous = {
    modelId: 'removed',
    modelCode: 'historic',
    providerId: 'p',
    providerIncarnation: 'old',
    displayName: 'Removed speech model',
    selectedAt: 1,
    source: 'explicit' as const,
  };
  await remountCatalog({
    ...fixture,
    remembered: previous,
    resolution: {
      status: 'unavailable',
      modelId: null,
      previousSelection: previous,
      reason: 'model-unavailable',
    },
  });
  expect(host.textContent).toContain('Removed speech model');
  expect(button('[data-ai-generate]').disabled).toBe(true);
  expect(button('.sniptale-ai-model-selector-trigger').textContent).not.toContain(
    'Configured speech'
  );
  expect(io.remember).not.toHaveBeenCalled();
  expect(access.prepareNarration).not.toHaveBeenCalled();
  expect(access.applyNarration).not.toHaveBeenCalled();
});

it('retains the voice draft while its model is unavailable and restores the same identity after reload', async () => {
  await editVoice('retained unavailable draft');
  io.catalog.mockResolvedValueOnce({ ...fixture, models: [] });
  await start();
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Voice"]')?.value).toBe(
    'retained unavailable draft'
  );
  expect(button('[data-ai-generate]').disabled).toBe(true);
  const reload = [...host.querySelectorAll<HTMLButtonElement>('button')].find((node) =>
    node.textContent?.includes(createTranslator('en')('gallery.videoReview.speechReloadModels'))
  );
  if (!reload) throw new Error('Missing model reload');
  await act(async () => reload.click());
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Voice"]')?.value).toBe(
    'retained unavailable draft'
  );
  expect(button('.sniptale-ai-model-selector-trigger').textContent).toContain('Configured speech');
  expect(io.remember).not.toHaveBeenCalled();
  expect(access.prepareNarration).not.toHaveBeenCalled();
  expect(io.generate).not.toHaveBeenCalled();
});

it('initializes the updated profile only after explicit replacement under the same model ID succeeds', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 100, 280, 32)
  );
  await editVoice('retained draft');
  const replacement: Catalog = {
    ...fixture,
    models: [
      {
        ...fixture.models[0]!,
        modelCode: 'replacement-voice',
        displayName: 'Updated speech',
        audio: { speech: { voiceId: 'updated voice', responseFormat: 'wav' } },
      },
    ],
  };
  io.catalog.mockResolvedValue(replacement);
  const choose = async () => {
    await act(async () => button('.sniptale-ai-model-selector-trigger').click());
    const option = [
      ...host.querySelectorAll<HTMLButtonElement>('.sniptale-dropdown-menu button'),
    ].find((node) => node.textContent?.includes('Updated speech'));
    if (!option) throw new Error('Missing updated model');
    await act(async () => option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  };
  io.remember.mockRejectedValueOnce(new Error('refused'));
  await choose();
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Voice"]')?.value).toBe(
    'retained draft'
  );
  await choose();
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Voice"]')?.value).toBe(
    'updated voice'
  );
  expect(access.prepareNarration).not.toHaveBeenCalled();
  expect(access.applyNarration).not.toHaveBeenCalled();
  expect(io.generate).not.toHaveBeenCalled();
});

it.each(['destination', 'model-code'] as const)(
  'clears Scenario approval after same-ID %s replacement',
  async (change) => {
    const checkbox = host.querySelector<HTMLInputElement>('[data-ai-consent]')!;
    await act(async () => checkbox.click());
    expect(checkbox.checked).toBe(true);
    const next = structuredClone(fixture);
    if (change === 'destination')
      next.providers[0]!.destinationBinding = `sha256:${'b'.repeat(64)}`;
    else next.models[0]!.modelCode = 'replacement-code';
    io.catalog.mockResolvedValue(next);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.sniptale-ai-model-selector-trigger')!.click()
    );
    expect(host.querySelector<HTMLInputElement>('[data-ai-consent]')?.checked ?? false).toBe(false);
    expect(button('[data-ai-generate]').disabled).toBe(true);
    expect(access.prepareNarration).not.toHaveBeenCalled();
    expect(io.generate).not.toHaveBeenCalled();
  }
);
it.each(['destination', 'model-code'] as const)(
  'refuses changed Scenario %s after approval before source Save',
  async (change) => {
    await editVoice('retained voice');
    await act(async () => host.querySelector<HTMLInputElement>('[data-ai-consent]')!.click());
    const next = structuredClone(fixture);
    if (change === 'destination')
      next.providers[0]!.destinationBinding = `sha256:${'b'.repeat(64)}`;
    else next.models[0]!.modelCode = 'replacement-code';
    io.catalog.mockResolvedValue(next);
    await act(async () => button('[data-ai-generate]').click());
    expect(access.prepareNarration).not.toHaveBeenCalled();
    expect(io.generate).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Voice"]')?.value).toBe(
      'retained voice'
    );
  }
);
