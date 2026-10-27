// @vitest-environment jsdom
import { voiceFixture } from './voice.test-support';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import {
  pagePreparationHistory,
  type PagePreparationHistoryBridge,
} from '../../../parser/page-preparation/history';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import { TextRewriteControl } from './view';
import { installEditableKeydownBridge } from '../../../runtime/ui-activation-bridge/targets';

const trusted = vi.hoisted(() => new WeakSet<Event>());
const mocks = vi.hoisted(() => ({ request: vi.fn(), models: vi.fn(), remember: vi.fn() }));
vi.mock('../../../../features/prompt-templates/hooks/use-prompt-templates', () => ({
  usePromptTemplates: () => ({
    isLoading: false,
    error: null,
    templates: [
      { id: 'shorten', name: 'Shorten', content: 'Make the selected text concise.', enabled: true },
    ],
  }),
}));
vi.mock('./request', () => ({ requestTextReplacement: mocks.request }));
vi.mock('../../../../workflows/ai-settings/query', async (original) => ({
  ...(await original<typeof import('../../../../workflows/ai-settings/query')>()),
  requestAIScenarioModelSelection: mocks.models,
  rememberAIScenarioModelSelection: mocks.remember,
}));
vi.mock('../../../../platform/i18n', async (original) => {
  const actual = await original<typeof import('../../../../platform/i18n')>();
  return {
    ...actual,
    translate: (key: Parameters<typeof actual.translate>[0]) =>
      key.startsWith('aiModal.disclosure') || key === 'content.toolbar.aiTextDisclosureData'
        ? actual.translate(key)
        : key,
  };
});
vi.mock('../../../../composition/voice-input/trusted-events', async (original) => {
  const isTrusted = (event: Event) => event.isTrusted || trusted.has(event);
  return {
    ...(await original<typeof import('../../../../composition/voice-input/trusted-events')>()),
    isTrustedDomEvent: isTrusted,
    isTrustedMouseEvent: isTrusted,
    isTrustedPointerEvent: isTrusted,
    isTrustedKeyboardEvent: isTrusted,
  };
});
vi.mock('../../../../composition/persistence/settings', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: vi.fn(async () => ({
    voiceInput: {
      enabled: true,
      language: 'en-US',
      microphoneDeviceId: null,
      mode: 'browser-managed',
    },
  })),
  subscribeToVoiceInputPreferencesChanges: vi.fn(() => vi.fn()),
}));
vi.mock('../../../selection/locker', () => ({ setNavigationInputShieldSuspended: vi.fn() }));
export let root: Root;
export let shadow: ShadowRoot;
let cleanupKeyboardBridge: () => void;
export let target: HTMLParagraphElement;
const bridge: PagePreparationHistoryBridge = {
  captureSnapshot: () => ({
    annotations: browserAnnotationSession.captureSnapshot(),
    frameSession: {
      frames: [],
      globalEffectMode: 'border',
      globalStepBadgeSettings: { autoMode: true },
      sessionBorderPreset: DEFAULT_BORDER_PRESET,
      sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: false },
      sessionCalloutStyle: null,
      sessionFocusSettings: { opacity: 0.5, showBorder: false },
      sessionStepBadgeTemplate: null,
      stepBadgeOrder: [],
    },
  }),
  applySnapshot: (snapshot) => browserAnnotationSession.applySnapshot(snapshot.annotations),
};
export function Harness(props: { active?: boolean; visible?: boolean }) {
  const [enabled, setEnabled] = useState(true);
  return (
    <TextRewriteControl
      visible={props.visible ?? true}
      active={(props.active ?? true) && enabled}
      onActiveChange={setEnabled}
    />
  );
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export function ui<T extends HTMLElement = HTMLElement>(name: string): T {
  const element = shadow.querySelector<T>(`[data-ui="${name}"]`);
  if (!element) throw new Error(`Missing test UI: ${name}`);
  return element;
}
export async function click(element: HTMLElement, admitted = true) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: false });
  if (admitted) trusted.add(event);
  await act(async () => element.dispatchEvent(event));
}
export async function fill(value: string) {
  const input = ui<HTMLTextAreaElement>('content.ai-text.prompt');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Textarea value setter is unavailable');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
}
export async function selectTarget() {
  await click(target);
}
export async function submit() {
  await click(ui('content.ai-text.submit'));
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.request.mockReset().mockResolvedValue('Edited source');
  mocks.remember.mockReset().mockResolvedValue(undefined);
  mocks.models.mockReset().mockResolvedValue({
    scenario: 'page-edit',
    remembered: null,
    resolution: { status: 'initial', modelId: 'model', previousSelection: null, reason: null },
    models: [
      { id: 'model', providerId: 'provider', modelCode: 'code', displayName: 'Text model' },
      {
        id: 'other',
        providerId: 'provider',
        modelCode: 'other-code',
        displayName: 'Other text model',
      },
    ],
    providers: [
      {
        id: 'provider',
        name: 'Provider',
        connectionType: 'neuraldeep',
        incarnation: 'page-provider-incarnation',
        createdAt: 1,
        hasStoredApiKey: true,
        destinationKind: 'external',
        destinationBinding: `sha256:${'a'.repeat(64)}`,
      },
    ],
  });
  voiceFixture.reset();
  document.body.replaceChildren();
  browserAnnotationSession.resetForDocument();
  pagePreparationHistory.clear();
  pagePreparationHistory.registerBridge(bridge);
  const rect = DOMRect.fromRect({ width: 200, height: 30 });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() =>
    Object.assign([rect], { item: (index: number) => (index === 0 ? rect : null) })
  );
  const owner = document.createElement('div');
  document.body.append(owner);
  shadow = owner.attachShadow({ mode: 'open' });
  cleanupKeyboardBridge = installEditableKeydownBridge(shadow);
  const app = initializeContentUiRoots(shadow).appContainer;
  target = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = 'Original';
  target.append(strong, document.createTextNode(' words'));
  document.body.append(target);
  root = createRoot(app);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  cleanupKeyboardBridge();
  pagePreparationHistory.clear();
  pagePreparationHistory.unregisterBridge(bridge);
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

export { mocks, trusted };
