import { ProductToggle } from '@sniptale/ui/product-form-controls';
import { Film, SlidersHorizontal } from 'lucide-react';
import {
  VideoAutoProcessingAction,
  type VideoAutoProcessingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { NumericValueField, SelectField } from '../../../../../ui/compact-inspector-controls';
import { translate } from '../../../../../platform/i18n';
import type { getAutoProcessingClipChoices } from '../../../../project/operations/auto-transform';

export function autoProcessingActionLabel(action: VideoAutoProcessingAction) {
  switch (action) {
    case VideoAutoProcessingAction.SPEED_UP:
      return translate('videoEditor.timeline.autoTransformActionSpeedUp');
    case VideoAutoProcessingAction.REMOVE:
      return translate('videoEditor.timeline.autoTransformActionRemove');
    case VideoAutoProcessingAction.SKIP:
      return translate('videoEditor.timeline.autoTransformActionSkip');
  }
}
export function AutoProcessingSetup({
  choices,
  scope,
  settings,
  camera,
  typingRate,
  framingScale,
  onTypingRate,
  onFramingScale,
  busy,
  seconds,
  onToggleScope,
  onChangeSettings,
  onToggleCamera,
}: {
  choices: ReturnType<typeof getAutoProcessingClipChoices>;
  scope: readonly string[];
  settings: VideoAutoProcessingSettings;
  camera: boolean;
  typingRate: number;
  framingScale: number;
  onTypingRate: (rate: number) => void;
  onFramingScale: (scale: number) => void;
  busy: boolean;
  seconds: (value: number) => string;
  onToggleScope: (clipId: string) => void;
  onChangeSettings: (patch: Partial<VideoAutoProcessingSettings['stableSegments']>) => void;
  onToggleCamera: () => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_350px]">
      <section
        className="flex min-h-0 flex-col p-5"
        aria-label={translate('videoEditor.timeline.autoScope')}
      >
        <h3 className="mb-1 flex shrink-0 items-center gap-2 text-sm font-medium">
          <Film size={15} aria-hidden="true" />
          {translate('videoEditor.timeline.autoScope')}
          <span className="ml-auto text-xs tabular-nums text-[var(--sniptale-color-text-secondary)]">
            {scope.length} / {choices.length}
          </span>
        </h3>
        <p className="mb-4 shrink-0 text-xs leading-relaxed text-[var(--sniptale-color-text-secondary)]">
          {translate('videoEditor.timeline.autoChooseClips')}
        </p>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {choices.map((choice) => (
            <label
              key={choice.clipId}
              data-ui="video-editor.auto.scope"
              data-clip-id={choice.clipId}
              className={`flex cursor-pointer items-start gap-3 rounded-md px-2 py-3
hover:bg-[var(--sniptale-color-surface-hover)] has-[:disabled]:cursor-default
has-[:disabled]:opacity-60`}
            >
              <input
                type="checkbox"
                className="sniptale-checkbox sniptale-checkbox-sm mt-0.5 shrink-0"
                checked={scope.includes(choice.clipId)}
                disabled={busy || !choice.recordingId || !choice.sourceInstanceId}
                onChange={() => onToggleScope(choice.clipId)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" title={choice.name}>
                  {choice.name}
                </span>
                <span
                  className="mt-1 block truncate text-xs text-[var(--sniptale-color-text-secondary)]"
                  title={choice.sourceName}
                >
                  {choice.sourceName} · {seconds(choice.startTime)}–{seconds(choice.endTime)}
                </span>
                {choice.linkedCount > 1 ? (
                  <span className="mt-1 block text-xs text-[var(--sniptale-color-text-secondary)]">
                    {translate('videoEditor.timeline.autoLinked')} {choice.linkedCount}
                  </span>
                ) : null}
                {choice.locked || !choice.recordingId || !choice.sourceInstanceId ? (
                  <span className="mt-1 block text-xs">
                    {translate(
                      choice.locked
                        ? 'videoEditor.timeline.autoBlockedLocked'
                        : 'videoEditor.timeline.autoTransformUnavailable'
                    )}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </section>
      <AutoProcessingSettings
        settings={settings}
        camera={camera}
        typingRate={typingRate}
        framingScale={framingScale}
        onTypingRate={onTypingRate}
        onFramingScale={onFramingScale}
        busy={busy}
        onChangeSettings={onChangeSettings}
        onToggleCamera={onToggleCamera}
      />
    </div>
  );
}

function AutoProcessingSettings({
  settings,
  camera,
  typingRate,
  framingScale,
  onTypingRate,
  onFramingScale,
  busy,
  onChangeSettings,
  onToggleCamera,
}: {
  settings: VideoAutoProcessingSettings;
  camera: boolean;
  typingRate: number;
  framingScale: number;
  onTypingRate: (rate: number) => void;
  onFramingScale: (scale: number) => void;
  busy: boolean;
  onChangeSettings: (patch: Partial<VideoAutoProcessingSettings['stableSegments']>) => void;
  onToggleCamera: () => void;
}) {
  return (
    <section
      className="min-h-0 overflow-y-auto border-l border-[var(--sniptale-color-border-soft)] p-5"
      aria-label={translate('videoEditor.timeline.autoSettings')}
    >
      <h3 className="mb-4 flex items-center gap-2 text-sm font-medium">
        <SlidersHorizontal size={15} aria-hidden="true" />
        {translate('videoEditor.timeline.autoSettings')}
      </h3>
      <div className="mb-4 border-b border-[var(--sniptale-color-border-soft)] pb-4">
        <SelectField
          label={translate('videoEditor.timeline.autoTyping')}
          className="!border-transparent !bg-transparent !px-0 !py-0"
          value={String(typingRate)}
          disabled={busy}
          options={[1, 2, 4, 8].map((rate) => ({
            value: String(rate),
            label:
              rate === 1 ? translate('videoEditor.timeline.autoTransformActionSkip') : `${rate}×`,
          }))}
          onChange={(value) => onTypingRate(Number(value))}
        />
      </div>
      <div className="space-y-2">
        <SelectField
          label={translate('videoEditor.timeline.autoIdle')}
          className="!border-transparent !bg-transparent !px-0 !py-0"
          value={settings.stableSegments.action}
          disabled={busy}
          options={Object.values(VideoAutoProcessingAction).map((action) => ({
            value: action,
            label: autoProcessingActionLabel(action),
          }))}
          onChange={(action) => onChangeSettings({ action })}
        />
        {settings.stableSegments.action === VideoAutoProcessingAction.SPEED_UP ? (
          <SelectField
            label={translate('videoEditor.timeline.autoTransformSpeedLabel')}
            className="!border-transparent !bg-transparent !px-0 !py-0"
            value={String(settings.stableSegments.speedUpPlaybackRate)}
            disabled={busy}
            options={[2, 4, 8].map((rate) => ({ value: String(rate), label: `${rate}×` }))}
            onChange={(value) => onChangeSettings({ speedUpPlaybackRate: Number(value) })}
          />
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--sniptale-color-text-secondary)]">
        {translate('videoEditor.timeline.autoDetectionHelp')}
      </p>
      <div
        className={`my-4 flex items-center justify-between gap-4 border-t
border-[var(--sniptale-color-border-soft)] pt-4`}
      >
        <span className="text-xs leading-relaxed">
          {translate('videoEditor.timeline.autoCamera')}
        </span>
        <ProductToggle
          size="sm"
          aria-label={translate('videoEditor.timeline.autoCamera')}
          checked={camera}
          disabled={busy}
          onClick={onToggleCamera}
        />
      </div>
      {camera ? (
        <div className="mb-4">
          <SelectField
            label={translate('videoEditor.timeline.autoFramingStrength')}
            className="!border-transparent !bg-transparent !px-0 !py-0"
            value={String(framingScale)}
            disabled={busy}
            options={[
              { value: '1.25', label: translate('videoEditor.timeline.autoFramingSubtle') },
              { value: '1.4', label: translate('videoEditor.timeline.autoFramingBalanced') },
              { value: '1.7', label: translate('videoEditor.timeline.autoFramingClose') },
            ]}
            onChange={(value) => onFramingScale(Number(value))}
          />
          <p className="mt-2 text-xs leading-relaxed text-[var(--sniptale-color-text-secondary)]">
            {translate('videoEditor.timeline.autoFramingHelp')}
          </p>
        </div>
      ) : null}
      <details className="group border-t border-[var(--sniptale-color-border-soft)] pt-4">
        <summary className="cursor-pointer text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('videoEditor.timeline.autoMore')}
        </summary>
        <div className="mt-3 space-y-1">
          {(['minDurationSeconds', 'shoulderSeconds'] as const).map((key) => {
            const label = translate(
              key === 'minDurationSeconds'
                ? 'videoEditor.timeline.autoTransformMinDurationLabel'
                : key === 'shoulderSeconds'
                  ? 'videoEditor.timeline.autoShoulder'
                  : 'videoEditor.timeline.autoMergeGap'
            );
            return (
              <div key={key} className="flex min-h-8 items-center justify-between gap-2 text-xs">
                <span>{label}</span>
                <NumericValueField
                  label={label}
                  disabled={busy}
                  min={key === 'minDurationSeconds' ? 0.1 : 0}
                  step={0.1}
                  precision={1}
                  value={settings.stableSegments[key]}
                  onPreviewValue={(value) => onChangeSettings({ [key]: value })}
                  onCommitValue={(value) => onChangeSettings({ [key]: value })}
                />
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}
