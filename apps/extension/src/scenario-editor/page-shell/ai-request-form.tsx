import { ProductToggle } from '@sniptale/ui/product-form-controls';
import { GuideAiPromptField } from './ai-prompt-field';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { AIModelSelector } from '../../features/ai/model-selector';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { Translate } from '../../platform/i18n';
import type { useGuideAiSession } from './use-ai-session';

/** Presents explicit request scope, instructions, model and image disclosure. */
export function GuideAiRequestForm({
  session,
  selectedStepId,
  selectedBlockId,
  t,
}: {
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
    mode,
    chooseMode,
    steps,
    stepIds,
    chooseStep,
    includeImages,
    chooseImages,
    pending,
    imageCount,
  } = session;
  return (
    <>
      <fieldset disabled={pending} className="guide-ai-scope">
        <SegmentedSwitch
          density="compact"
          ariaLabel={t('scenario.editor.guideAiScope')}
          activeId={mode}
          options={[
            ...(selectedBlockId
              ? [{ id: 'block' as const, label: t('scenario.editor.guideAiBlock') }]
              : []),
            ...(selectedStepId
              ? [{ id: 'step' as const, label: t('scenario.editor.guideAiStep') }]
              : []),
            { id: 'steps', label: t('scenario.editor.guideAiSteps') },
          ]}
          onChange={(value) => {
            if (!pending) chooseMode(value);
          }}
        />
      </fieldset>
      {mode === 'steps' && (
        <div className="guide-ai-step-selection">
          {steps.map((step, index) => (
            <label key={step.id}>
              <ProductToggle
                aria-label={step.title || `${t('scenario.editor.guideAiStep')} ${index + 1}`}
                disabled={pending}
                checked={stepIds.includes(step.id)}
                onClick={() => chooseStep(step.id, !stepIds.includes(step.id))}
              />
              {step.title || `${t('scenario.editor.guideAiStep')} ${index + 1}`}
            </label>
          ))}
        </div>
      )}
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
