import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  createAnnotationTemplateStyle,
  getAnnotationMotionPreset,
} from '../../../../../features/video/project/annotation/presets';
import { getCompatibleAnnotationTemplateKinds } from '../../../../../features/video/project/annotation/template-families';
import { getVideoOverlayTemplateDefinition } from '../../../../../features/video/project/overlay-template/registry';
import { getVideoTemplateCatalogStatusLabelKey } from '../../../../../features/video/project/template/catalog-status';
import { TemplatePreviewBadges } from '../../../../library/template-preview';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import { getAnnotationTemplateOptions } from './options';
import { SelectInput } from '../shared/controls';
import { PANEL_META_CLASS_NAME, PANEL_SECTION_CLASS_NAME } from '../shared/panel';

type SelectedAnnotationClip = Extract<
  NonNullable<WorkspaceSidebarProps['selectedClip']>,
  { type: 'ANNOTATION' }
>;

export function AnnotationSummarySection(props: {
  clip: SelectedAnnotationClip;
  disabled: boolean;
  onUpdateAnnotationClipStyle: NonNullable<WorkspaceSidebarProps['onUpdateAnnotationClipStyle']>;
  onUpdateAnnotationClipTemplate: NonNullable<
    WorkspaceSidebarProps['onUpdateAnnotationClipTemplate']
  >;
}) {
  const definition = getVideoOverlayTemplateDefinition(props.clip.templateKind);

  return <AnnotationTemplateCard {...props} definition={definition} />;
}

function AnnotationTemplateCard(
  props: {
    clip: SelectedAnnotationClip;
    disabled: boolean;
    onUpdateAnnotationClipStyle: NonNullable<WorkspaceSidebarProps['onUpdateAnnotationClipStyle']>;
    onUpdateAnnotationClipTemplate: NonNullable<
      WorkspaceSidebarProps['onUpdateAnnotationClipTemplate']
    >;
  } & {
    definition: ReturnType<typeof getVideoOverlayTemplateDefinition>;
  }
) {
  const motionPreset = getAnnotationMotionPreset(props.clip.templateKind);
  const compatibleTemplateKinds = getCompatibleAnnotationTemplateKinds(props.clip.templateKind);
  const swapStyleActions = compatibleTemplateKinds.map(
    (templateKind: SelectedAnnotationClip['templateKind']) =>
      createSwapStyleAction(props, templateKind)
  );
  const recommendedActions = createRecommendedActions(props, motionPreset);

  return (
    <div className={PANEL_SECTION_CLASS_NAME}>
      <SelectInput
        label={translate('videoEditor.sidebar.annotationTemplateLabel')}
        value={props.clip.templateKind}
        disabled={props.disabled}
        onChange={(value) =>
          props.onUpdateAnnotationClipTemplate(props.clip.id, {
            templateKind: value,
          })
        }
        options={getAnnotationTemplateOptions()}
      />
      <AnnotationTemplateMetadata definition={props.definition} />
      {swapStyleActions.length > 0 ? (
        <QuickActionGroup
          disabled={props.disabled}
          label={translate('videoEditor.sidebar.annotationSwapStyleLabel')}
          actions={swapStyleActions}
        />
      ) : null}
      <QuickActionGroup
        disabled={props.disabled}
        label={translate('videoEditor.sidebar.annotationRecommendedDefaultsLabel')}
        actions={recommendedActions}
      />
    </div>
  );
}

function AnnotationTemplateMetadata(props: {
  definition: ReturnType<typeof getVideoOverlayTemplateDefinition>;
}) {
  return (
    <>
      <p className={PANEL_META_CLASS_NAME}>{translate(props.definition.groupLabelKey)}</p>
      <p className={PANEL_META_CLASS_NAME}>{translate(props.definition.useCaseKey)}</p>
      <TemplatePreviewBadges preview={props.definition.preview} />
      <p className={PANEL_META_CLASS_NAME}>
        {translate(getVideoTemplateCatalogStatusLabelKey(props.definition.catalogStatus))} ·{' '}
        {`${props.definition.defaultDurationSeconds.toFixed(1)}s`}
      </p>
      <p className="text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
        {translate(props.definition.descriptionKey)}
      </p>
    </>
  );
}

function createSwapStyleAction(
  props: Parameters<typeof AnnotationTemplateCard>[0],
  templateKind: SelectedAnnotationClip['templateKind']
) {
  const definition = getVideoOverlayTemplateDefinition(templateKind);

  return {
    key: templateKind,
    label: translate(definition.labelKey),
    onClick: () =>
      props.onUpdateAnnotationClipTemplate(props.clip.id, {
        preservePlacementOnTemplateChange: true,
        templateKind,
      }),
  };
}

function createRecommendedActions(
  props: Parameters<typeof AnnotationTemplateCard>[0],
  motionPreset: ReturnType<typeof getAnnotationMotionPreset>
) {
  return [
    {
      key: 'style',
      label: translate('videoEditor.sidebar.annotationResetStyleAction'),
      onClick: () =>
        props.onUpdateAnnotationClipStyle(
          props.clip.id,
          createAnnotationTemplateStyle(props.clip.templateKind)
        ),
    },
    {
      key: 'motion',
      label: translate('videoEditor.sidebar.annotationResetMotionAction'),
      onClick: () =>
        props.onUpdateAnnotationClipTemplate(props.clip.id, {
          direction: motionPreset.direction,
          intensity: motionPreset.intensity,
          introAnimation: motionPreset.introAnimation,
          outroAnimation: motionPreset.outroAnimation,
        }),
    },
    {
      key: 'timing',
      label: translate('videoEditor.sidebar.annotationResetTimingAction'),
      onClick: () =>
        props.onUpdateAnnotationClipTemplate(props.clip.id, {
          introDurationMs: motionPreset.introDurationMs,
          outroDurationMs: motionPreset.outroDurationMs,
        }),
    },
  ];
}

function QuickActionGroup(props: {
  actions: Array<{ key: string; label: string; onClick: () => void }>;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className={PANEL_META_CLASS_NAME}>{props.label}</p>
      <div className="flex flex-wrap gap-2">
        {props.actions.map((action) => (
          <ProductActionButton
            key={action.key}
            compact
            tone="secondary"
            disabled={props.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </ProductActionButton>
        ))}
      </div>
    </div>
  );
}
