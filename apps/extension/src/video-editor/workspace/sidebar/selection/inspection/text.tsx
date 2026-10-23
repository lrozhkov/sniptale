import { ProjectTextVoicePanel } from './text-voice';
import type { VideoProjectTextVoiceController } from '../../../../runtime/session/text-voice';
import { useEffect, useRef, useState } from 'react';
import { Plus, WandSparkles } from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import type { VideoProjectTextDocument } from '../../../../../features/video/project/text/types';
import { addVideoProjectManualText } from '../../../../../features/video/project/text/authoring';
import { translate } from '../../../../../platform/i18n';
import { SelectField } from '../../../../../ui/compact-inspector-controls';
import { InspectorActionButton } from '../shared/actions';
import { useProjectTextEditing } from './text-editing';
import { DocumentCaptions, TextEditFeedback } from './text-captions';
import { ProjectTextPhrase } from './text-phrase';
import { ProjectTextRewritePanel } from './text-rewrite';
import type { VideoProjectTextRewriteController } from '../../../../runtime/session/text-rewrite';

/** Text remains a scene document; timeline clip selection keeps its own montage semantics. */
export function InspectProjectTextPanel({
  project,
  rewrite,
  voice,
}: {
  project: VideoProject;
  rewrite?: VideoProjectTextRewriteController | undefined;
  voice?: VideoProjectTextVoiceController | undefined;
}) {
  const editor = useProjectTextEditing(project);
  const [choice, setChoice] = useState(voice?.target?.documentId ?? '');
  const [opened, setOpened] = useState('');
  const [created, setCreated] = useState('');
  const [limit, setLimit] = useState(50);
  // A category remount restores the invoking scope from its still-mounted operation.
  const [batch, setBatch] = useState(!!voice?.target && voice.batch);
  const [selected, setSelected] = useState<string[]>(
    () => voice?.items.map((item) => item.fragmentId) ?? []
  );
  const focus = useTextRewriteFocus(voice?.target ?? rewrite?.target);
  const documents = project.textDocuments ?? [];
  const entry = documents.find((item) => item.id === choice) ?? documents[0];
  const selectedIds =
    entry?.document.fragments
      .filter((fragment) => selected.includes(fragment.id))
      .map((fragment) => fragment.id) ?? [];
  const openRewrite = (ids: string[], wholeDocument: boolean, source: string) => {
    if (!entry || !rewrite || rewrite.running) return;
    editor.endTyping();
    focus.rememberTrigger(source);
    rewrite.open(entry.id, ids, wholeDocument);
  };
  const targetEntry = documents.find((document) => document.id === rewrite?.target?.documentId);
  const add = () => {
    const added = createManualProjectText(editor, entry);
    if (added) {
      setChoice(added.documentId);
      setOpened(added.fragmentId);
      setCreated(added.fragmentId);
      setLimit(2_000);
    }
  };
  const openVoice = (ids: string | string[]) => {
    if (!entry || !voice) return;
    editor.endTyping();
    focus.rememberTrigger(typeof ids === 'string' ? `voice:${ids}` : 'voice:selected');
    voice.open(entry.id, ids);
  };
  return (
    <div ref={focus.surface} data-ui="video-editor.text.panel" className="min-w-0 space-y-3 pe-2">
      {voice?.target ? (
        <ProjectTextVoicePanel
          project={project}
          operation={voice}
          onClose={() => {
            if (voice.target)
              focus.rememberTrigger(
                voice.batch ? 'voice:selected' : `voice:${voice.target.fragmentId}`
              );
            focus.requestRestore();
            void voice.close();
          }}
        />
      ) : rewrite?.target ? (
        <ProjectTextRewritePanel
          project={project}
          operation={rewrite}
          scopeLabel={
            targetEntry
              ? documentLabel(project, targetEntry, documents.indexOf(targetEntry))
              : translate('videoEditor.sidebar.textDocumentChoice')
          }
          onClose={() => {
            focus.requestRestore();
            rewrite.close();
          }}
        />
      ) : (
        <>
          <InspectorActionButton onClick={add}>
            <Plus size={14} /> {translate('videoEditor.sidebar.newProjectText')}
          </InspectorActionButton>
          {entry ? (
            <>
              <ProjectTextDocumentChoice
                project={project}
                entry={entry}
                onChange={(id) => {
                  editor.endTyping();
                  setChoice(id);
                  setOpened('');
                  setCreated('');
                  setLimit(50);
                  setSelected([]);
                }}
              />
              <DocumentCaptions entry={entry} editor={editor} />
              {rewrite || voice ? (
                <TextRewriteCommands
                  ids={entry.document.fragments.map((fragment) => fragment.id)}
                  selectedIds={selectedIds}
                  batch={batch}
                  onBatchChange={() => setBatch(!batch)}
                  onSelectedChange={setSelected}
                  onRewrite={rewrite ? openRewrite : undefined}
                  onVoice={voice ? () => openVoice(selectedIds) : undefined}
                />
              ) : null}
              {!entry.document.fragments.length && (
                <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
                  {translate('gallery.videoReview.textFragmentEmpty')}
                </p>
              )}
              <ProjectTextPhrases
                {...{ project, entry, editor, limit, opened, created, batch, selected }}
                voice={!!voice}
                rewrite={!!rewrite}
                onRewrite={openRewrite}
                onToggle={(id) => {
                  editor.endTyping();
                  setCreated('');
                  setOpened(opened === id ? '' : id);
                }}
                onVoice={openVoice}
                onSelect={(id) =>
                  setSelected((current) =>
                    current.includes(id)
                      ? current.filter((entry) => entry !== id)
                      : [...current, id]
                  )
                }
              />
              {entry.document.fragments.length > limit && (
                <InspectorActionButton onClick={() => setLimit(limit + 50)}>
                  {translate('gallery.videoReview.textFragmentMore')}
                </InspectorActionButton>
              )}
            </>
          ) : (
            <p className="text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.videoReview.textFragmentEmpty')}
            </p>
          )}
          {!opened && <TextEditFeedback error={editor.error} />}
        </>
      )}
    </div>
  );
}

