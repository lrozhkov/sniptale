import { useState } from 'react';
import {
  createVideoProjectBookendPresets,
  parseVideoProjectBookendPresets,
  selectVideoProjectBookendMaterial,
} from '../../../../../features/video/project/scene/bookend-presets';
import type { VideoProjectBookendPreset } from '../../../../../features/video/project/scene/bookend-presets-types';
import type {
  BookendImagePresentation,
  BookendVideoPresentation,
} from '../../../../../features/video/project/scene/bookend-media';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import { translate } from '../../../../../platform/i18n';
import { SegmentedRow } from '../../../../../ui/compact-inspector-controls';
import { PresentationJoinFields } from '../../../../../ui/presentation-join-fields';
import type { CompositionJoinSettings } from '../../../../../features/video/project/scene/composition-join';
import { PresentationMediaFields } from '../../../../../ui/presentation-media-fields';
import { useVideoEditorTimelineEditingPort } from '../../../../runtime/controller/store';
import { InspectorDetails } from '../shared/details';
import { SceneBookendMaterials } from './scene-bookend-materials';
import { SceneBookendPreview } from './scene-bookend-preview';

type Mode = VideoProjectBookendPreset['mode'];

/** Authoring changes only the retained insertion recipe, never an existing instance. */
export function SceneBookendPreset(props: { project: VideoProject; side: 'intro' | 'outro' }) {
  const editor = useBookendPresetEditing(props);
  const { mode, slot, asset, current, refused, patch } = editor;
  const common = { Details: InspectorDetails, preferenceId: `scene-bookend-preset.${props.side}` };
  return (
    <div className="min-w-0 space-y-2" data-ui="video-editor.scene-bookends.preset">
      <SegmentedRow
        ariaLabel={translate('videoEditor.sidebar.bookendPreset')}
        columns={3}
        value={mode}
        options={[
          { value: 'none', label: translate('gallery.videoReview.presentationNone') },
          { value: 'image', label: translate('gallery.videoReview.presentationImage') },
          { value: 'video', label: translate('gallery.videoReview.presentationVideo') },
        ]}
        onChange={editor.changeMode}
      />
      {mode !== 'none' && (
        <SceneBookendMaterials
          project={props.project}
          kind={mode}
          label={translate(
            mode === 'image'
              ? 'videoEditor.sidebar.bookendChooseImage'
              : 'videoEditor.sidebar.bookendChooseVideo'
          )}
          onChoose={editor.choose}
        />
      )}
      {asset && current && (
        <SceneBookendPreview asset={asset} settings={current} output={props.project} />
      )}
      {mode === 'image' && slot.image && (
        <PresentationMediaFields
          {...common}
          kind="image"
          value={slot.image}
          onChange={(value) => patch(value, false)}
          onPreview={(value) => patch(value, true)}
        />
      )}
      {mode === 'video' && slot.video && asset && asset.metadata.duration !== null && (
        <PresentationMediaFields
          {...common}
          kind="video"
          value={slot.video}
          sourceDuration={asset.metadata.duration}
          hasAudio={asset.metadata.hasAudio}
          onChange={(value) => patch(value, false)}
          onPreview={(value) => patch(value, true)}
        />
      )}
      {mode !== 'none' && (
        <PresentationJoinFields
          label={translate(
            props.side === 'intro'
              ? 'gallery.videoReview.presentationJoinIntro'
              : 'gallery.videoReview.presentationJoinOutro'
          )}
          value={editor.transition}
          Details={InspectorDetails}
          preferenceId={`scene-bookend-preset.${props.side}`}
          onChange={editor.changeTransition}
          onPreview={editor.previewTransition}
        />
      )}
      {refused && (
        <p role="alert" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('common.errors.actionFailed')}
        </p>
      )}
    </div>
  );
}

/** One disposable panel owns empty-kind intent, visual drafts and command feedback. */
function useBookendPresetEditing(props: { project: VideoProject; side: 'intro' | 'outro' }) {
  const update = useVideoEditorTimelineEditingPort((port) => port.updateBookendPresets);
  const settings = props.project.bookendPresets ?? createVideoProjectBookendPresets();
  const slot = settings[props.side];
  const [pending, setPending] = useState<{ project: VideoProject; mode: Mode } | null>(null);
  const [preview, setPreview] = useState<{
    project: VideoProject;
    value: BookendImagePresentation | BookendVideoPresentation;
  } | null>(null);
  const [refused, setRefused] = useState(false);
  const [joinDraft, setJoinDraft] = useState<{
    project: VideoProject;
    value: CompositionJoinSettings;
  } | null>(null);
  const transitionKey = props.side === 'intro' ? 'introTransition' : 'outroTransition';
  const transition =
    joinDraft?.project === props.project ? joinDraft.value : settings[transitionKey];
  const mode = pending?.project === props.project ? pending.mode : slot.mode;
  const media = mode === 'image' ? slot.image : mode === 'video' ? slot.video : null;
  const asset = media ? props.project.assets.find(({ id }) => id === media.assetId) : null;
  const commitSettings = (proposal: unknown) => {
    const parsed = parseVideoProjectBookendPresets(proposal);
    const result = parsed ? update(parsed, props.project) : null;
    setRefused(!result || result.status === 'rejected');
    setPreview(null);
    setJoinDraft(null);
    if (result && result.status !== 'rejected') setPending(null);
  };
  const commit = (proposal: unknown) => commitSettings({ ...settings, [props.side]: proposal });
  const changeTransition = (value: CompositionJoinSettings | null) => {
    const next = { ...settings };
    if (value) next[transitionKey] = value;
    else delete next[transitionKey];
    commitSettings(next);
  };
  const previewTransition = (value: CompositionJoinSettings | null) =>
    setJoinDraft(value ? { project: props.project, value } : null);
  const patch = (
    value: BookendImagePresentation | BookendVideoPresentation | null,
    transient: boolean
  ) => {
    if (transient) setPreview(value ? { project: props.project, value } : null);
    else if (value && media) commit({ ...slot, [mode]: { ...media, ...value } });
  };
  const current = preview?.project === props.project ? preview.value : media;
  const changeMode = (next: Mode) => {
    setPreview(null);
    if (next === 'none' || slot[next]) commit({ ...slot, mode: next });
    else setPending({ project: props.project, mode: next });
  };
  const choose = (id: string) => {
    const selected = props.project.assets.find((item) => item.id === id);
    const next = selected ? selectVideoProjectBookendMaterial(slot, selected) : null;
    if (next) commit(next);
    else setRefused(true);
  };
  return {
    mode,
    slot,
    asset,
    current,
    refused,
    patch,
    changeMode,
    choose,
    transition,
    changeTransition,
    previewTransition,
  };
}
