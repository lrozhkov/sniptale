import {
  ProductField,
  ProductInput,
  ProductSelect,
  ProductTextarea,
} from '@sniptale/ui/product-form-controls';
import { AIModelSelector } from '../../features/ai/model-selector';
import type { ReviewSpeechProfile } from '../../features/video/review/speech-transcript';
import { translate } from '../../platform/i18n';
import type { useReviewSpeech } from './use-speech';
type Controller = ReturnType<typeof useReviewSpeech>;
export function SpeechProfileFields({
  speech,
}: {
  speech: Pick<Controller, 'profile' | 'changeProfile' | 'catalogs' | 'modelId' | 'setModelId'>;
}) {
  const profile = speech.profile;
  const change = (patch: Partial<ReviewSpeechProfile>) => {
    if (profile) speech.changeProfile({ ...profile, ...patch });
  };
  return (
    <>
      <ProductField label={translate('gallery.videoReview.speechTranscriptionModel')}>
        {speech.catalogs ? (
          <AIModelSelector
            models={speech.catalogs.transcription.models}
            providers={speech.catalogs.transcription.providers}
            selectedModelId={speech.modelId || null}
            onSelect={(id) => speech.setModelId(id ?? '')}
          />
        ) : (
          <p role="status">{translate('common.states.loading')}</p>
        )}
      </ProductField>
      <ProductField label={translate('gallery.videoReview.speechSynthesisModel')}>
        {speech.catalogs ? (
          <AIModelSelector
            models={speech.catalogs.speech.models}
            providers={speech.catalogs.speech.providers}
            selectedModelId={profile?.modelId ?? null}
            onSelect={(id) => {
              const model = speech.catalogs?.speech.models.find((entry) => entry.id === id);
              if (model?.audio?.speech)
                speech.changeProfile({ modelId: model.id, ...model.audio.speech });
            }}
          />
        ) : null}
      </ProductField>
      {profile ? (
        <>
          <ProductField label={translate('gallery.videoReview.speechVoice')}>
            <ProductInput
              aria-label={translate('gallery.videoReview.speechVoice')}
              value={profile.voiceId}
              onChange={(event) => change({ voiceId: event.target.value })}
            />
          </ProductField>
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <ProductField label={translate('gallery.videoReview.speechSpeed')}>
              <ProductInput
                aria-label={translate('gallery.videoReview.speechSpeed')}
                type="number"
                min={0.25}
                max={4}
                step={0.05}
                value={profile.speed ?? ''}
                onChange={(event) => {
                  const { speed: _speed, ...rest } = profile;
                  speech.changeProfile(
                    event.target.value === ''
                      ? rest
                      : { ...rest, speed: event.target.valueAsNumber }
                  );
                }}
              />
            </ProductField>
            <ProductField label={translate('gallery.videoReview.speechFormat')}>
              <ProductSelect
                aria-label={translate('gallery.videoReview.speechFormat')}
                value={profile.responseFormat}
                options={[
                  { value: 'mp3', label: 'MP3' },
                  { value: 'wav', label: 'WAV' },
                ]}
                onChange={(value) => {
                  if (value === 'mp3' || value === 'wav') change({ responseFormat: value });
                }}
              />
            </ProductField>
          </div>
          <ProductField label={translate('gallery.videoReview.speechInstructions')}>
            <ProductTextarea
              aria-label={translate('gallery.videoReview.speechInstructions')}
              rows={2}
              value={profile.instructions ?? ''}
              maxLength={10000}
              onChange={(event) => {
                const { instructions: _instructions, ...rest } = profile;
                speech.changeProfile(
                  event.target.value ? { ...rest, instructions: event.target.value } : rest
                );
              }}
            />
          </ProductField>
        </>
      ) : null}
    </>
  );
}