/** Commit one manual phrase before publishing its editor selection. */
function createManualProjectText(
  editor: ReturnType<typeof useProjectTextEditing>,
  entry: VideoProjectTextDocument | undefined
) {
  const fragmentId = crypto.randomUUID();
  const documentId = entry?.binding.kind === 'project' ? entry.id : crypto.randomUUID();
  const accepted = editor.accept((current) =>
    addVideoProjectManualText(current, {
      documentId,
      fragmentId,
      start: editor.playback.time,
      ...(entry?.binding.kind === 'project' ? { target: entry } : {}),
    })
  );
  return accepted ? { documentId, fragmentId } : null;
}

function ProjectTextDocumentChoice(props: {
  project: VideoProject;
  entry: VideoProjectTextDocument;
  onChange(id: string): void;
}) {
  const documents = props.project.textDocuments ?? [];
  return (
    <>
      <SelectField
        label={translate('videoEditor.sidebar.textDocumentChoice')}
        value={props.entry.id}
        options={documents.map((document, index) => ({
          value: document.id,
          label: documentLabel(props.project, document, index),
        }))}
        onChange={props.onChange}
      />
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate(
          props.entry.binding.kind === 'project'
            ? 'videoEditor.sidebar.textClockProject'
            : 'videoEditor.sidebar.textClockSource'
        )}
      </p>
    </>
  );
}

