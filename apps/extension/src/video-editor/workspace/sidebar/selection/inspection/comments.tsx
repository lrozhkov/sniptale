import { useState } from 'react';
import { Plus, StickyNote, Trash2 } from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import type { VideoProjectCommentDocument } from '../../../../../features/video/project/comments/types';
import { isCommentSourceClip } from '../../../../../features/video/project/comments/projection';
import { isVideoProjectCommentEditable } from '../../../../../features/video/project/comments/authoring';
import { translate } from '../../../../../platform/i18n';
import { SelectField } from '../../../../../ui/compact-inspector-controls';
import { InspectorActionButton } from '../shared/actions';
import { useProjectCommentEditing } from './comment-editing';

/** Notes retain their clock document; choosing another destination never retimes them. */
export function InspectProjectCommentsPanel({ project }: { project: VideoProject }) {
  const editor = useProjectCommentEditing(project);
  const documents = project.commentDocuments ?? [];
  return (
    <div data-ui="video-editor.comments.panel" className="min-w-0 space-y-3">
      <CommentCreationControls project={project} editor={editor} />
      {documents.map((document, index) => (
        <CommentDocumentSection
          key={document.id}
          document={document}
          label={commentDocumentLabel(project, document, index)}
          editable={isVideoProjectCommentEditable(project, document)}
          editor={editor}
        />
      ))}
      {!documents.some((document) => document.annotations.length) && (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.commentEmpty')}
        </p>
      )}
      {editor.refused && (
        <p role="alert" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.commentRefused')}
        </p>
      )}
    </div>
  );
}

type CommentEditor = ReturnType<typeof useProjectCommentEditing>;

function CommentCreationControls({
  project,
  editor,
}: {
  project: VideoProject;
  editor: CommentEditor;
}) {
  const [choice, setChoice] = useState('project');
  const documents = project.commentDocuments ?? [];
  const options = commentDestinationOptions(project);
  const destination = options.some((option) => option.value === choice)
    ? choice
    : options[0]!.value;
  const selected = documents.find((document) => `document:${document.id}` === destination);
  const add = () => {
    const { document, clipId, time } = resolveCommentDestination(project, destination, editor.time);
    const id = crypto.randomUUID();
    const note = { id, text: '', anchor: { kind: 'point' as const, time } };
    let documentId: string | null = document?.id ?? null;
    if (document) {
      if (!editor.edit(document, { kind: 'add-note', note })) return;
    } else {
      documentId = editor.add({
        id: crypto.randomUUID(),
        target: clipId ? { kind: 'source', clipId } : { kind: 'project' },
        note,
      });
    }
    if (documentId) editor.selection.select(documentId, id);
  };
  return (
    <>
      {options.length > 1 && (
        <SelectField
          label={translate('videoEditor.sidebar.commentDestination')}
          value={destination}
          options={options}
          onChange={setChoice}
        />
      )}
      <div className="flex flex-wrap gap-1">
        <InspectorActionButton
          onClick={add}
          disabled={!!selected && !isVideoProjectCommentEditable(project, selected)}
        >
          <Plus size={14} aria-hidden="true" />
          {translate('videoEditor.sidebar.commentAddNote')}
        </InspectorActionButton>
      </div>
    </>
  );
}

function CommentDocumentSection({
  document,
  label,
  editable,
  editor,
}: {
  document: VideoProjectCommentDocument;
  label: string;
  editable: boolean;
  editor: CommentEditor;
}) {
  return (
    <section className="min-w-0 space-y-1" aria-label={label}>
      <div className="flex min-w-0 items-center gap-1">
        <h4
          className="min-w-0 flex-1 truncate text-xs text-[var(--sniptale-color-text-muted)]"
          title={label}
        >
          {label}
        </h4>
        <InspectorActionButton
          iconOnly
          title={translate('videoEditor.sidebar.commentDeleteDocument')}
          aria-label={translate('videoEditor.sidebar.commentDeleteDocument')}
          disabled={!editable}
          onClick={() => editor.edit(document, { kind: 'remove-document' })}
        >
          <Trash2 size={14} aria-hidden="true" />
        </InspectorActionButton>
      </div>
      {document.annotations.map((note) => (
        <InspectorActionButton
          key={note.id}
          className="w-full justify-start"
          onClick={() => editor.selection.select(document.id, note.id)}
        >
          <StickyNote size={14} className="shrink-0" aria-hidden="true" />
          <span className="truncate">
            {note.text.trim() || translate('videoEditor.sidebar.commentNote')}
          </span>
        </InspectorActionButton>
      ))}
    </section>
  );
}

function commentDocumentLabel(
  project: VideoProject,
  document: VideoProjectCommentDocument,
  index: number
) {
  const binding = document.binding;
  if (binding.kind === 'project')
    return `${translate('videoEditor.sidebar.commentProject')} · ${index + 1}`;
  const clip = project.clips.find((clip) => isCommentSourceClip(clip, binding));
  const asset = project.assets.find((asset) => asset.id === binding.assetId);
  const track = project.tracks.find((track) => track.id === clip?.trackId);
  return [clip?.name ?? asset?.name, track?.name, index + 1].filter(Boolean).join(' · ');
}

function commentDestinationOptions(project: VideoProject) {
  const documents = project.commentDocuments ?? [];
  return [
    ...documents.map((document, index) => ({
      value: `document:${document.id}`,
      label: commentDocumentLabel(project, document, index),
    })),
    ...(!documents.some((document) => document.binding.kind === 'project')
      ? [{ value: 'project', label: translate('videoEditor.sidebar.commentProject') }]
      : []),
    ...project.clips
      .filter((clip) => clip.type === 'VIDEO')
      .filter((clip) => !documents.some((document) => isCommentSourceClip(clip, document.binding)))
      .map((clip, index) => ({
        value: `clip:${clip.id}`,
        label: [
          clip.name ??
            project.assets.find((asset) => asset.id === clip.assetId)?.name ??
            translate('videoEditor.sidebar.commentProject'),
          project.tracks.find((track) => track.id === clip.trackId)?.name ?? '',
          index + 1,
        ].join(' · '),
      })),
  ];
}

/** Resolve the note clock before either existing-document edit or atomic creation. */
function resolveCommentDestination(project: VideoProject, destination: string, time: number) {
  const documents = project.commentDocuments ?? [];
  const selected = documents.find((document) => `document:${document.id}` === destination);
  const clipId = destination.startsWith('clip:') ? destination.slice(5) : null;
  const document =
    selected ??
    documents.find((document) =>
      clipId
        ? project.clips.some(
            (clip) => clip.id === clipId && isCommentSourceClip(clip, document.binding)
          )
        : document.binding.kind === 'project'
    );
  const clip =
    document?.binding.kind === 'source'
      ? (project.clips.find(
          (clip) =>
            isCommentSourceClip(clip, document.binding) &&
            time >= clip.startTime &&
            time < clip.startTime + clip.duration
        ) ?? project.clips.find((clip) => isCommentSourceClip(clip, document.binding)))
      : project.clips.find((clip) => clip.id === clipId);
  const anchorTime =
    clip?.type === 'VIDEO'
      ? clip.sourceStart +
        Math.max(0, Math.min(clip.duration, time - clip.startTime)) * (clip.playbackRate ?? 1)
      : document?.binding.kind === 'source'
        ? 0
        : Math.max(0, Math.min(project.duration, time));
  return { document, clipId, time: anchorTime };
}
