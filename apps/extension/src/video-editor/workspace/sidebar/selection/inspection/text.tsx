import { TextDocument } from '../../../../../ui/text-document';
import { projectVideoProjectTextFragment } from '../../../../../features/video/project/text/projection';
import { ProjectTextVoicePanel } from './text-voice';
import type { VideoProjectTextVoiceController } from '../../../../runtime/session/text-voice';
import { useContext, useEffect, useRef, useState } from 'react';
import { RuntimePlaybackContext } from '../../../../runtime/controller/composition/contexts';
import { useVideoEditorPlaybackPort } from '../../../../runtime/controller/store';
import { Plus, WandSparkles, Play, Pencil, Volume2 } from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import type { VideoProjectTextDocument } from '../../../../../features/video/project/text/types';
import { addVideoProjectManualText } from '../../../../../features/video/project/text/authoring';
import { translate } from '../../../../../platform/i18n';
import { SelectField, SegmentedRow } from '../../../../../ui/compact-inspector-controls';
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
  const runtime = useContext(RuntimePlaybackContext);
  const playing = useVideoEditorPlaybackPort((port) => port.isPlaying);
  const pendingPlay = useRef<{ frame: number | null } | null>(null);
  const cancelPendingPlay = () => {
    const pending = pendingPlay.current;
    pendingPlay.current = null;
    if (!pending) return;
    if (pending.frame !== null) cancelAnimationFrame(pending.frame);
  };
  const [view, setView] = useState<'document' | 'cards'>('document');
  const [choice, setChoice] = useState(voice?.target?.documentId ?? '');
  const [opened, setOpened] = useState('');
  const [created, setCreated] = useState('');
  const [focusRevision, setFocusRevision] = useState(0);
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
  const actionIds = selected.length
    ? selectedIds
    : entry?.document.fragments.some((fragment) => fragment.id === opened)
      ? [opened]
      : [];
  const active = entry?.document.fragments.find((fragment) => fragment.id === actionIds[0]);
  const targetKey = JSON.stringify(actionIds);
  const currentPlayback = useRef({
    runtime,
    project,
    targetKey,
    time: editor.playback.time,
    playing,
  });
  currentPlayback.current = { runtime, project, targetKey, time: editor.playback.time, playing };
  useEffect(() => () => cancelPendingPlay(), [project, entry?.id, view, targetKey]);
  const navigate = (id: string, play = false) => {
    const fragment = entry?.document.fragments.find((item) => item.id === id);
    if (!entry || !fragment) return;
    const ranges = projectVideoProjectTextFragment(project, entry, fragment).ranges;
    if (!ranges.length) return;
    cancelPendingPlay();
    editor.endTyping();
    const time = ranges[0]!.start;
    if (!runtime) {
      editor.playback.setPlaying(false);
      editor.playback.seek(time);
      return;
    }
    runtime.pausePlayback();
    runtime.seekTo(time);
    if (!play) return;
    const request = { frame: null as number | null };
    pendingPlay.current = request;
    // Commit the seek before the existing prepared transport reads its latest time.
    request.frame = requestAnimationFrame(() => {
      request.frame = null;
      const current = currentPlayback.current;
      if (pendingPlay.current !== request) return;
      if (
        current.project !== project ||
        current.targetKey !== targetKey ||
        current.runtime?.setPlaybackPlaying !== runtime.setPlaybackPlaying ||
        current.time !== time ||
        current.playing ||
        current.runtime.isPreparingPlayback
      ) {
        pendingPlay.current = null;
        return;
      }
      // After handoff the shared transport owns preparation and subsequent playback intents.
      pendingPlay.current = null;
      void runtime.setPlaybackPlaying(true);
    });
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
          <div
            data-ui="text-document.commands"
            className="sticky top-0 z-10 space-y-1 bg-[rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)] py-1"
          >
            <SegmentedRow
              label={translate('gallery.videoReview.textView')}
              ariaLabel={translate('gallery.videoReview.textView')}
              value={view}
              options={[
                { value: 'document', label: translate('gallery.videoReview.textViewDocument') },
                { value: 'cards', label: translate('gallery.videoReview.textViewCards') },
              ]}
              onChange={(value: 'document' | 'cards') => {
                editor.endTyping();
                setView(value);
              }}
            />
            {view === 'document' && entry && active && (
              <div
                data-ui="text-document.actions"
                data-selected-count={actionIds.length}
                className="flex flex-wrap items-center gap-1"
              >
                {actionIds.length > 1 && (
                  <span
                    role="status"
                    className="text-xs text-[var(--sniptale-color-text-secondary)]"
                  >
                    {translate('gallery.videoReview.speechBatchSelected').replace(
                      '{count}',
                      String(actionIds.length)
                    )}
                  </span>
                )}
                <InspectorActionButton
                  iconOnly
                  title={translate('gallery.videoReview.textPhraseEdit')}
                  aria-label={translate('gallery.videoReview.textPhraseEdit')}
                  disabled={actionIds.length !== 1}
                  onClick={() => {
                    editor.endTyping();
                    setCreated(active.id);
                    setOpened(active.id);
                    setFocusRevision((current) => current + 1);
                  }}
                >
                  <Pencil size={14} />
                </InspectorActionButton>
                <InspectorActionButton
                  iconOnly
                  title={translate('gallery.videoReview.textPlayFromHere')}
                  aria-label={translate('gallery.videoReview.textPlayFromHere')}
                  disabled={
                    !runtime ||
                    !projectVideoProjectTextFragment(project, entry, active).ranges.length
                  }
                  onClick={() => navigate(active.id, true)}
                >
                  <Play size={14} />
                </InspectorActionButton>
                {voice && (
                  <InspectorActionButton
                    iconOnly
                    data-project-text-voice={actionIds.length === 1 ? active.id : 'selected'}
                    disabled={actionIds.length === 1 && !active.text.trim()}
                    title={translate('gallery.videoReview.speechGenerateSelected')}
                    aria-label={translate('gallery.videoReview.speechGenerateSelected')}
                    onClick={() => openVoice(actionIds.length === 1 ? active.id : actionIds)}
                  >
                    <Volume2 size={14} />
                  </InspectorActionButton>
                )}
                {rewrite && (
                  <InspectorActionButton
                    iconOnly
                    data-project-text-rewrite={actionIds.length === 1 ? active.id : 'document'}
                    title={translate('gallery.videoReview.textRewriteSelected')}
                    aria-label={translate('gallery.videoReview.textRewriteSelected')}
                    onClick={() =>
                      openRewrite(actionIds, false, actionIds.length === 1 ? active.id : 'document')
                    }
                  >
                    <WandSparkles size={14} />
                  </InspectorActionButton>
                )}
              </div>
            )}
          </div>
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
              {view === 'cards' && (rewrite || voice) ? (
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
              {view === 'document' && (
                <>
                  <TextDocument
                    label={translate('gallery.videoReview.textViewDocument')}
                    phrases={entry.document.fragments.map((fragment) => ({
                      id: fragment.id,
                      text: fragment.text || translate('gallery.videoReview.speechText'),
                      unavailable: !projectVideoProjectTextFragment(project, entry, fragment).ranges
                        .length,
                    }))}
                    selectedIds={selectedIds}
                    onSelection={setSelected}
                    onActivate={(id) => navigate(id)}
                  />
                </>
              )}
              <ProjectTextPhrases
                {...{
                  project,
                  entry,
                  editor,
                  limit,
                  opened,
                  created,
                  batch,
                  selected,
                  view,
                  focusRevision,
                }}
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
              {view === 'cards' && entry.document.fragments.length > limit && (
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
  view: 'document' | 'cards';
  focusRevision: number;
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
      {props.entry.document.fragments.map((fragment, index) => (
        <ProjectTextPhrase
          key={JSON.stringify([props.entry.id, fragment.id])}
          documentView={props.view === 'document'}
          visible={props.view === 'cards' && index < props.limit}
          project={props.project}
          entry={props.entry}
          fragment={fragment}
          editor={props.editor}
          next={props.entry.document.fragments[index + 1]}
          expanded={props.opened === fragment.id}
          focus={props.created === fragment.id}
          focusRevision={props.focusRevision}
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