function TextRewriteCommands(props: {
  ids: string[];
  selectedIds: string[];
  batch: boolean;
  onBatchChange(): void;
  onSelectedChange(ids: string[]): void;
  onRewrite?: ((ids: string[], wholeDocument: boolean, source: string) => void) | undefined;
  onVoice?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {props.onRewrite ? (
        <InspectorActionButton
          data-project-text-rewrite="all"
          disabled={!props.ids.length}
          onClick={() => props.onRewrite?.(props.ids, true, 'all')}
        >
          <WandSparkles size={14} aria-hidden="true" />
          {translate('gallery.videoReview.textRewriteAll')}
        </InspectorActionButton>
      ) : null}
      <InspectorActionButton
        tone="toggle"
        active={props.batch}
        aria-pressed={props.batch}
        onClick={props.onBatchChange}
      >
        {translate('gallery.videoReview.speechBatch')}
      </InspectorActionButton>
      {props.batch ? (
        <>
          <span role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.speechBatchSelected').replace(
              '{count}',
              String(props.selectedIds.length)
            )}
          </span>
          <InspectorActionButton onClick={() => props.onSelectedChange(props.ids)}>
            {translate('gallery.videoReview.textFragmentSelectFound')}
          </InspectorActionButton>
          <InspectorActionButton onClick={() => props.onSelectedChange([])}>
            {translate('gallery.videoReview.speechDeselectAll')}
          </InspectorActionButton>
          {props.onRewrite ? (
            <InspectorActionButton
              data-project-text-rewrite="selected"
              disabled={!props.selectedIds.length}
              onClick={() => props.onRewrite?.(props.selectedIds, false, 'selected')}
            >
              {translate('gallery.videoReview.textRewriteSelected')}
            </InspectorActionButton>
          ) : null}
          {props.onVoice ? (
            <InspectorActionButton
              data-project-text-voice="selected"
              disabled={!props.selectedIds.length}
              onClick={props.onVoice}
            >
              {translate('gallery.videoReview.speechGenerateSelected')}
            </InspectorActionButton>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function documentLabel(project: VideoProject, entry: VideoProjectTextDocument, index: number) {
  const label =
    entry.binding.kind === 'project'
      ? translate('videoEditor.sidebar.textProjectDocument')
      : (project.assets.find(
          (asset) => entry.binding.kind === 'source' && asset.id === entry.binding.assetId
        )?.name ?? translate('gallery.videoReview.textFragmentOriginal'));
  return `${label} · ${index + 1}`;
}

/** Restores the invoking phrase command when the rewrite inspector closes. */
function useTextRewriteFocus(target: object | null | undefined) {
  const surface = useRef<HTMLDivElement>(null);
  const trigger = useRef('all');
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (target || !restoreFocus.current) return;
    restoreFocus.current = false;
    const buttons = [
      ...(surface.current?.querySelectorAll<HTMLElement>(
        '[data-project-text-rewrite], [data-project-text-voice]'
      ) ?? []),
    ];
    (
      buttons.find(
        (button) =>
          (button.dataset['projectTextVoice']
            ? `voice:${button.dataset['projectTextVoice']}`
            : button.dataset['projectTextRewrite']) === trigger.current
      ) ?? buttons[0]
    )?.focus();
  }, [target]);
  return {
    surface,
    rememberTrigger(source: string) {
      trigger.current = source;
    },
    requestRestore() {
      restoreFocus.current = true;
    },
  };
}

/** Phrase rendering retains editing and selection authority in the text panel. */
function ProjectTextPhrases(props: {
  project: VideoProject;
  entry: VideoProjectTextDocument;
  editor: ReturnType<typeof useProjectTextEditing>;
  limit: number;
  opened: string;
  created: string;
  batch: boolean;
  selected: string[];
  voice: boolean;
  rewrite: boolean;
  onToggle(id: string): void;
  onVoice(id: string): void;
  onSelect(id: string): void;
  onRewrite(ids: string[], wholeDocument: boolean, source: string): void;
}) {
  return (
    <>
      {props.entry.document.fragments.slice(0, props.limit).map((fragment, index) => (
        <ProjectTextPhrase
          key={JSON.stringify([props.entry.id, fragment.id])}
          project={props.project}
          entry={props.entry}
          fragment={fragment}
          editor={props.editor}
          next={props.entry.document.fragments[index + 1]}
          expanded={props.opened === fragment.id}
          focus={props.created === fragment.id}
          onToggle={() => props.onToggle(fragment.id)}
          {...(props.voice ? { onVoice: () => props.onVoice(fragment.id) } : {})}
          batch={props.batch}
          selected={props.selected.includes(fragment.id)}
          onSelect={() => props.onSelect(fragment.id)}
          {...(props.rewrite
            ? { onRewrite: () => props.onRewrite([fragment.id], false, fragment.id) }
            : {})}
        />
      ))}
    </>
  );
}
