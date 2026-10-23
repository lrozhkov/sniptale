import { useEffect, useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import type { ReviewAnnotation } from '../../../../../features/video/review/types';
import { isVideoProjectCommentEditable } from '../../../../../features/video/project/comments/authoring';
import type { VideoProjectCommentDocument } from '../../../../../features/video/project/comments/types';
import type { VideoEditorSelection } from '../../../../contracts/selection';
import { translate } from '../../../../../platform/i18n';
import { SegmentedRow, TextareaField } from '../../../../../ui/compact-inspector-controls';
import { PreviewNumericRow } from '../../../../../ui/compact-inspector-controls/numeric-preview';
import { useInspectorSectionMemory } from '../grouped-inspector/presentation';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { InspectorActionButton } from '../shared/actions';
import { useProjectCommentEditing } from './comment-editing';

type CommentSelection = Extract<VideoEditorSelection, { kind: 'comment' }>;
type CommentEditor = ReturnType<typeof useProjectCommentEditing>;

/** Notes remain editorial metadata, separate from rendered annotations and effects. */
export function InspectCommentPanel({
  project,
  selection,
}: {
  project: VideoProject;
  selection: CommentSelection;
}) {
  const editor = useProjectCommentEditing(project);
  const sceneMemory = useInspectorSectionMemory('scene');
  const document = project.commentDocuments?.find(
    (document) => document.id === selection.documentId
  );
  const note = document?.annotations.find((note) => note.id === selection.commentId);
  if (!document || !note) return null;
  const disabled = !isVideoProjectCommentEditable(project, document);
  const binding = document.binding;
  const duration =
    binding.kind === 'project'
      ? project.duration
      : (project.assets.find((asset) => asset.id === binding.assetId)?.metadata.duration ?? 86400);
  return (
    <section data-ui="video-editor.comment.inspector" className="min-w-0 space-y-3">
      <InspectorActionButton
        onClick={() => {
          editor.endTyping();
          sceneMemory.requestReturn('comments');
          editor.selection.back();
        }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {translate('videoEditor.sidebar.commentBack')}
      </InspectorActionButton>
      <InspectorGroupedPanel
        groups={[
          {
            id: 'content',
            semantic: 'content',
            defaultActive: true,
            label: translate('videoEditor.sidebar.inspectorGroupContent'),
            content: (
              <CommentTextField
                label={translate('gallery.videoReview.commentText')}
                value={note.text}
                disabled={disabled}
                readOnly={false}
                rows={5}
                onChange={(text) =>
                  editor.edit(document, { kind: 'note', id: note.id, patch: { text } }, true)
                }
                onBlur={editor.endTyping}
              />
            ),
          },
          {
            id: 'timing',
            semantic: 'timing',
            label: translate(
              binding.kind === 'source'
                ? 'videoEditor.sidebar.commentSourceTime'
                : 'videoEditor.sidebar.inspectorGroupTiming'
            ),
            content: <NoteTiming {...{ note, document, editor, disabled, duration }} />,
          },
          {
            id: 'actions',
            semantic: 'advanced',
            label: translate('videoEditor.sidebar.actionsTitle'),
            content: (
              <InspectorActionButton
                disabled={disabled}
                onClick={() => editor.edit(document, { kind: 'remove-note', id: note.id })}
              >
                <Trash2 size={14} aria-hidden="true" />
                {translate('gallery.videoReview.deleteComment')}
              </InspectorActionButton>
            ),
          },
        ]}
      />
      {editor.refused && (
        <p role="alert" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.commentRefused')}
        </p>
      )}
    </section>
  );
}

function NoteTiming({
  note,
  document,
  editor,
  disabled,
  duration,
}: {
  note: ReviewAnnotation;
  document: VideoProjectCommentDocument;
  editor: CommentEditor;
  disabled: boolean;
  duration: number;
}) {
  const anchor = note.anchor;
  const start = anchor.kind === 'point' ? anchor.time : anchor.start;
  const patch = (anchor: ReviewAnnotation['anchor']) =>
    editor.edit(document, { kind: 'note', id: note.id, patch: { anchor } });
  return (
    <div className="sniptale-parameter-stack">
      <SegmentedRow
        label={translate('videoEditor.sidebar.commentTimeKind')}
        ariaLabel={translate('videoEditor.sidebar.commentTimeKind')}
        columns={2}
        value={anchor.kind}
        options={[
          { value: 'point', label: translate('videoEditor.sidebar.commentPoint'), disabled },
          {
            value: 'range',
            label: translate('videoEditor.sidebar.commentRange'),
            disabled: disabled || start >= duration,
          },
        ]}
        onChange={(kind) => {
          if (kind === anchor.kind) return;
          patch(
            kind === 'point'
              ? { kind, time: start }
              : { kind, start, end: Math.min(duration, start + 1) }
          );
        }}
      />
      <PreviewNumericRow
        label={translate('gallery.videoReview.textFragmentStart')}
        unit="s"
        min={0}
        max={anchor.kind === 'range' ? anchor.end - 0.001 : duration}
        step={0.1}
        precision={3}
        value={start}
        disabled={disabled}
        onChange={(start) =>
          patch(anchor.kind === 'point' ? { kind: 'point', time: start } : { ...anchor, start })
        }
      />
      {anchor.kind === 'range' && (
        <PreviewNumericRow
          label={translate('gallery.videoReview.textFragmentEnd')}
          unit="s"
          min={anchor.start + 0.001}
          max={duration}
          step={0.1}
          precision={3}
          value={anchor.end}
          disabled={disabled}
          onChange={(end) => patch({ ...anchor, end })}
        />
      )}
    </div>
  );
}

/** A refused command keeps its local text available for repair without another writer. */
function CommentTextField(props: {
  label: string;
  value: string;
  disabled: boolean;
  readOnly: boolean;
  rows: number;
  onChange(value: string): boolean;
  onBlur(): void;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  return (
    <TextareaField
      {...props}
      value={draft}
      onChange={(value) => {
        setDraft(value);
        props.onChange(value);
      }}
    />
  );
}
