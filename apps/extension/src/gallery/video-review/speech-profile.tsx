import { InspectorParameterRow } from '../../ui/compact-inspector-controls/layout';
import { AIModelSelector } from '../../features/ai/model-selector';
import { translate } from '../../platform/i18n';
import type { AIModelCatalogPayload } from '../../contracts/messaging/ai-settings-runtime';
/** The same configured transcription selector serves original and recorded audio. */
export function SpeechTranscriptionModelField({
  speech,
  onOpenModels,
}: {
  onOpenModels?: (() => void) | undefined;
  speech: {
    catalogs: { transcription: AIModelCatalogPayload } | null;
    modelId: string;
    setModelId(id: string): void;
  };
}) {
  return (
    <InspectorParameterRow
      stacked
      label={translate('gallery.videoReview.speechTranscriptionModel')}
    >
      {speech.catalogs ? (
        <AIModelSelector
          models={speech.catalogs.transcription.models}
          providers={speech.catalogs.transcription.providers}
          onOpen={onOpenModels}
          selectedModelId={speech.modelId || null}
          onSelect={(id) => speech.setModelId(id ?? '')}
        />
      ) : (
        <p role="status">{translate('common.states.loading')}</p>
      )}
    </InspectorParameterRow>
  );
}
