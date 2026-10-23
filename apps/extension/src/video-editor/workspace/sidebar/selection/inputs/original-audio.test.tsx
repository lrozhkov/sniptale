// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../../features/video/project/factories/creation';
import {
  createAudioClipFromAsset,
  createVideoClipFromAsset,
} from '../../../../../features/video/project/factories/clip';
import type { VideoProjectVoicePlacement } from '../../../../../features/video/project/text/authoring';
import { OriginalAudioPlacementFields, ProjectOriginalAudioEditor } from './original-audio';
import { InspectorLayout } from '../../../../../ui/compact-inspector-controls/layout';
import { translate } from '../../../../../platform/i18n';

import { useVideoEditorStore } from '../../../../state/store';

let original: ReturnType<typeof useVideoEditorStore.getState>;
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  original = useVideoEditorStore.getState();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useVideoEditorStore.setState(original, true);
  vi.unstubAllGlobals();
});
function fixture() {
  const project = createEmptyVideoProject('Original controls');
  const asset = createVideoProjectAsset(
    'Long source. Привет Łukasz 中文',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'local-source' },
    {
      width: 640,
      height: 360,
      duration: 8,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const source = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360);
  project.assets = [asset];
  project.clips = [source];
  return { project, source };
}
function command(key: Parameters<typeof translate>[0]) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === translate(key)
  );
  if (!button) throw new Error(`Missing ${key}`);
  act(() => button.click());
}
it('keeps the original by default and requires explicit source choice before an attenuation draft is complete', () => {
  const { project, source } = fixture();
  let value: VideoProjectVoicePlacement['originalAudioMute'];
  function Harness() {
    const [draft, setDraft] = useState(value);
    value = draft;
    return (
      <InspectorLayout>
        <OriginalAudioPlacementFields
          project={project}
          value={draft}
          disabled={false}
          onChange={setDraft}
        />
      </InspectorLayout>
    );
  }
  act(() => root.render(<Harness />));
  expect(host.querySelector('input[type=checkbox]')).toBeNull();
  command('videoEditor.sidebar.originalAudioAttenuate');
  expect(value).toEqual({ volume: 0.25, targets: [] });
  const checkbox = host.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  expect(checkbox.checked).toBe(false);
  expect(checkbox.closest('label')?.textContent).toContain(source.name);
  act(() => checkbox.click());
  expect(value).toEqual({
    volume: 0.25,
    targets: [{ assetId: source.assetId, sourceInstanceId: source.id }],
  });
  command('videoEditor.sidebar.originalAudioMute');
  expect(value?.volume).toBe(0);
  expect(value?.targets).toHaveLength(1);
  command('videoEditor.sidebar.originalAudioKeep');
  expect(value).toBeUndefined();
});
it('preserves disabled selected values and keeps unavailable modes disabled without selecting a source', () => {
  const { project, source } = fixture();
  const onChange = vi.fn();
  const value = { volume: 0, targets: [{ assetId: source.assetId, sourceInstanceId: source.id }] };
  act(() =>
    root.render(
      <InspectorLayout>
        <OriginalAudioPlacementFields
          project={project}
          value={value}
          disabled
          onChange={onChange}
        />
      </InspectorLayout>
    )
  );
  const checkbox = host.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  expect(checkbox.checked).toBe(true);
  expect(checkbox.disabled).toBe(true);
  act(() => checkbox.click());
  expect(onChange).not.toHaveBeenCalled();
  act(() =>
    root.render(
      <InspectorLayout>
        <OriginalAudioPlacementFields
          project={{ ...project, clips: [] }}
          value={undefined}
          disabled={false}
          onChange={onChange}
        />
      </InspectorLayout>
    )
  );
  command('videoEditor.sidebar.originalAudioMute');
  expect(onChange).not.toHaveBeenCalled();
});

it('keeps an unavailable selected source visible and removable without clearing the remaining choice', () => {
  const { project, source } = fixture();
  const missing = { assetId: 'removed-asset', sourceInstanceId: 'removed-instance' };
  let value: VideoProjectVoicePlacement['originalAudioMute'] = {
    volume: 0.25,
    targets: [{ assetId: source.assetId, sourceInstanceId: source.id }, missing],
  };
  function Harness() {
    const [draft, setDraft] = useState(value);
    value = draft;
    return (
      <InspectorLayout>
        <OriginalAudioPlacementFields
          project={project}
          value={draft}
          disabled={false}
          onChange={setDraft}
        />
      </InspectorLayout>
    );
  }
  act(() => root.render(<Harness />));
  const inputs = [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
  expect(inputs).toHaveLength(2);
  expect(inputs.every((input) => input.checked)).toBe(true);
  expect(inputs[1]!.closest('label')?.textContent).toContain(
    translate('videoEditor.sidebar.originalAudioMissingSource')
  );
  act(() => inputs[1]!.click());
  expect(value?.targets).toEqual([{ assetId: source.assetId, sourceInstanceId: source.id }]);
});

function setLevel(value: string) {
  const input = host.querySelector<HTMLInputElement>(
    `input[aria-label="${translate('videoEditor.sidebar.originalAudioLevel')}"]`
  )!;
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
}

it('changes an existing original level and restores only its override with focus recovery and Undo', () => {
  const { project, source } = fixture();
  const track = createVideoProjectTrack('Voice', 1, 'AUDIO');
  const take = createAudioClipFromAsset(track.id, project.assets[0]!);
  take.originalAudioMute = {
    volume: 0.25,
    targets: [{ assetId: source.assetId, sourceInstanceId: source.id }],
  };
  project.tracks.push(track);
  project.clips.push(take);
  useVideoEditorStore.getState().setProject(project);
  function Harness() {
    const current = useVideoEditorStore((state) => state.project)!;
    const clip = current.clips.find((clip) => clip.id === take.id)!;
    return (
      <InspectorLayout>
        <section data-section="audio">
          <input aria-label={translate('videoEditor.sidebar.volumeLabel')} />
          {clip.type === 'AUDIO' ? (
            <ProjectOriginalAudioEditor project={current} clip={clip} disabled={false} />
          ) : null}
        </section>
      </InspectorLayout>
    );
  }
  act(() => root.render(<Harness />));
  const before = structuredClone(useVideoEditorStore.getState().project!.clips[1]!);
  setLevel('45');
  const changed = useVideoEditorStore.getState().project!.clips[1]!;
  expect(changed).toMatchObject({ originalAudioMute: { volume: 0.45 } });
  expect(changed).toEqual({
    ...before,
    originalAudioMute: { ...take.originalAudioMute, volume: 0.45 },
  });
  command('videoEditor.sidebar.originalAudioRestore');
  expect(useVideoEditorStore.getState().project!.clips[1]).not.toHaveProperty('originalAudioMute');
  expect(document.activeElement?.getAttribute('aria-label')).toBe(
    translate('videoEditor.sidebar.volumeLabel')
  );
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.clips[1]).toMatchObject({
    originalAudioMute: { volume: 0.45 },
  });
});
