import { useEffect, useRef, useState } from 'react';
import type { AIModelCatalogPayload } from '../../../contracts/messaging/ai-settings-runtime';
import type { ReviewSpeechProfile } from '../../../features/video/review/speech-transcript';
import { AIModelSelector } from '../../../features/ai/model-selector';
import { useInspectorDisclosure } from '../../../composition/inspector-disclosures/state';
import { translate } from '../../../platform/i18n';
import {
  NumericRow,
  SegmentedRow,
  TextField,
  TextareaField,
} from '../../compact-inspector-controls';
import { InspectorParameterRow } from '../../compact-inspector-controls/layout';
import { InspectorDisclosureView } from '../../compact-inspector-controls/disclosure';

/** Both editors share synthesis settings; callers retain catalog and profile authority. */
export function SpeechSynthesisProfileFields(props: {
  catalog: AIModelCatalogPayload | null;
  profile: ReviewSpeechProfile | undefined;
  preferenceId: string;
  onChange(profile: ReviewSpeechProfile): void;
  onOpenModels?: (() => void) | undefined;
  onSelectModel?: ((id: string | null) => void) | undefined;
}) {
  const { profile, catalog } = props;
  const [advanced, setAdvanced] = useInspectorDisclosure(props.preferenceId, false);
  const change = (patch: Partial<ReviewSpeechProfile>) => {
    if (profile) props.onChange({ ...profile, ...patch });
  };
  return (
    <div className="sniptale-parameter-stack" data-ui="video.speech.profile">
      <InspectorParameterRow stacked label={translate('gallery.videoReview.speechSynthesisModel')}>
        {catalog ? (
          <AIModelSelector
            models={catalog.models}
            providers={catalog.providers}
            selectedModelId={profile?.modelId ?? null}
            onOpen={props.onOpenModels}
            onSelect={(id) => {
              if (props.onSelectModel) {
                props.onSelectModel(id);
                return;
              }
              const model = catalog.models.find((entry) => entry.id === id);
              if (model?.audio?.speech)
                props.onChange({ modelId: model.id, ...model.audio.speech });
            }}
          />
        ) : null}
      </InspectorParameterRow>
      {profile ? (
        <>
          <TextField
            label={translate('gallery.videoReview.speechVoice')}
            value={profile.voiceId}
            maxLength={200}
            onChange={(event) => change({ voiceId: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') event.preventDefault();
            }}
          />
          <SpeechSpeedField value={profile.speed ?? 1} onChange={(speed) => change({ speed })} />
          <SegmentedRow
            label={translate('gallery.videoReview.speechFormat')}
            ariaLabel={translate('gallery.videoReview.speechFormat')}
            value={profile.responseFormat}
            options={[
              { value: 'mp3', label: 'MP3' },
              { value: 'wav', label: 'WAV' },
              { value: 'pcm', label: translate('settings.aiProviders.modelAudioPcm') },
            ]}
            onChange={(responseFormat) => change({ responseFormat })}
          />
          <InspectorDisclosureView
            variant="structural"
            label={translate('gallery.videoReview.presentationAdvanced')}
            open={advanced}
            onOpenChange={setAdvanced}
            dataUi="video.speech.profile.advanced"
            bodyClassName="sniptale-parameter-stack px-2 pt-2"
          >
            <TextareaField
              label={translate('gallery.videoReview.speechInstructions')}
              rows={2}
              value={profile.instructions ?? ''}
              maxLength={10000}
              onChange={(instructions) => {
                const { instructions: _instructions, ...rest } = profile;
                props.onChange(instructions ? { ...rest, instructions } : rest);
              }}
            />
          </InspectorDisclosureView>
        </>
      ) : null}
    </div>
  );
}

/** A disposable synthesis draft commits on release and restores its value on Escape. */
function SpeechSpeedField(props: { value: number; onChange(value: number): void }) {
  const [draft, setDraft] = useState(props.value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(props.value), [props.value]);
  const cancel = () => {
    cancelled.current = true;
    setDraft(props.value);
  };
  return (
    <div
      onPointerDownCapture={() => {
        cancelled.current = false;
      }}
      onPointerCancelCapture={cancel}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') cancel();
        else cancelled.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.stopPropagation();
      }}
    >
      <NumericRow
        appearance="plain"
        label={translate('gallery.videoReview.speechSpeed')}
        unit="x"
        min={0.25}
        max={4}
        step={0.05}
        precision={2}
        enterBehavior="blur"
        value={draft}
        scrub={{ min: 0.5, max: 2, step: 0.05 }}
        onPreviewValue={(value) => {
          if (!cancelled.current) setDraft(value);
        }}
        onCommitValue={(value) => {
          if (cancelled.current) return;
          setDraft(value);
          if (value !== props.value) props.onChange(value);
        }}
      />
    </div>
  );
}
