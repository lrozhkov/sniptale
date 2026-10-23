import { useEffect, useRef, useState } from 'react';
import { AIModelSelector } from '../../../features/ai/model-selector';
import type { AIModelSelectionBootstrapPayload } from '../../../contracts/messaging/ai-settings-runtime';
import type { AISpeechModelParameters } from '../../../contracts/settings/model-operation';
import type { ScenarioNarrationText } from '../../../features/scenario/project/public';
import { requestAIModelSelectionBootstrap } from '../../../workflows/ai-settings/query';
import { InspectorParameterRow } from '../../../ui/compact-inspector-controls/layout';
import { TextField, TextareaField, SelectField } from '../../../ui/compact-inspector-controls';
import type { ScenarioNarrationPreview } from '../../../workflows/scenario-narration/generation';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { Translate } from '../../../platform/i18n';
import { TourInspectorNumericRow } from './numeric-row';
import {
  scenarioNarrationTargetKey,
  useScenarioNarrationAI,
  type ScenarioNarrationAccess,
} from './use-narration-ai';

type Profile = AISpeechModelParameters & { modelId: string };
/** Scenario-local form composes the checked model catalog and page-owned commands. */
export function TourNarrationAI({
  targets,
  access,
  disabled,
  t,
}: {
  targets: readonly ScenarioNarrationText[];
  access: ScenarioNarrationAccess;
  disabled: boolean;
  t: Translate;
}) {
  const form = useRef<HTMLElement>(null);
  useEffect(() => {
    form.current?.focus();
  }, []);
  const [catalog, setCatalog] = useState<AIModelSelectionBootstrapPayload | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [reload, setReload] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [approved, setApproved] = useState<string | null>(null);
  const [selected, setSelected] = useState(() => new Set(targets.map(scenarioNarrationTargetKey)));
  const operation = useScenarioNarrationAI(
    access,
    targets.filter((target) => selected.has(scenarioNarrationTargetKey(target)))
  );
  useEffect(() => {
    let current = true;
    setCatalogError(false);
    void requestAIModelSelectionBootstrap('speech')
      .then((value) => {
        if (!current) return;
        setCatalog(value);
        setProfile((previous) => {
          if (previous && value.models.some((model) => model.id === previous.modelId))
            return previous;
          const model =
            value.models.find((model) => model.id === value.defaultModelId) ?? value.models[0];
          return model?.audio?.speech ? { modelId: model.id, ...model.audio.speech } : null;
        });
      })
      .catch(() => {
        if (current) setCatalogError(true);
      });
    return () => {
      current = false;
    };
  }, [reload]);
  const model = catalog?.models.find((entry) => entry.id === profile?.modelId);
  const provider = catalog?.providers.find((entry) => entry.id === model?.providerId);
  useEffect(() => setApproved(null), [provider?.id]);
  const busy = operation.running || operation.applying;
  return (
    <section
      ref={form}
      tabIndex={-1}
      data-tour-narration-ai
      className="min-w-0 space-y-3"
      aria-label={t('scenario.editor.tourNarrationAI')}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <p className="guide-inspector-hint">{t('scenario.editor.tourNarrationAISave')}</p>
      {targets.length > 1 && (
        <fieldset disabled={busy || disabled} className="space-y-2">
          <legend className="text-xs">{t('scenario.editor.tourNarrationAITargets')}</legend>
          {targets.map((target) => {
            const key = scenarioNarrationTargetKey(target);
            return (
              <label key={key} className="tour-narration-ai-target">
                <input
                  type="checkbox"
                  data-ai-target={target.objectId}
                  checked={selected.has(key)}
                  onChange={(event) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(key);
                      else next.delete(key);
                      return next;
                    })
                  }
                />
                <span>{target.text}</span>
              </label>
            );
          })}
        </fieldset>
      )}
      <NarrationVoiceParameters
        catalog={catalog}
        profile={profile}
        disabled={busy || disabled}
        busy={busy}
        onChange={(next) => {
          if (
            JSON.stringify(next) !== JSON.stringify(profile) &&
            operation.resetUnacceptedPreviews()
          )
            setProfile(next);
        }}
        t={t}
      />
      {(!catalog?.models.length || catalogError) && (
        <ProductActionButton
          compact
          tone="secondary"
          onClick={() => setReload((value) => value + 1)}
        >
          {t('gallery.videoReview.speechReloadModels')}
        </ProductActionButton>
      )}
      {provider && (
        <div className="tour-narration-ai-disclosure">
          <p>{t('gallery.videoReview.speechConsentText').replace('{provider}', provider.name)}</p>
          <p>{model?.displayName}</p>
          <p>
            {t(
              profile?.instructions
                ? 'gallery.videoReview.textVoicePromptSent'
                : 'gallery.videoReview.textVoiceNoPrompt'
            )}
          </p>
          <p>{t('gallery.videoReview.textVoiceHistoryDisclosure')}</p>
          <label className="tour-narration-ai-target">
            <input
              data-ai-consent
              type="checkbox"
              checked={approved === provider.id}
              disabled={busy || disabled}
              onChange={(event) => setApproved(event.currentTarget.checked ? provider.id : null)}
            />
            <span>{t('scenario.editor.tourNarrationAIConsent')}</span>
          </label>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <ProductActionButton
          compact
          data-ai-generate
          disabled={
            disabled ||
            busy ||
            !profile ||
            !provider ||
            approved !== provider.id ||
            !operation.remaining
          }
          onClick={() => {
            if (profile && provider && approved === provider.id)
              void operation.generate(profile, provider.id);
          }}
        >
          {t('gallery.videoReview.speechGenerateSelected')}
        </ProductActionButton>
        {busy && (
          <ProductActionButton compact tone="secondary" onClick={operation.cancel}>
            {t('common.actions.cancel')}
          </ProductActionButton>
        )}
      </div>
      {operation.running && (
        <p role="status" className="guide-inspector-hint">
          {t('scenario.editor.tourNarrationAIProgress')
            .replace('{done}', String(operation.completed))
            .replace('{total}', String(operation.total))}
        </p>
      )}
      {operation.failed && (
        <p role="alert" className="guide-inspector-hint">
          {t('scenario.editor.guideOperationFailed')}
        </p>
      )}
      <NarrationResults
        results={operation.ready}
        selected={selected}
        errors={operation.errors}
        disabled={disabled || busy}
        batch={targets.length > 1}
        onApply={operation.apply}
        t={t}
      />
      {targets
        .filter(
          (target) =>
            operation.errors[scenarioNarrationTargetKey(target)] &&
            !operation.ready.some(
              (entry) =>
                scenarioNarrationTargetKey(entry.preview.scope.target) ===
                scenarioNarrationTargetKey(target)
            )
        )
        .map((target) => (
          <p role="alert" className="guide-inspector-hint" key={scenarioNarrationTargetKey(target)}>
            {target.text}: {t('scenario.editor.guideOperationFailed')}
          </p>
        ))}
    </section>
  );
}

