import { translate } from '../../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  getCompatibleVideoTransitionTemplateKinds,
  getVideoTransitionTemplateDefinition,
} from '../../../../../../features/video/project/transition/template';
import type { VideoProjectTransition } from '../../../../../../features/video/project/types';
import { PANEL_META_CLASS_NAME } from '../../shared/panel';

type TransitionQuickAction = {
  key: string;
  label: string;
  onClick: () => void;
};

export function TransitionTemplateActions(props: {
  transition: VideoProjectTransition;
  onUpdateTransitionDuration: (transitionId: string, duration: number) => void;
  onUpdateTransitionTemplate: (
    transitionId: string,
    patch: Partial<
      Pick<VideoProjectTransition, 'direction' | 'highlightColor' | 'intensity' | 'templateKind'>
    >
  ) => void;
}) {
  const templateKind = props.transition.templateKind ?? props.transition.kind;
  const definition = getVideoTransitionTemplateDefinition(templateKind);
  const swapStyleActions = getCompatibleVideoTransitionTemplateKinds(templateKind).map(
    (candidateKind) =>
      createSwapStyleAction(props.transition.id, candidateKind, props.onUpdateTransitionTemplate)
  );
  const recommendedActions = createRecommendedActions(
    props.transition.id,
    definition,
    props.onUpdateTransitionDuration,
    props.onUpdateTransitionTemplate
  );

  return (
    <>
      {swapStyleActions.length > 0 ? (
        <QuickActionGroup
          label={translate('videoEditor.sidebar.transitionSwapStyleLabel')}
          actions={swapStyleActions}
        />
      ) : null}
      <QuickActionGroup
        label={translate('videoEditor.sidebar.transitionRecommendedDefaultsLabel')}
        actions={recommendedActions}
      />
    </>
  );
}

function createSwapStyleAction(
  transitionId: string,
  templateKind: ReturnType<typeof getCompatibleVideoTransitionTemplateKinds>[number],
  onUpdateTransitionTemplate: TransitionTemplateActionsProps['onUpdateTransitionTemplate']
): TransitionQuickAction {
  const definition = getVideoTransitionTemplateDefinition(templateKind);

  return {
    key: templateKind,
    label: translate(definition.labelKey),
    onClick: () =>
      onUpdateTransitionTemplate(transitionId, {
        templateKind,
      }),
  };
}

type TransitionTemplateActionsProps = Parameters<typeof TransitionTemplateActions>[0];

function createRecommendedActions(
  transitionId: string,
  definition: ReturnType<typeof getVideoTransitionTemplateDefinition>,
  onUpdateTransitionDuration: TransitionTemplateActionsProps['onUpdateTransitionDuration'],
  onUpdateTransitionTemplate: TransitionTemplateActionsProps['onUpdateTransitionTemplate']
): TransitionQuickAction[] {
  return [
    {
      key: 'style',
      label: translate('videoEditor.sidebar.transitionResetStyleAction'),
      onClick: () =>
        onUpdateTransitionTemplate(transitionId, {
          direction: definition.defaultDirection,
          highlightColor: definition.defaultHighlightColor,
          intensity: definition.defaultIntensity,
        }),
    },
    {
      key: 'timing',
      label: translate('videoEditor.sidebar.transitionResetTimingAction'),
      onClick: () => onUpdateTransitionDuration(transitionId, definition.defaultDurationSeconds),
    },
  ];
}

function QuickActionGroup(props: { actions: TransitionQuickAction[]; label: string }) {
  return (
    <div className="space-y-1.5">
      <p className={PANEL_META_CLASS_NAME}>{props.label}</p>
      <div className="flex flex-wrap gap-2">
        {props.actions.map((action) => (
          <ProductActionButton key={action.key} compact tone="secondary" onClick={action.onClick}>
            {action.label}
          </ProductActionButton>
        ))}
      </div>
    </div>
  );
}
