import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import type { VideoProjectTextDocument } from '../../../../../features/video/project/text/types';
import { addVideoProjectManualText } from '../../../../../features/video/project/text/authoring';
import { translate } from '../../../../../platform/i18n';
import { SelectField } from '../../../../../ui/compact-inspector-controls';
import { InspectorActionButton } from '../shared/actions';
import { useProjectTextEditing } from './text-editing';
import { DocumentCaptions, TextEditFeedback } from './text-captions';
import { ProjectTextPhrase } from './text-phrase';

/** Text remains a scene document; timeline clip selection keeps its own montage semantics. */
export function InspectProjectTextPanel({ project }: { project: VideoProject }) {
  const editor = useProjectTextEditing(project);
  const [choice, setChoice] = useState('');
  const [opened, setOpened] = useState('');
  const [created, setCreated] = useState('');
  const [limit, setLimit] = useState(50);
  const documents = project.textDocuments ?? [];
  const entry = documents.find((item) => item.id === choice) ?? documents[0];
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
    <div data-ui="video-editor.text.panel" className="min-w-0 space-y-3 pe-2">
      <InspectorActionButton onClick={add}>
        <Plus size={14} /> {translate('videoEditor.sidebar.newProjectText')}
      </InspectorActionButton>
      {entry ? (
        <>
          <SelectField
            label={translate('videoEditor.sidebar.textDocumentChoice')}
            value={entry.id}
            options={documents.map((document, index) => ({
              value: document.id,
              label: documentLabel(project, document, index),
            }))}
            onChange={(id) => {
              editor.endTyping();
              setChoice(id);
              setOpened('');
              setCreated('');
              setLimit(50);
            }}
          />
          <p className="text-xs text-[var(--sniptale-color-text-muted)]">
            {translate(
              entry.binding.kind === 'project'
                ? 'videoEditor.sidebar.textClockProject'
                : 'videoEditor.sidebar.textClockSource'
            )}
          </p>
          <DocumentCaptions entry={entry} editor={editor} />
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
