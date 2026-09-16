import { ProductToggle } from '@sniptale/ui/product-form-controls';
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
        <AIModelSelector
          models={configuration.models}
          providers={configuration.providers}
          selectedModelId={modelId}
          onSelect={chooseModel}
          disabled={pending}
        />
      ) : (
        <p role="status">
          {t(
            configurationFailed
              ? 'scenario.editor.guideAiConfigurationFailed'
              : 'scenario.editor.loading'
          )}
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
        <label className="guide-ai-images">
          <ProductToggle
            aria-label={t('scenario.editor.guideAiImages')}
            checked={includeImages}
            disabled={pending}
            onClick={() => chooseImages(!includeImages)}
          />
          {t('scenario.editor.guideAiImages')} ({imageCount})
        </label>
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
