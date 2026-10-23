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
  prepare: vi.fn(),
  generate: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock('../../../workflows/ai-settings/query', () => ({
  requestAIModelSelectionBootstrap: io.catalog,
}));
vi.mock('../../../workflows/scenario-narration/generation', () => ({
  prepareScenarioNarrationBatch: io.prepare,
  generateScenarioNarration: io.generate,
  cleanupScenarioNarrationPreview: io.cleanup,
}));
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
  io.catalog.mockResolvedValue({
    chromeAiEnabled: false,
    defaultModelId: 'm',
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
        connectionType: 'openai-compatible',
        destinationKind: 'external',
        hasStoredApiKey: true,
        createdAt: 1,
      },
    ],
  });
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
