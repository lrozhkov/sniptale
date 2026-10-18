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
}: {
  project: VideoProject;
  rewrite?: VideoProjectTextRewriteController | undefined;
}) {
  const editor = useProjectTextEditing(project);
  const [choice, setChoice] = useState('');
  const [opened, setOpened] = useState('');
  const [created, setCreated] = useState('');
  const [limit, setLimit] = useState(50);
  const [batch, setBatch] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const surface = useRef<HTMLDivElement>(null);
  const trigger = useRef('all');
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (rewrite?.target || !restoreFocus.current) return;
    restoreFocus.current = false;
    const buttons = [
      ...(surface.current?.querySelectorAll<HTMLElement>('[data-project-text-rewrite]') ?? []),
    ];
    (
      buttons.find((button) => button.dataset['projectTextRewrite'] === trigger.current) ??
      buttons[0]
    )?.focus();
  }, [rewrite?.target]);
  const documents = project.textDocuments ?? [];
  const entry = documents.find((item) => item.id === choice) ?? documents[0];
  const selectedIds =
    entry?.document.fragments
      .filter((fragment) => selected.includes(fragment.id))
      .map((fragment) => fragment.id) ?? [];
  const openRewrite = (ids: string[], wholeDocument: boolean, source: string) => {
    if (!entry || !rewrite || rewrite.running) return;
    editor.endTyping();
    trigger.current = source;
    rewrite.open(entry.id, ids, wholeDocument);
  };
  const targetEntry = documents.find((document) => document.id === rewrite?.target?.documentId);
  const add = () => {
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
    if (accepted) {
      setChoice(documentId);
      setOpened(fragmentId);
      setCreated(fragmentId);
      setLimit(2_000);
    }
  };
  return (
    <div ref={surface} data-ui="video-editor.text.panel" className="min-w-0 space-y-3 pe-2">
      {rewrite?.target ? (
        <ProjectTextRewritePanel
          project={project}
          operation={rewrite}
          scopeLabel={
            targetEntry
              ? documentLabel(project, targetEntry, documents.indexOf(targetEntry))
              : translate('videoEditor.sidebar.textDocumentChoice')
          }
          onClose={() => {
            restoreFocus.current = true;
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
              {rewrite ? (
                <TextRewriteCommands
                  ids={entry.document.fragments.map((fragment) => fragment.id)}
                  selectedIds={selectedIds}
                  batch={batch}
                  onBatchChange={() => setBatch(!batch)}
                  onSelectedChange={setSelected}
                  onRewrite={openRewrite}
                />
              ) : null}
              {entry.document.fragments.slice(0, limit).map((fragment, index) => (
                <ProjectTextPhrase
                  key={JSON.stringify([entry.id, fragment.id])}
                  {...{ project, entry, fragment, editor }}
                  next={entry.document.fragments[index + 1]}
                  expanded={opened === fragment.id}
                  focus={created === fragment.id}
                  onToggle={() => {
                    editor.endTyping();
                    setCreated('');
                    setOpened(opened === fragment.id ? '' : fragment.id);
                  }}
                  {...(rewrite
                    ? {
                        onRewrite: () => openRewrite([fragment.id], false, fragment.id),
                        batch,
                        selected: selected.includes(fragment.id),
                        onSelect: () =>
                          setSelected((current) =>
                            current.includes(fragment.id)
                              ? current.filter((id) => id !== fragment.id)
                              : [...current, fragment.id]
                          ),
                      }
                    : {})}
                />
              ))}
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
  onRewrite(ids: string[], wholeDocument: boolean, source: string): void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <InspectorActionButton
        data-project-text-rewrite="all"
        disabled={!props.ids.length}
        onClick={() => props.onRewrite(props.ids, true, 'all')}
      >
        <WandSparkles size={14} aria-hidden="true" />
        {translate('gallery.videoReview.textRewriteAll')}
      </InspectorActionButton>
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
          <InspectorActionButton onClick={() => props.onSelectedChange(props.ids)}>
            {translate('gallery.videoReview.textFragmentSelectFound')}
          </InspectorActionButton>
          <InspectorActionButton onClick={() => props.onSelectedChange([])}>
            {translate('gallery.videoReview.speechDeselectAll')}
          </InspectorActionButton>
          <InspectorActionButton
            data-project-text-rewrite="selected"
            disabled={!props.selectedIds.length}
            onClick={() => props.onRewrite(props.selectedIds, false, 'selected')}
          >
            {translate('gallery.videoReview.textRewriteSelected')}
          </InspectorActionButton>
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
