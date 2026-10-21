import { useLayoutEffect, useRef, useState } from 'react';
import { Copy, Trash2, AudioLines, LocateFixed } from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types';
import { isProjectSourceVoiceoverEditable } from '../../../../../features/video/project/source-voiceover';
import {
  editSourceVoiceoverTiming,
  getSourceVoiceoverTimingBounds,
} from '../../../../../features/video/project/source-voiceover-timing';
import type { VideoProjectSourceVoiceoverDocument } from '../../../../../features/video/project/source-voiceover';
import { InspectorDetails } from '../shared/details';
import type { QuickEditAudioClip } from '../../../../../features/video/review/advanced/types';
import { translate } from '../../../../../platform/i18n';
import { AudioTakeLevelFields, AudioTakeFadeFields } from '../../../../../ui/audio/take-fields';
import { ToggleField } from '../../../../../ui/compact-inspector-controls';
import { DraftNumericRow } from '../../../../../ui/compact-inspector-controls/numeric-preview';
import { useVideoEditorTimelineEditingPort } from '../../../../runtime/controller/store';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { InspectorActionButton } from '../shared/actions';

export function InspectSourceVoiceoverPanel(props: { project: VideoProject; documentId: string }) {
  const actions = useVideoEditorTimelineEditingPort(
    ({ editSourceVoiceover, deleteSourceVoiceover, duplicateSourceVoiceover }) => ({
      editSourceVoiceover,
      deleteSourceVoiceover,
      duplicateSourceVoiceover,
    })
  );
  const document = props.project.sourceVoiceoverDocuments?.find(
    (item) => item.id === props.documentId
  );
  if (!document) return null;
  const disabled = !isProjectSourceVoiceoverEditable(props.project, document);
  const patch = (take: Partial<Omit<QuickEditAudioClip, 'id' | 'assetId'>>) =>
    actions.editSourceVoiceover(props.project, document.id, {
      take: { ...document.take, ...take },
    });
  return (
    <section data-ui="video-editor.inspector.source-voiceover" className="space-y-3">
      <InspectorGroupedPanel
        groups={[
          {
            id: 'audio',
            semantic: 'audio',
            defaultActive: true,
            label: translate('videoEditor.sidebar.inspectorGroupAudio'),
            content: (
              <>
                <ToggleField
                  label={translate('gallery.videoReview.audioVoiceover')}
                  value={document.enabled}
                  disabled={disabled}
                  onChange={(enabled) =>
                    actions.editSourceVoiceover(props.project, document.id, { enabled })
                  }
                />
                <ToggleField
                  label={translate('gallery.videoReview.audioClipMute')}
                  value={document.take.muted}
                  disabled={disabled}
                  onChange={(muted) => patch({ muted })}
                />
                <AudioTakeLevelFields
                  clip={document.take}
                  disabled={disabled}
                  showTempo
                  onPatch={patch}
                />
              </>
            ),
          },
          {
            id: 'timing',
            semantic: 'timing',
            label: translate('videoEditor.sidebar.inspectorGroupTiming'),
            content: (
              <SourceVoiceoverTimingFields
                key={document.id}
                document={document}
                assetDuration={
                  props.project.assets.find((asset) => asset.id === document.take.assetId)?.metadata
                    .duration ?? null
                }
                disabled={disabled}
                onCommit={(take) =>
                  actions.editSourceVoiceover(props.project, document.id, { take })
                }
              />
            ),
          },
          {
            id: 'animation',
            semantic: 'animation',
            label: translate('videoEditor.sidebar.inspectorGroupAnimation'),
            content: (
              <AudioTakeFadeFields clip={document.take} disabled={disabled} onPatch={patch} />
            ),
          },
          {
            id: 'original-audio',
            semantic: 'source-audio',
            label: translate('gallery.videoReview.audioOriginal'),
            content: (
              <DraftNumericRow
                label={translate('videoEditor.sidebar.originalAudioLevel')}
                unit="%"
                min={0}
                max={100}
                step={1}
                value={(document.originalAudioMuteVolume ?? 1) * 100}
                disabled={disabled}
                onChange={(value) =>
                  actions.editSourceVoiceover(props.project, document.id, {
                    originalAudioMuteVolume: value / 100,
                  })
                }
              />
            ),
          },
          {
            id: 'actions',
            semantic: 'actions',
            label: translate('gallery.videoReview.actionActions'),
            content: (
              <div className="flex flex-wrap gap-2" data-ui="video-editor.inspector.actions">
                <InspectorActionButton
                  disabled={disabled}
                  onClick={() => actions.duplicateSourceVoiceover(document.id)}
                >
                  <Copy size={15} aria-hidden="true" />
                  <span>{translate('videoEditor.timeline.duplicate')}</span>
                </InspectorActionButton>
                <InspectorActionButton
                  tone="danger"
                  disabled={disabled}
                  onClick={() => actions.deleteSourceVoiceover(document.id)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  <span>{translate('videoEditor.timeline.delete')}</span>
                </InspectorActionButton>
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}

/** Source placement and file edges keep their clocks explicit in the compact inspector. */
export function SourceVoiceoverTimingFields(props: {
  document: VideoProjectSourceVoiceoverDocument;
  assetDuration: number | null;
  disabled: boolean;
  onCommit(take: QuickEditAudioClip): boolean;
}) {
  const [refusal, setRefusal] = useState({ revision: 0, field: '' });
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (refusal.field)
      host.current
        ?.querySelector<HTMLInputElement>(`[data-timing-field="${refusal.field}"] input`)
        ?.focus();
  }, [refusal]);
  const take = props.document.take;
  const bounds = getSourceVoiceoverTimingBounds(props.document, props.assetDuration);
  const commit = (kind: 'position' | 'start' | 'end', time: number) => {
    const next = editSourceVoiceoverTiming(props.document, { kind, time }, props.assetDuration);
    if (!next || !props.onCommit(next)) {
      setRefusal((previous) => ({ revision: previous.revision + 1, field: kind }));
    } else if (refusal.field) setRefusal({ revision: refusal.revision, field: '' });
  };
  const row = (
    kind: 'position' | 'start' | 'end',
    label: string,
    value: number,
    min: number,
    max: number
  ) => (
    <div key={`${kind}:${refusal.revision}`} data-timing-field={kind}>
      <DraftNumericRow
        label={label}
        value={value}
        min={min}
        max={max}
        unit="s"
        step={0.01}
        precision={6}
        disabled={props.disabled}
        onChange={(time) => commit(kind, time)}
      />
    </div>
  );
  return (
    <div ref={host} className="space-y-3" data-ui="video-editor.source-voiceover.timing">
      {row(
        'position',
        translate('videoEditor.app.sourcePosition'),
        take.timelineStart,
        0,
        bounds.positionMax
      )}
      {take.dormant && (
        <InspectorActionButton
          disabled={props.disabled}
          onClick={() => commit('position', take.timelineStart)}
        >
          <LocateFixed size={15} aria-hidden="true" />
          <span>{translate('videoEditor.sidebar.sourceVoiceoverPlace')}</span>
        </InspectorActionButton>
      )}
      <InspectorDetails
        label={translate('videoEditor.sidebar.sourceVoiceoverFile')}
        preferenceId="source-voiceover.audio-file"
        icon={AudioLines}
        initiallyOpen
      >
        {row(
          'start',
          translate('gallery.videoReview.rangeStart'),
          take.sourceOffset,
          bounds.startMin,
          bounds.startMax
        )}
        {row(
          'end',
          translate('gallery.videoReview.rangeEnd'),
          take.sourceOffset + take.duration,
          bounds.endMin,
          bounds.endMax
        )}
      </InspectorDetails>
      {refusal.field && (
        <p role="alert" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('common.errors.actionFailed')}
        </p>
      )}
    </div>
  );
}
