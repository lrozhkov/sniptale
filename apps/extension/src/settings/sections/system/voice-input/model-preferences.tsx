import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { AIModelSelector } from '../../../../features/ai/model-selector';
import { CompactSegmentedSelector } from '../../../../ui/compact-inspector-controls/control-renderers';
import { translate } from '../../../../platform/i18n';
import { SettingsControlRow, settingsCompactWorkbenchClassName } from '../../../section-surface';
import { SettingsSwitch } from '../../../section-surface/panel-controls';
import type { VoiceInputSettingsController } from './controller-contract';

export function VoiceModelPreferences({
  controller,
  disabled,
}: {
  controller: Pick<VoiceInputSettingsController, 'models' | 'preferences'>;
  disabled: boolean;
}) {
  const preferences = controller.preferences;
  const models = controller.models;
  return (
    <div className={`${settingsCompactWorkbenchClassName} space-y-3`}>
      <SettingsControlRow label={translate('settings.voiceInput.backendLabel')} valueMinimum={360}>
        <div data-ui="settings.voice.backend">
          <CompactSegmentedSelector
            ariaLabel={translate('settings.voiceInput.backendLabel')}
            columns={3}
            options={[
              {
                value: 'off',
                label: translate('settings.voiceInput.backendOff'),
                disabled: preferences.saving,
              },
              {
                value: 'browser',
                label: translate('settings.voiceInput.backendBrowser'),
                disabled,
              },
              { value: 'model', label: translate('settings.voiceInput.backendModel'), disabled },
            ]}
            value={preferences.enabled === false ? 'off' : preferences.backend}
            onChange={(value) => {
              void preferences.setBackend(value);
            }}
          />
        </div>
      </SettingsControlRow>
      {preferences.enabled !== false && preferences.backend === 'model' ? (
        <>
          <SettingsControlRow
            label={translate('settings.voiceInput.transcriptionModel')}
            description={translate('settings.voiceInput.audioDisclosure')}
          >
            <div data-ui="settings.voice.transcription-model">
              <AIModelSelector
                models={models.transcription.models}
                providers={models.transcription.providers}
                selectedModelId={models.transcriptionSelectionId}
                onOpen={() => void models.refresh()}
                disabled={disabled || models.loading || models.promptSaving}
                onSelect={(id) => {
                  void models.selectTranscription(id);
                }}
              />
              {models.transcriptionUnavailable && (
                <p role="alert" className="break-words text-xs text-[var(--sniptale-color-danger)]">
                  {translate('aiModal.modelSelectionUnavailable')}{' '}
                  {preferences.transcription?.approvedModelCode}
                </p>
              )}
            </div>
          </SettingsControlRow>

          <SettingsControlRow
            label={translate('settings.voiceInput.correctionLabel')}
            description={translate('settings.voiceInput.textDisclosure')}
          >
            <SettingsSwitch
              data-ui="settings.voice.correction"
              checked={preferences.correction.enabled}
              aria-label={translate('settings.voiceInput.correctionLabel')}
              disabled={disabled}
              onClick={() => {
                void preferences.setCorrectionEnabled(!preferences.correction.enabled);
              }}
            />
          </SettingsControlRow>
          {preferences.correction.enabled ? (
            <>
              <SettingsControlRow label={translate('settings.voiceInput.correctionModel')}>
                <div data-ui="settings.voice.correction-model">
                  <AIModelSelector
                    models={models.correction.models}
                    providers={models.correction.providers}
                    selectedModelId={models.correctionSelectionId}
                    onOpen={() => void models.refresh()}
                    disabled={disabled || models.loading || models.promptSaving}
                    onSelect={(id) => {
                      void models.selectCorrection(id);
                    }}
                  />
                  {models.correctionUnavailable && (
                    <p
                      role="alert"
                      className="break-words text-xs text-[var(--sniptale-color-danger)]"
                    >
                      {translate('aiModal.modelSelectionUnavailable')}{' '}
                      {preferences.correction.model?.approvedModelCode}
                    </p>
                  )}
                </div>
              </SettingsControlRow>
              <VoiceCorrectionPrompt models={models} disabled={disabled} />
            </>
          ) : null}
          {models.error ||
          models.transcriptionUnavailable ||
          models.correctionUnavailable ||
          !models.transcription.models.length ||
          (preferences.correction.enabled && !models.correction.models.length) ? (
            <div className="grid gap-2">
              {models.error && (
                <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
                  {translate('settings.voiceInput.modelsError')}
                </p>
              )}
              <ProductActionButton
                compact
                tone="secondary"
                disabled={models.loading || models.promptSaving}
                onClick={() => {
                  void models.refresh();
                }}
              >
                {translate('settings.voiceInput.reloadModels')}
              </ProductActionButton>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function VoiceCorrectionPrompt({
  models,
  disabled,
}: {
  models: VoiceInputSettingsController['models'];
  disabled: boolean;
}) {
  return (
    <div className="grid max-w-[720px] gap-1">
      <span
        id="voice-correction-prompt-label"
        className="text-[12px] text-[var(--sniptale-color-text-secondary)]"
      >
        {translate('settings.voiceInput.correctionPrompt')}
      </span>
      <ProductTextarea
        data-ui="settings.voice.correction-prompt"
        aria-labelledby="voice-correction-prompt-label"
        value={models.prompt}
        maxLength={10000}
        rows={3}
        disabled={disabled || models.loading || models.promptSaving}
        placeholder={translate('settings.voiceInput.correctionPromptPlaceholder')}
        onChange={(event) => models.setPrompt(event.currentTarget.value)}
      />
      <div className="flex flex-wrap gap-2">
        <ProductActionButton
          compact
          tone="secondary"
          data-ui="settings.voice.prompt-save"
          disabled={disabled || models.loading || models.promptSaving || !models.promptDirty}
          onClick={() => {
            void models.savePrompt();
          }}
        >
          {translate('settings.voiceInput.savePrompt')}
        </ProductActionButton>
        <ProductActionButton
          compact
          tone="secondary"
          data-ui="settings.voice.prompt-reset"
          disabled={disabled || models.loading || models.promptSaving}
          onClick={() => {
            void models.resetPrompt();
          }}
        >
          {translate('settings.voiceInput.resetPrompt')}
        </ProductActionButton>
      </div>
    </div>
  );
}
