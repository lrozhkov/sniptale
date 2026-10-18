import { useEffect, useState } from 'react';
import { AudioLines } from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import type { AudioRecognitionOptions } from '../../../../../contracts/ai/audio';
import { AIModelSelector } from '../../../../../features/ai/model-selector';
import { translate, formatNumber, useAppLocale } from '../../../../../platform/i18n';
import { TextareaField } from '../../../../../ui/compact-inspector-controls';
import { InspectorParameterRow } from '../../../../../ui/compact-inspector-controls/layout';
import {
  projectRecognitionRange,
  type ProjectRecognitionOptions,
} from '../../../../../workflows/video/project-recognition';
import type { VideoProjectRecognitionController } from '../../../../runtime/session/recognition';
import { InspectorActionButton } from '../shared/actions';
import { NumberInput } from '../inputs/number';
import { OptionButtonsField } from '../shared/option-buttons';

interface RecognitionInspectorProps {
  project: VideoProject;
  clipId: string;
  controller: VideoProjectRecognitionController;
}

/** Form and consent are disposable; the mounted runtime owns jobs, proposals and publication. */
export function InspectProjectRecognition(props: RecognitionInspectorProps) {
  const { controller } = props;
  useAppLocale();
  const loadModels = controller.loadModels;
  useEffect(() => {
    void loadModels();
  }, [loadModels]);
  return (
    <div data-ui="video-editor.recognition.panel" className="min-w-0 space-y-3 pe-2">
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('videoEditor.sidebar.recognitionNativeScope')}
      </p>
      <RecognitionForm {...props} />
      <RecognitionStatus controller={controller} />
      <RecognitionProposal controller={controller} />
    </div>
  );
}

type RecognitionConsent = {
  options: ProjectRecognitionOptions;
  provider: string;
  model: string;
};

function RecognitionForm({ project, clipId, controller }: RecognitionInspectorProps) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key);
  const range = projectRecognitionRange(project, clipId);
  const bounds = range ?? { start: 0, end: 0 };
  const [start, setStart] = useState(bounds.start);
  const [end, setEnd] = useState(bounds.end);
  const [choice, setChoice] = useState('');
  const [grouping, setGrouping] = useState<'sentences' | 'sentences-pauses'>('sentences-pauses');
  const [mode, setMode] = useState<AudioRecognitionOptions['mode']>('transcribe');
  const [granularity, setGranularity] =
    useState<AudioRecognitionOptions['granularity']>('sentence');
  const [prompt, setPrompt] = useState('');
  const [consent, setConsent] = useState<RecognitionConsent | null>(null);
  const loadModels = controller.loadModels;
  const modelId = choice || controller.catalog?.defaultModelId || '';
  const model = controller.catalog?.models.find((entry) => entry.id === modelId);
  const provider = controller.catalog?.providers.find((entry) => entry.id === model?.providerId);
  const multimodal = model?.audio?.transcription?.transport === 'audio-chat';
  function hasValidSourceRange() {
    return !!range && start >= range.start && end <= range.end && end > start;
  }
  const validRange = hasValidSourceRange();
  const pendingReceipt = !!controller.proposal?.receipt && !controller.accepted;
  const disabled = controller.running || consent !== null || pendingReceipt;
  return (
    <>
      <fieldset disabled={disabled} className="min-w-0 sniptale-parameter-stack">
        <InspectorParameterRow
          stacked
          label={label('gallery.videoReview.speechTranscriptionModel')}
        >
          <AIModelSelector
            models={controller.catalog?.models ?? []}
            providers={controller.catalog?.providers ?? []}
            selectedModelId={modelId || null}
            onSelect={(id) => setChoice(id ?? '')}
            onOpen={() => {
              void loadModels();
            }}
          />
        </InspectorParameterRow>
        <NumberInput
          label={label('gallery.videoReview.textFragmentStart')}
          value={start}
          min={bounds.start}
          max={bounds.end}
          step={0.01}
          unit="s"
          onChange={setStart}
        />
        <NumberInput
          label={label('gallery.videoReview.textFragmentEnd')}
          value={end}
          min={bounds.start}
          max={bounds.end}
          step={0.01}
          unit="s"
          onChange={setEnd}
        />
        {multimodal ? (
          <AudioChatSettings
            mode={mode}
            granularity={granularity}
            prompt={prompt}
            onModeChange={setMode}
            onGranularityChange={setGranularity}
            onPromptChange={setPrompt}
          />
        ) : (
          <OptionButtonsField
            label={label('gallery.videoReview.recognitionGrouping')}
            value={grouping}
            options={[
              { value: 'sentences', label: label('gallery.videoReview.recognitionSentences') },
              {
                value: 'sentences-pauses',
                label: label('gallery.videoReview.recognitionPauses'),
              },
            ]}
            onChange={(value) => {
              if (value === 'sentences' || value === 'sentences-pauses') setGrouping(value);
            }}
          />
        )}
        <InspectorActionButton
          disabled={!validRange || !model || !provider}
          onClick={() => {
            if (!model || !provider) return;
            setConsent({
              provider: provider.name,
              model: model.displayName,
              options: {
                clipId,
                modelId: model.id,
                approvedProviderId: provider.id,
                start,
                end,
                grouping,
                ...(multimodal
                  ? { recognition: { mode, granularity, prompt: mode === 'rewrite' ? prompt : '' } }
                  : {}),
              },
            });
          }}
        >
          <AudioLines size={14} />
          {label('gallery.videoReview.recognitionStart')}
        </InspectorActionButton>
      </fieldset>
      {!validRange ? (
        <p role="alert" className="text-xs">
          {label('videoEditor.sidebar.recognitionInvalidRange')}
        </p>
      ) : null}
      {!controller.catalog?.models.length && (
        <InspectorActionButton
          onClick={() => {
            void loadModels();
          }}
        >
          {label('gallery.videoReview.speechReloadModels')}
        </InspectorActionButton>
      )}
      {consent && (
        <RecognitionConsentView
          project={project}
          consent={consent}
          onApprove={() => {
            controller.recognize(consent.options);
            setConsent(null);
          }}
          onCancel={() => setConsent(null)}
        />
      )}
    </>
  );
}

