import { CheckboxField } from '../../ui/compact-inspector-controls';
import { InspectorParameterRow } from '../../ui/compact-inspector-controls/layout';
import { GuideAiPromptField } from './ai-prompt-field';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { GuideAiScopePicker } from './ai-scope-picker';
import { AIModelSelector } from '../../features/ai/model-selector';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { Translate } from '../../platform/i18n';
import type { useGuideAiSession } from './use-ai-session';

/** Presents explicit request scope, instructions, model and image disclosure. */
export function GuideAiRequestForm({
  project,
  session,
  selectedStepId,
  selectedBlockId,
  t,
}: {
  project: GuideProject;
  session: ReturnType<typeof useGuideAiSession>;
  selectedStepId: string | null;
  selectedBlockId: string | null;
  t: Translate;
}) {
  const {
    configuration,
    configurationFailed,
    selectionUnavailable,
    selectionFailed,
    retryConfiguration,
    modelId,
    chooseModel,
    instruction,
    writeInstruction,
    includeImages,
    chooseImages,
    pending,
    imageCount,
  } = session;
  return (
    <>
      <GuideAiScopePicker
        project={project}
        session={session}
        selectedStepId={selectedStepId}
        selectedBlockId={selectedBlockId}
        t={t}
      />
      <GuideAiPromptField
        value={instruction}
        onChange={writeInstruction}
        disabled={pending}
        t={t}
      />
      {configuration ? (
        <InspectorParameterRow label={t('scenario.editor.aiEditorModel')}>
          <AIModelSelector
            models={configuration.models}
            providers={configuration.providers}
            selectedModelId={modelId}
            onSelect={chooseModel}
            disabled={pending}
          />
        </InspectorParameterRow>
      ) : (
        <p role="status">
          {t(
            configurationFailed
              ? 'scenario.editor.guideAiConfigurationFailed'
              : 'scenario.editor.loading'
          )}
        </p>
      )}
      {selectionFailed && <p role="alert">{t('scenario.editor.guideAiSelectionFailed')}</p>}
      {selectionUnavailable && (
        <p role="status">
          <bdi className="[overflow-wrap:anywhere]">{session.unavailableModelName}</bdi>{' '}
          {t('scenario.editor.guideAiModelUnavailable')}
        </p>
      )}
      {configurationFailed && (
        <ProductActionButton compact tone="secondary" onClick={retryConfiguration}>
          {t('scenario.editor.guideAiRetry')}
        </ProductActionButton>
      )}
      {configuration && !configuration.models.length && (
        <p>{t('scenario.editor.guideAiConfigure')}</p>
      )}
      {imageCount > 0 && (
        <CheckboxField
          label={`${t('scenario.editor.guideAiImages')} (${imageCount})`}
          value={includeImages}
          disabled={pending}
          onChange={chooseImages}
        />
      )}
      <p className="guide-ai-disclosure">
        {t(
          includeImages && imageCount > 0
            ? 'scenario.editor.guideAiDisclosureImages'
            : 'scenario.editor.guideAiDisclosureText'
        )}
      </p>
    </>
  );
}
