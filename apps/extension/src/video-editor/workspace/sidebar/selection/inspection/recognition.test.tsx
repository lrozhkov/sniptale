// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../../features/video/project/factories/clip';
import { VideoProjectAssetType, VideoTrackKind } from '../../../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../../../contracts/selection';
import type { VideoProjectRecognitionController } from '../../../../runtime/session/recognition';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { WorkspaceSidebarSelectionPanel } from '../../panel-content/selection-panel';

vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) =>
    key === 'gallery.videoReview.speechConsentAudio'
      ? 'Send audio to {provider}'
      : key === 'videoEditor.timeline.secondsSuffix'
        ? 's'
        : key,
  getCurrentLocale: () => 'en',
  useAppLocale: () => 'en',
}));

let host: HTMLDivElement;
let root: Root;
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

function createController(): VideoProjectRecognitionController {
  return {
    running: false,
    applying: false,
    accepted: false,
    error: null,
    completed: 0,
    total: 0,
    proposal: null,
    catalog: {
      chromeAiEnabled: false,
      defaultModelId: 'speech-model',
      globalSystemPrompt: '',
      models: [
        {
          id: 'speech-model',
          providerId: 'provider',
          modelCode: 'speech',
          displayName: 'Speech Model',
        },
      ],
      providers: [
        {
          id: 'provider',
          name: 'Approved Provider',
          connectionType: 'openai-compatible',
          createdAt: 1,
          hasStoredApiKey: true,
          destinationKind: 'external',
        },
      ],
    },
    loadModels: vi.fn(async () => undefined),
    recognize: vi.fn(),
    apply: vi.fn(),
    edit: vi.fn(),
    discard: vi.fn(),
    cancel: vi.fn(),
  };
}

function createSelectionHandlers() {
  return {
    onAddActionEvent: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onClearCursorSampleSkinOverride: vi.fn(),
    onClearPlacementMode: vi.fn(),
    onDeleteActionEvent: vi.fn(),
    onDeleteCursorSample: vi.fn(),
    onDeleteMotionRegion: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onInsertCursorSample: vi.fn(),
    onPreviewSceneBackground: vi.fn(),
    onRememberRecentColor: vi.fn(async () => undefined),
    onResetSceneBackgroundPreview: vi.fn(),
    onResizeProject: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onStartActionPointPlacement: vi.fn(),
    onStartMotionAreaPlacement: vi.fn(),
    onStartMotionFocusPlacement: vi.fn(),
    onStartObjectTrackAnchorPlacement: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateAnnotationClipContent: vi.fn(),
    onUpdateAnnotationClipStyle: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onApplyCameraLayout: vi.fn(),
    onEditCameraPosition: vi.fn(),
    canAddCameraPosition: true,
    onUpdateClipVolume: vi.fn(),
    onUpdateCursorSampleInterpolation: vi.fn(),
    onUpdateCursorSampleSkinOverride: vi.fn(),
    onUpdateCursorSampleVisibility: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
    onUpdateTransitionDuration: vi.fn(),
    onUpdateTransitionEasing: vi.fn(),
    onUpdateTransitionTemplate: vi.fn(),
    onDuplicateEffectInstance: vi.fn(),
    onUpdateEffectInstance: vi.fn(),
    onUpsertObjectTrackCorrectionAnchor: vi.fn(),
  };
}

function createProps(
  controller = createController(),
  hasAudio = true
): WorkspaceSidebarSelectionPanelProps {
  const project = createEmptyVideoProject('Recognition');
  const asset = createVideoProjectAsset(
    'Native recording',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'audio-source' },
    {
      audioPeaks: null,
      duration: 20,
      hasAudio,
      height: 1080,
      width: 1920,
      mimeType: 'video/mp4',
      size: 100,
    }
  );
  const clip = createVideoClipFromAsset(
    project.tracks.find((track) => track.kind === VideoTrackKind.PRIMARY)!.id,
    asset,
    project.width,
    project.height,
    40
  );
  if (clip.type !== 'VIDEO') throw new Error('Expected video recognition fixture');
  clip.sourceStart = 4;
  clip.sourceDuration = 8;
  clip.duration = 4;
  clip.playbackRate = 2;
  project.assets.push(asset);
  project.clips.push(clip);
  return {
    ...createSelectionHandlers(),
    recognition: controller,
    project,
    placementMode: null,
    recentColors: [],
    selectedClip: clip,
    selectedTrack: null,
    selectedActionOccurrence: null,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedTransition: null,
    selection: { kind: VideoEditorSelectionKind.CLIP, clipId: clip.id },
  };
}
function render(props: WorkspaceSidebarSelectionPanelProps) {
  act(() => root.render(<WorkspaceSidebarSelectionPanel {...props} />));
}
function button(label: string): HTMLButtonElement {
  const node = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (entry) => entry.textContent === label || entry.title === label
  );
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
}
function click(label: string) {
  act(() => button(label).click());
}
function open(props: WorkspaceSidebarSelectionPanelProps) {
  render(props);
  click('gallery.videoReview.recognitionTitle');
}
function setInput(label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!field) throw new Error(`Missing input: ${label}`);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}
function addProposal(
  props: WorkspaceSidebarSelectionPanelProps,
  controller: VideoProjectRecognitionController
) {
  const clip = props.selectedClip!;
  if (clip.type !== 'VIDEO' && clip.type !== 'AUDIO') throw new Error('Expected media source');
  controller.proposal = {
    job: {
      id: 'job',
      project: props.project,
      revision: 1,
      localUpdatedAt: props.project.updatedAt,
      basis: 'basis',
      identity: 'identity',
      source: new Blob(),
      chunks: [],
      options: {
        clipId: clip.id,
        modelId: 'speech-model',
        approvedProviderId: 'provider',
        start: 4,
        end: 12,
        grouping: 'sentences-pauses',
      },
    },
    entry: {
      id: 'proposal',
      binding: {
        kind: 'source',
        assetId: clip.assetId,
        sourceInstanceId: 'sourceInstanceId' in clip ? (clip.sourceInstanceId ?? clip.id) : clip.id,
      },
      document: {
        version: 1,
        fragments: [
          {
            id: 'fragment',
            start: 4,
            end: 6,
            originalText: 'Recognized',
            text: 'Recognized',
            revision: 0,
            alignment: 'segment',
            timeDomain: 'source',
            timingRevision: 0,
            showInVideo: true,
          },
        ],
      },
    },
  };
}