function AudioChatSettings({
  mode,
  granularity,
  prompt,
  onModeChange,
  onGranularityChange,
  onPromptChange,
}: AudioRecognitionOptions & {
  onModeChange: (mode: AudioRecognitionOptions['mode']) => void;
  onGranularityChange: (granularity: AudioRecognitionOptions['granularity']) => void;
  onPromptChange: (prompt: string) => void;
}) {
  return (
    <>
      <OptionButtonsField
        label={translate('gallery.videoReview.recognitionProcessingMode')}
        value={mode}
        options={[
          { value: 'transcribe', label: translate('gallery.videoReview.recognitionVerbatim') },
          { value: 'rewrite', label: translate('gallery.videoReview.recognitionRewrite') },
        ]}
        onChange={(value) => {
          if (value === 'transcribe' || value === 'rewrite') onModeChange(value);
        }}
      />
      <OptionButtonsField
        label={translate('gallery.videoReview.recognitionGrouping')}
        value={granularity}
        options={[
          { value: 'phrase', label: translate('gallery.videoReview.recognitionPhrases') },
          { value: 'sentence', label: translate('gallery.videoReview.recognitionSentences') },
          { value: 'paragraph', label: translate('gallery.videoReview.recognitionParagraphs') },
        ]}
        onChange={(value) => {
          if (value === 'phrase' || value === 'sentence' || value === 'paragraph')
            onGranularityChange(value);
        }}
      />
      {mode === 'rewrite' && (
        <TextareaField
          rows={3}
          maxLength={10_000}
          label={translate('gallery.videoReview.recognitionInstructions')}
          value={prompt}
          onChange={onPromptChange}
        />
      )}
    </>
  );
}