/** Voice parameter presentation reuses the configured selector without owning catalog or attempt lifetime. */
function NarrationVoiceParameters({
  catalog,
  profile,
  disabled,
  busy,
  onChange,
  t,
}: {
  catalog: AIModelSelectionBootstrapPayload | null;
  profile: Profile | null;
  disabled: boolean;
  busy: boolean;
  onChange(profile: Profile): void;
  t: Translate;
}) {
  const change = (patch: Partial<AISpeechModelParameters>) => {
    if (profile) onChange({ ...profile, ...patch });
  };
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <InspectorParameterRow stacked label={t('gallery.videoReview.speechSynthesisModel')}>
        {catalog && (
          <AIModelSelector
            models={catalog.models}
            providers={catalog.providers}
            selectedModelId={profile?.modelId ?? null}
            onSelect={(id) => {
              const selected = catalog.models.find((entry) => entry.id === id);
              if (selected?.audio?.speech)
                onChange({ modelId: selected.id, ...selected.audio.speech });
            }}
          />
        )}
      </InspectorParameterRow>
      {profile && (
        <>
          <TextField
            label={t('gallery.videoReview.speechVoice')}
            value={profile.voiceId}
            onChange={(event) => change({ voiceId: event.currentTarget.value })}
          />
          <TourInspectorNumericRow
            label={t('gallery.videoReview.speechSpeed')}
            value={profile.speed ?? 1}
            min={0.25}
            max={4}
            step={0.05}
            precision={2}
            disabled={busy}
            onChange={(speed) => change({ speed })}
          />
          <SelectField
            label={t('gallery.videoReview.speechFormat')}
            value={profile.responseFormat}
            options={[
              { value: 'mp3', label: 'MP3' },
              { value: 'wav', label: 'WAV' },
              { value: 'pcm', label: t('settings.aiProviders.modelAudioPcm') },
            ]}
            onChange={(value) => {
              if (value === 'mp3' || value === 'wav' || value === 'pcm')
                change({ responseFormat: value });
            }}
          />
          <TextareaField
            label={t('gallery.videoReview.speechInstructions')}
            rows={2}
            value={profile.instructions ?? ''}
            maxLength={10000}
            onChange={(instructions) => {
              const { instructions: _old, ...rest } = profile;
              onChange(instructions ? { ...rest, instructions } : rest);
            }}
          />
        </>
      )}
    </fieldset>
  );
}