describe('project recognition inspector', () => {
  it('forwards the mounted recognition controller through the complete selection body', () => {
    const controller = createController();
    const props = createProps(controller);
    open(props);
    expect(host.querySelector('[data-ui="video-editor.recognition.panel"]')).not.toBeNull();
    expect(controller.loadModels).toHaveBeenCalledOnce();
    expect(controller.recognize).not.toHaveBeenCalled();
    click('gallery.videoReview.recognitionStart');
    const consent = host.querySelector('[data-ui="video-editor.recognition.consent"]');
    expect(consent?.textContent).toContain('Approved Provider');
    expect(consent?.textContent).toContain('Speech Model');
    expect(consent?.textContent).toContain('Native recording');
    expect(consent?.textContent).toContain('4–12 s');
    expect(controller.recognize).not.toHaveBeenCalled();
    click('gallery.videoReview.speechConsentContinue');
    expect(controller.recognize).toHaveBeenCalledExactlyOnceWith({
      clipId: props.selectedClip!.id,
      modelId: 'speech-model',
      approvedProviderId: 'provider',
      start: 4,
      end: 12,
      grouping: 'sentences-pauses',
    });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('cancels consent without starting a job and preserves approved options across catalog changes', () => {
    const controller = createController();
    const props = createProps(controller);
    open(props);
    click('gallery.videoReview.recognitionStart');
    click('common.actions.cancel');
    expect(controller.recognize).not.toHaveBeenCalled();
    expect(host.querySelector('[data-ui="video-editor.recognition.consent"]')).toBeNull();
    setInput('gallery.videoReview.textFragmentStart', '5');
    click('gallery.videoReview.recognitionStart');
    expect(host.querySelector('fieldset')?.disabled).toBe(true);
    controller.catalog = { ...controller.catalog!, defaultModelId: 'another-model', models: [] };
    render(props);
    expect(
      host.querySelector('[data-ui="video-editor.recognition.consent"]')?.textContent
    ).toContain('Speech Model');
    click('gallery.videoReview.speechConsentContinue');
    expect(controller.recognize).toHaveBeenCalledExactlyOnceWith({
      clipId: props.selectedClip!.id,
      modelId: 'speech-model',
      approvedProviderId: 'provider',
      start: 5,
      end: 12,
      grouping: 'sentences-pauses',
    });
  });

  it.each([true, false])(
    'disables recognition for invalid ranges or absent audio (audio=%s)',
    (hasAudio) => {
      const controller = createController();
      open(createProps(controller, hasAudio));
      if (hasAudio) setInput('gallery.videoReview.textFragmentEnd', '4');
      expect(button('gallery.videoReview.recognitionStart').disabled).toBe(true);
      expect(host.textContent).toContain('videoEditor.sidebar.recognitionInvalidRange');
      click('gallery.videoReview.recognitionStart');
      expect(controller.recognize).not.toHaveBeenCalled();
      expect(host.querySelector('[data-ui="video-editor.recognition.consent"]')).toBeNull();
    }
  );

  it('keeps missing model or provider from reaching consent and offers model reload', () => {
    const controller = createController();
    controller.catalog = null;
    const props = createProps(controller);
    open(props);
    expect(button('gallery.videoReview.recognitionStart').disabled).toBe(true);
    click('gallery.videoReview.speechReloadModels');
    expect(controller.loadModels).toHaveBeenCalledTimes(2);
    controller.catalog = { ...createController().catalog!, providers: [] };
    render(props);
    expect(button('gallery.videoReview.recognitionStart').disabled).toBe(true);
    expect(controller.recognize).not.toHaveBeenCalled();
  });

  it('edits the disposable proposal and applies only after the explicit Apply action', () => {
    const controller = createController();
    const props = createProps(controller);
    addProposal(props, controller);
    open(props);
    const field = host.querySelector('textarea')!;
    expect(field.value).toBe('Recognized');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        field,
        'Corrected'
      );
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(controller.edit).toHaveBeenCalledExactlyOnceWith('fragment', 'Corrected');
    expect(controller.apply).not.toHaveBeenCalled();
    click('gallery.videoReview.recognitionApply');
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith('add');
    click('gallery.videoReview.recognitionDiscard');
    expect(controller.discard).toHaveBeenCalledOnce();
    expect(controller.recognize).not.toHaveBeenCalled();
  });

  it('retains a failed save proposal for Apply retry and seals accepted work', () => {
    const controller = createController();
    const props = createProps(controller);
    addProposal(props, controller);
    controller.proposal!.receipt = controller.proposal!.entry;
    controller.error = 'failed';
    open(props);
    expect(host.textContent).toContain('videoEditor.sidebar.recognitionSaveRetry');
    expect(host.querySelector('textarea')?.disabled).toBe(true);
    expect(host.querySelector('fieldset')?.disabled).toBe(true);
    expect(host.querySelector('[aria-label="gallery.videoReview.recognitionMode"]')).toBeNull();
    expect(button('videoEditor.sidebar.recognitionClose').disabled).toBe(false);
    click('videoEditor.sidebar.recognitionClose');
    expect(controller.discard).toHaveBeenCalledOnce();
    expect(host.querySelector('textarea')?.disabled).toBe(true);
    click('gallery.videoReview.recognitionApply');
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith('add');
    controller.accepted = true;
    controller.error = null;
    render(props);
    expect(host.textContent).toContain('videoEditor.sidebar.recognitionSaved');
    expect(button('gallery.videoReview.recognitionApply').disabled).toBe(true);
    expect(host.querySelector('textarea')?.disabled).toBe(true);
    expect(controller.recognize).not.toHaveBeenCalled();
  });

  it('shows progress and cancel for recognition but prevents cancel during publication', () => {
    const controller = createController();
    controller.running = true;
    controller.completed = 1;
    controller.total = 3;
    const props = createProps(controller);
    open(props);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('1 / 3');
    click('common.actions.cancel');
    expect(controller.cancel).toHaveBeenCalledOnce();
    controller.applying = true;
    render(props);
    expect(host.querySelector('[role="status"] button')).toBeNull();
  });
  it('captures audio-chat mode and instructions in the explicitly approved request', async () => {
    const controller = createController();
    const model = controller.catalog!.models[0]!;
    model.audio = {
      transcription: {
        transport: 'audio-chat',
        chatProtocol: 'openai',
        structuredOutput: 'json_schema',
        responseFormat: 'json',
        timestampGranularity: 'none',
      },
    };
    open(createProps(controller));
    const processing = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.recognitionProcessingMode"]'
    );
    if (!processing) throw new Error('Missing processing mode');
    act(() => processing.click());
    const rewrite = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (option) => option.textContent?.includes('gallery.videoReview.recognitionRewrite')
    );
    if (!rewrite) throw new Error('Missing rewrite choice');
    await act(async () => rewrite.click());
    const instructions = host.querySelector('textarea');
    if (!instructions) throw new Error('Missing instructions');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        instructions,
        'Keep the meaning.'
      );
      instructions.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click('gallery.videoReview.recognitionStart');
    expect(controller.recognize).not.toHaveBeenCalled();
    click('gallery.videoReview.speechConsentContinue');
    expect(controller.recognize).toHaveBeenCalledWith(
      expect.objectContaining({
        recognition: { mode: 'rewrite', granularity: 'sentence', prompt: 'Keep the meaning.' },
      })
    );
  });
  it('explains replacement only before an explicit Replace and uses operation-neutral save recovery', async () => {
    const controller = createController();
    const props = createProps(controller);
    addProposal(props, controller);
    open(props);
    expect(host.textContent).not.toContain('gallery.videoReview.recognitionReplaceHint');
    const mode = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.recognitionMode"]'
    );
    if (!mode) throw new Error('Missing application mode');
    act(() => mode.click());
    const replace = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (option) => option.textContent?.includes('gallery.videoReview.recognitionReplace')
    );
    if (!replace) throw new Error('Missing Replace choice');
    await act(async () => replace.click());
    expect(host.textContent).toContain('gallery.videoReview.recognitionReplaceHint');
    controller.proposal!.receipt = controller.proposal!.entry;
    controller.error = 'storage-failed';
    render(props);
    expect(host.textContent).not.toContain('gallery.videoReview.recognitionReplaceHint');
    expect(host.querySelector('[aria-label="gallery.videoReview.recognitionMode"]')).toBeNull();
    expect(host.textContent).toContain('videoEditor.sidebar.recognitionSaveRetry');
    expect(host.textContent).toContain('videoEditor.sidebar.recognitionFailed');
  });
});