function RecognitionConsentView({
  project,
  consent,
  onApprove,
  onCancel,
}: {
  project: VideoProject;
  consent: RecognitionConsent;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const locale = useAppLocale();
  return (
    <div data-ui="video-editor.recognition.consent" className="space-y-2 text-xs">
      <p>
        {translate(
          consent.options.recognition
            ? 'gallery.videoReview.speechConsentAudioInstructions'
            : 'gallery.videoReview.speechConsentAudio'
        ).replace('{provider}', consent.provider)}{' '}
        · {consent.model}
      </p>
      <p>
        {project.clips.find((clip) => clip.id === consent.options.clipId)?.name} ·{' '}
        {formatRecognitionRange(consent.options.start, consent.options.end, locale)}
      </p>
      <p>{translate('gallery.videoReview.recognitionHistoryDisclosure')}</p>
      <div className="flex flex-wrap gap-2">
        <InspectorActionButton onClick={onApprove}>
          {translate('gallery.videoReview.speechConsentContinue')}
        </InspectorActionButton>
        <InspectorActionButton onClick={onCancel}>
          {translate('common.actions.cancel')}
        </InspectorActionButton>
      </div>
    </div>
  );
}

function RecognitionStatus({ controller }: { controller: VideoProjectRecognitionController }) {
  const messages = new Map<string, Parameters<typeof translate>[0]>([
    ['stale', 'gallery.videoReview.speechChanged'],
    ['selection', 'videoEditor.sidebar.recognitionInvalidRange'],
    ['too-large', 'gallery.videoReview.recognitionTooLarge'],
    ['invalid-response', 'gallery.videoReview.recognitionInvalidResponse'],
    ['model', 'gallery.videoReview.speechMissingModel'],
  ]);
  return (
    <>
      {controller.running && (
        <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
          {translate('common.states.loading')} {controller.completed} / {controller.total}
          {!controller.applying && (
            <InspectorActionButton onClick={controller.cancel}>
              {translate('common.actions.cancel')}
            </InspectorActionButton>
          )}
        </div>
      )}
      {controller.error && (
        <p role="alert" className="text-xs">
          {translate(messages.get(controller.error) ?? 'videoEditor.sidebar.recognitionFailed')}
        </p>
      )}
    </>
  );
}

function RecognitionProposal({ controller }: { controller: VideoProjectRecognitionController }) {
  const locale = useAppLocale();
  const [applyMode, setApplyMode] = useState<'add' | 'replace'>('add');
  const [limit, setLimit] = useState(50);
  const proposal = controller.proposal;
  if (!proposal) return null;
  const pendingReceipt = !!proposal.receipt && !controller.accepted;
  return (
    <section data-ui="video-editor.recognition.proposal" className="min-w-0 space-y-2">
      <p className="text-xs">
        {translate(
          controller.accepted
            ? 'videoEditor.sidebar.recognitionSaved'
            : 'gallery.videoReview.recognitionPreview'
        )}
      </p>
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {proposal.job.project.clips.find((clip) => clip.id === proposal.job.options.clipId)?.name}
      </p>
      {proposal.entry.document.fragments.length === 0 && (
        <p className="text-xs">{translate('gallery.videoReview.recognitionEmpty')}</p>
      )}
      {proposal.entry.document.fragments.slice(0, limit).map((fragment) => (
        <TextareaField
          key={fragment.id}
          label={formatRecognitionRange(fragment.start, fragment.end, locale)}
          rows={2}
          value={fragment.text}
          maxLength={16_000}
          disabled={controller.running || !!proposal.receipt || controller.accepted}
          onChange={(text) => controller.edit(fragment.id, text)}
        />
      ))}
      {proposal.entry.document.fragments.length > limit && (
        <InspectorActionButton onClick={() => setLimit(limit + 50)}>
          {translate('gallery.videoReview.textFragmentMore')}
        </InspectorActionButton>
      )}
      {!proposal.receipt && (
        <OptionButtonsField
          label={translate('gallery.videoReview.recognitionMode')}
          value={applyMode}
          disabled={controller.running || !!proposal.receipt || controller.accepted}
          options={[
            { value: 'add', label: translate('gallery.videoReview.recognitionAdd') },
            { value: 'replace', label: translate('gallery.videoReview.recognitionReplace') },
          ]}
          onChange={(value) => {
            if (value === 'add' || value === 'replace') setApplyMode(value);
          }}
        />
      )}
      {!proposal.receipt && applyMode === 'replace' && (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.recognitionReplaceHint')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <InspectorActionButton
          disabled={
            controller.running || controller.accepted || !proposal.entry.document.fragments.length
          }
          onClick={() => controller.apply(applyMode)}
        >
          {translate('gallery.videoReview.recognitionApply')}
        </InspectorActionButton>
        <InspectorActionButton disabled={controller.running} onClick={controller.discard}>
          {translate(
            proposal.receipt
              ? 'videoEditor.sidebar.recognitionClose'
              : 'gallery.videoReview.recognitionDiscard'
          )}
        </InspectorActionButton>
      </div>
      {pendingReceipt && (
        <p className="text-xs">{translate('videoEditor.sidebar.recognitionSaveRetry')}</p>
      )}
    </section>
  );
}

function formatRecognitionRange(
  start: number,
  end: number,
  locale: ReturnType<typeof useAppLocale>
) {
  const options = { maximumFractionDigits: 2 };
  return `${formatNumber(start, options, locale)}–${formatNumber(end, options, locale)} ${translate(
    'videoEditor.timeline.secondsSuffix'
  )}`;
}