/** Ready audio presentation keeps explicit Apply and accepted rows separate from attempt state. */
function NarrationResults({
  results,
  selected,
  errors,
  disabled,
  batch,
  onApply,
  t,
}: {
  results: ReturnType<typeof useScenarioNarrationAI>['ready'];
  selected: ReadonlySet<string>;
  errors: Record<string, string>;
  disabled: boolean;
  batch: boolean;
  onApply(previews: readonly ScenarioNarrationPreview[]): Promise<void>;
  t: Translate;
}) {
  const ready = results
    .filter(
      (entry) =>
        !entry.accepted && selected.has(scenarioNarrationTargetKey(entry.preview.scope.target))
    )
    .map((entry) => entry.preview);
  return (
    <>
      {results.length > 0 && (
        <div className="space-y-3" data-ai-results>
          {results.map(({ preview, accepted }) => {
            const key = scenarioNarrationTargetKey(preview.scope.target);
            return (
              <div className="tour-narration-ai-result" key={key}>
                <p className="text-xs">{preview.text}</p>
                {!accepted && (
                  <audio
                    data-ai-preview
                    controls
                    preload="metadata"
                    src={preview.url}
                    className="max-w-full"
                    aria-label={t('scenario.editor.tourNarrationAIPreview')}
                  />
                )}
                {accepted ? (
                  <p role="status" className="text-xs">
                    {t('scenario.editor.tourNarrationAIApplied')}
                  </p>
                ) : (
                  <ProductActionButton
                    compact
                    data-ai-apply={preview.scope.target.objectId}
                    disabled={disabled}
                    onClick={() => void onApply([preview])}
                  >
                    {t('scenario.editor.tourNarrationAIApply')}
                  </ProductActionButton>
                )}
                {errors[key] && (
                  <p role="alert" className="guide-inspector-hint">
                    {t('scenario.editor.guideOperationFailed')}
                  </p>
                )}
              </div>
            );
          })}
          {batch && (
            <ProductActionButton
              compact
              data-ai-apply-all
              disabled={disabled || !ready.length}
              onClick={() => void onApply(ready)}
            >
              {t('scenario.editor.tourNarrationAIApplyAll')}
            </ProductActionButton>
          )}
        </div>
      )}
    </>
  );
}
