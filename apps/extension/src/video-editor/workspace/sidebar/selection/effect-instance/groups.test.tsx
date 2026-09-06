// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import { translate } from '../../../../../platform/i18n';
import { createEffectInstanceGroup } from './groups';
import { createVideoClipFromAsset } from '../../../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../../../features/video/project/types';
import {
  createSelectionPanelProps,
  WorkspaceSidebarSelectionPanel,
} from '../../panel-content/selection-panel';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function renderStack(disabled = false, composed = false) {
  const project = createEmptyVideoProject('Effect stack');
  project.duration = 10;
  project.effectInstances = ['first', 'last'].map((id) => ({
    id,
    kind: 'targetEffect',
    snapshotId: 'unavailable-source',
    enabled: true,
    controls: {},
    duration: 2,
    playbackRate: 1,
    startTime: 0,
    target: { kind: 'clip', clipId: 'clip' },
  }));
  const actions = {
    onDeleteEffectInstance: vi.fn(),
    onDuplicateEffectInstance: vi.fn(() => 'copy'),
    onMoveEffectInstance: vi.fn(),
    onUpdateEffectInstance: vi.fn(),
  };
  if (composed) {
    const asset = createVideoProjectAsset(
      'Video',
      VideoProjectAssetType.VIDEO,
      { kind: 'project-asset', projectAssetId: 'video' },
      {
        audioPeaks: null,
        duration: 5,
        hasAudio: false,
        height: 1080,
        mimeType: 'video/mp4',
        size: 100,
        width: 1920,
      }
    );
    const clip = {
      ...createVideoClipFromAsset(project.tracks[0]!.id, asset, project.width, project.height, 0),
      id: 'clip',
    };
    project.assets.push(asset);
    project.clips.push(clip);
    const props = createSelectionPanelProps({
      project,
      selectedClip: clip,
      selectedTrack: project.tracks[0]!,
      selection: { kind: 'clip', clipId: clip.id },
      onAddActionEvent: vi.fn(),
      onDetachClipGroup: vi.fn(),
      onEnableCursorTrack: vi.fn(),
      onResizeProject: vi.fn(),
      onSetCursorCaptureMode: vi.fn(),
      onSetSceneBackground: vi.fn(),
      onUpdateClipAudioEnvelope: vi.fn(),
      onUpdateClipFades: vi.fn(),
      onUpdateClipMuted: vi.fn(),
      onUpdateClipTransform: vi.fn(),
      onUpdateClipVolume: vi.fn(),
      onUpdateCursorSkin: vi.fn(),
      onUpdateMediaClipFitMode: vi.fn(),
      onUpdateShapeStyle: vi.fn(),
      onUpdateTextContent: vi.fn(),
      onUpdateTextStyle: vi.fn(),
      ...actions,
    });
    act(() => root.render(<WorkspaceSidebarSelectionPanel {...props} />));
    const effects = [...container.querySelectorAll<HTMLButtonElement>('nav button')].find(
      (button) =>
        button.getAttribute('aria-label') === translate('videoEditor.effectsLibrary.effectV1Label')
    )!;
    act(() => effects.click());
  } else {
    act(() =>
      root.render(
        createEffectInstanceGroup({
          project,
          disabled,
          target: { kind: 'clip', clipId: 'clip' },
          ...actions,
        }).content
      )
    );
  }
  return actions;
}
function action(
  card: Element,
  key: 'moveUp' | 'moveDown' | 'deleteInstance' | 'duplicateInstance'
) {
  const label = translate(`videoEditor.effectsLibrary.${key}`);
  const button = [...card.querySelectorAll('button')].find(
    (node) => node.getAttribute('aria-label') === label || node.textContent === label
  );
  if (!button) throw new Error(`Missing ${key}`);
  return button;
}
it('disables impossible edge moves while routing available order, duplicate and delete actions', () => {
  const handlers = renderStack();
  const cards = container.querySelectorAll('section');
  expect(cards).toHaveLength(2);
  expect(action(cards[0]!, 'moveUp').disabled).toBe(true);
  expect(action(cards[1]!, 'moveDown').disabled).toBe(true);
  act(() => {
    action(cards[0]!, 'moveUp').click();
    action(cards[0]!, 'moveDown').click();
    action(cards[1]!, 'duplicateInstance').click();
    action(cards[1]!, 'deleteInstance').click();
  });
  expect(handlers.onMoveEffectInstance).toHaveBeenCalledExactlyOnceWith('first', 'down');
  expect(handlers.onDuplicateEffectInstance).toHaveBeenCalledExactlyOnceWith('last');
  expect(handlers.onDeleteEffectInstance).toHaveBeenCalledExactlyOnceWith('last');
  expect(container.textContent).not.toContain('unavailable-source');
});
it('keeps all instance actions unavailable when its target is locked', () => {
  const handlers = renderStack(true);
  for (const card of container.querySelectorAll('section')) {
    for (const key of ['moveUp', 'moveDown', 'duplicateInstance', 'deleteInstance'] as const) {
      const button = action(card, key);
      expect(button.disabled).toBe(true);
      act(() => button.click());
    }
  }
  expect(handlers.onMoveEffectInstance).not.toHaveBeenCalled();
  expect(handlers.onDuplicateEffectInstance).not.toHaveBeenCalled();
  expect(handlers.onDeleteEffectInstance).not.toHaveBeenCalled();
});

it('routes duplicate and order through the composed selection panel into the effect inspector', () => {
  const handlers = renderStack(false, true);
  const cards = container.querySelectorAll('[data-effect-instance]');
  expect(cards).toHaveLength(2);
  act(() => {
    action(cards[0]!, 'duplicateInstance').click();
    action(cards[0]!, 'moveDown').click();
  });
  expect(handlers.onDuplicateEffectInstance).toHaveBeenCalledExactlyOnceWith('first');
  expect(handlers.onMoveEffectInstance).toHaveBeenCalledExactlyOnceWith('first', 'down');
});
