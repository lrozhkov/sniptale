import { translate } from '../../../../../platform/i18n';
import type { DesignReviewActions, DesignReviewViewState } from '../../types';
import {
  LinkedSideFields,
  SIDE_ORDER,
  createBorderSideProperty,
  createRadiusProperty,
} from '../side-fields';

type BorderSectionProps = {
  actions: DesignReviewActions;
  disabled: boolean;
  state: DesignReviewViewState;
};

const BORDER_GROUPS = [
  {
    key: 'width',
    labelKey: 'content.designReview.borderWidth',
    properties: SIDE_ORDER.map((side) => createBorderSideProperty(side, 'width')),
  },
  {
    key: 'style',
    labelKey: 'content.designReview.borderStyle',
    properties: SIDE_ORDER.map((side) => createBorderSideProperty(side, 'style')),
  },
  {
    key: 'color',
    labelKey: 'content.designReview.borderColor',
    properties: SIDE_ORDER.map((side) => createBorderSideProperty(side, 'color')),
  },
  {
    key: 'radius',
    labelKey: 'content.designReview.borderRadius',
    properties: SIDE_ORDER.map(createRadiusProperty),
  },
] as const;

export function BorderSection({ actions, disabled, state }: BorderSectionProps) {
  return (
    <div className="grid gap-2" data-ui="content.design-review.settings-border">
      {BORDER_GROUPS.map((group) => (
        <LinkedSideFields
          key={group.key}
          disabled={disabled}
          label={translate(group.labelKey)}
          properties={[...group.properties]}
          state={state}
          onChange={actions.updateValue}
          onChangeMany={actions.updateValues}
          onLinkedChange={actions.setSideFieldLinked}
        />
      ))}
    </div>
  );
}
