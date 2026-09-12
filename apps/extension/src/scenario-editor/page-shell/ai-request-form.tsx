import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { SCENARIO_EDITOR_AI_PAYLOAD_LIMITS } from '@sniptale/runtime-contracts/ai/payload-policy';
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
              <input
                type="checkbox"
                disabled={pending}
                checked={stepIds.includes(step.id)}
                onChange={(event) => chooseStep(step.id, event.target.checked)}
              />
              {step.title || `${t('scenario.editor.guideAiStep')} ${index + 1}`}
            </label>
          ))}
        </div>
      )}
      <label>
        {t('scenario.editor.guideAiInstruction')}
        <ProductTextarea
          value={instruction}
          rows={3}
          maxLength={SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxInstructionChars}
          disabled={pending}
          onChange={(event) => writeInstruction(event.target.value)}
        />
      </label>
      <div className="guide-ai-presets">
        {(['Clarify', 'Shorten', 'Structure', 'Translate'] as const).map((action) => (
          <ProductActionButton
            key={action}
            tone="secondary"
            compact
            disabled={pending}
            onClick={() => writeInstruction(t(`scenario.editor.guideAi${action}Instruction`))}
          >
            {t(`scenario.editor.guideAi${action}`)}
          </ProductActionButton>
        ))}
      </div>
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
          <input
            type="checkbox"
            checked={includeImages}
            disabled={pending}
            onChange={(event) => chooseImages(event.target.checked)}
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
