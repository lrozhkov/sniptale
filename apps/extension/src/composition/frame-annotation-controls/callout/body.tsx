import type {
  CalloutAnchor,
  CalloutPlacement,
  CalloutPreset,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { translate } from '../../../platform/i18n';
import { getPreferredSideFromAnchor } from '../../../features/highlighter/frame-annotation/callout/geometry';
import type { CalloutSettingsPatch } from '../../../features/highlighter/frame-annotation/callout/model';
import { CalloutPositionSection, CalloutPresetSection } from './views';
import { CalloutManualSettings } from '../../../ui/highlighter-preset-editor/callout/inspector';
import type { CalloutFrameColors } from '../../../features/highlighter/callout-color-bindings';
import type { CalloutSaveSectionProps } from '../../../ui/highlighter-preset-editor/callout/inspector-save';
import type { FloatingPopoverDrag } from '../popover/drag';
import { SettingsPopoverHeader, type SettingsPopoverContext } from '../popover/header';
import { selectOrClosePopoverPreset } from '../popover/preset-selection';
import { createTemplateSourceAction, type TemplateSourceControl } from '../popover/template-source';
import { TemplateForkReturnGuard, useTemplateForkWorkflow } from '../popover/template-fork';
import { ApplyToFutureFramesGuard, useApplyToFutureFrames } from '../popover/apply-future';

export function createCalloutAnchorPlacement(
  anchor: CalloutAnchor
): Pick<CalloutPlacement, 'anchor' | 'side'> {
  return { anchor, side: getPreferredSideFromAnchor(anchor) ?? 'top' };
}

export function CalloutSettingsPopoverContent(props: {
  handleDelete: () => void;
  headerContext: SettingsPopoverContext;
  headerDrag?: FloatingPopoverDrag;
  handleSettingChange: (patch: CalloutSettingsPatch) => void;
  frameColors?: CalloutFrameColors;
  localSettings: CalloutSettings;
  onApplyPreset: (preset: CalloutPreset) => void;
  onForkPreset?: (preset: CalloutPreset) => void;
  onResetPreset?: ((preset: CalloutPreset) => void) | undefined;
  onShowPresets: () => void | Promise<void>;
  onTogglePreset: (preset: CalloutPreset) => void;
  pendingPresetIds: ReadonlySet<string>;
  presets: CalloutPreset[];
  presetError: string | null;
  saveSection: CalloutSaveSectionProps;
  onClose: () => void;
  onNestedLayerChange?: ((open: boolean) => void) | undefined;
  onApplyToFuture?: () => void;
  templateSourceControl?: TemplateSourceControl;
}) {
  const workflow = useTemplateForkWorkflow({
    ...(props.localSettings.sourcePresetId
      ? { activeTemplateId: props.localSettings.sourcePresetId }
      : {}),
    onFork: props.onForkPreset ?? (() => props.handleSettingChange({ sourcePresetId: undefined })),
    onRestore: props.onApplyPreset,
    onShowTemplates: props.onShowPresets,
    templates: props.presets,
  });
  const applyToFuture = useApplyToFutureFrames(props.onApplyToFuture);
  return (
    <>
      <SettingsPopoverHeader
        {...(workflow.session.mode === 'temporary'
          ? {
              action: {
                label: translate('content.templateFork.backToTemplates'),
                onClick: workflow.requestTemplates,
              },
            }
          : {})}
        {...(workflow.session.mode === 'temporary' &&
        props.headerContext === 'element' &&
        props.onApplyToFuture
          ? {
              applyToFutureAction: {
                label: translate('content.templateFork.applyToFuture'),
                onClick: applyToFuture.request,
              },
            }
          : {})}
        closeLabel={translate('content.callout.closeSettings')}
        context={props.headerContext}
        destructiveAction={{
          label: translate('content.callout.disableButton'),
          onClick: props.handleDelete,
        }}
        {...(props.templateSourceControl
          ? {
              sourceAction: createTemplateSourceAction(props.templateSourceControl, {
                forcedDescription: translate('content.callout.templateSourceForcedHint'),
                forcedLabel: translate('content.callout.templateSourceForced'),
                frameDescription: translate('content.callout.templateSourceFrameHint'),
                frameLabel: translate('content.callout.templateSourceFrame'),
              }),
            }
          : {})}
        {...(props.headerDrag ? { drag: props.headerDrag } : {})}
        onClose={props.onClose}
        title={translate('content.callout.settingsTitle')}
      />
      {applyToFuture.confirming ? (
        <ApplyToFutureFramesGuard
          onCancel={applyToFuture.cancel}
          onConfirm={applyToFuture.confirm}
        />
      ) : workflow.confirmingReturn ? (
        <TemplateForkReturnGuard
          onContinue={workflow.continueEditing}
          onDiscard={workflow.discard}
          onGoToSave={workflow.goToSave}
        />
      ) : workflow.session.mode === 'templates' ? (
        <CalloutPresetSection
          {...(props.frameColors ? { frameColors: props.frameColors } : {})}
          {...(props.localSettings.sourcePresetId
            ? { activePresetId: props.localSettings.sourcePresetId }
            : {})}
          onApplyPreset={(preset) => {
            selectOrClosePopoverPreset({
              isActive: props.localSettings.sourcePresetId === preset.id,
              onApply: props.onApplyPreset,
              onClose: props.onClose,
              preset,
            });
          }}
          onForkPreset={workflow.fork}
          {...(props.onResetPreset ? { onResetPreset: props.onResetPreset } : {})}
          onTogglePreset={props.onTogglePreset}
          pendingPresetIds={props.pendingPresetIds}
          presets={props.presets}
          error={props.presetError}
        />
      ) : (
        <CalloutManualSettings
          {...(props.frameColors ? { frameColors: props.frameColors } : {})}
          settings={props.localSettings}
          {...(props.onNestedLayerChange ? { onNestedLayerChange: props.onNestedLayerChange } : {})}
          {...(workflow.session.mode === 'temporary'
            ? { saveSectionStatus: translate('content.templateFork.temporaryStatus') }
            : {})}
          {...(workflow.saveRequest > 0 ? { saveSectionRequest: workflow.saveRequest } : {})}
          positionSection={
            <CalloutPositionSection
              embedded
              anchor={props.localSettings.placement.anchor}
              onChange={(anchor) =>
                props.handleSettingChange({
                  placement: createCalloutAnchorPlacement(anchor),
                })
              }
            />
          }
          saveSection={{
            ...props.saveSection,
            onCreate: (name) =>
              props.saveSection.onCreate(name, workflow.session.sourceTemplate?.tagIds ?? []),
            onCreated: workflow.completeSave,
            onOverwritten: workflow.completeSave,
          }}
          onChange={props.handleSettingChange}
        />
      )}
    </>
  );
}
