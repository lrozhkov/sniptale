import { useState } from 'react';
import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { propertyModified, propertyValue } from '../value-editing/values';

export type SideAxis = 'horizontal' | 'vertical';

export const AXIS_SIDE_INDEXES = {
  horizontal: [3, 1],
  vertical: [0, 2],
} as const satisfies Record<SideAxis, readonly [number, number]>;

type SideFieldLinkingProps = {
  linked?: boolean | undefined;
  onChange: DesignReviewActions['updateValue'];
  onChangeMany?: DesignReviewActions['updateValues'];
  onLinkedChange?: ((fieldKey: string, linked: boolean) => void) | undefined;
  properties: PageStyleProperty[];
  state: DesignReviewViewState;
};

function updateProperties(
  props: Pick<SideFieldLinkingProps, 'onChange' | 'onChangeMany'> & {
    properties: PageStyleProperty[];
    value: string;
  }
) {
  if (props.onChangeMany) {
    props.onChangeMany(props.properties.map((property) => ({ property, value: props.value })));
    return;
  }
  for (const property of props.properties) props.onChange(property, props.value);
}

function valuesAreEqual(
  props: Pick<SideFieldLinkingProps, 'properties' | 'state'>,
  indexes: readonly number[]
) {
  const values = indexes.map((index) => {
    const property = props.properties[index] as PageStyleProperty;
    return propertyValue(props.state, property) || props.state.defaultValues[property] || '';
  });
  return new Set(values.map((value) => value.trim())).size <= 1;
}

function createModel(props: SideFieldLinkingProps) {
  const fieldKey = props.properties.join('|');
  const explicitLinkState = props.linked ?? props.state.sideFieldLinks?.[fieldKey];
  return {
    fieldKey,
    firstValue: propertyValue(props.state, props.properties[0] as PageStyleProperty),
    linked: explicitLinkState ?? valuesAreEqual(props, [0, 1, 2, 3]),
    modifiedCount: props.properties.filter((property) => propertyModified(props.state, property))
      .length,
  };
}

function updateIndexes(props: SideFieldLinkingProps, indexes: readonly number[], value: string) {
  const properties = indexes.map((index) => props.properties[index] as PageStyleProperty);
  updateProperties({ ...props, properties, value });
}

export function useSideFieldLinking(props: SideFieldLinkingProps) {
  const model = createModel(props);
  const [axisLinked, setAxisLinked] = useState<Record<SideAxis, boolean>>(() => ({
    horizontal: valuesAreEqual(props, AXIS_SIDE_INDEXES.horizontal),
    vertical: valuesAreEqual(props, AXIS_SIDE_INDEXES.vertical),
  }));

  const updateSide = (index: number, value: string) => {
    if (model.linked) {
      updateProperties({ ...props, value });
      return;
    }
    const axis: SideAxis = index === 0 || index === 2 ? 'vertical' : 'horizontal';
    updateIndexes(props, axisLinked[axis] ? AXIS_SIDE_INDEXES[axis] : [index], value);
  };

  const toggleAll = () => {
    if (!model.linked) {
      updateProperties({ ...props, value: model.firstValue });
      setAxisLinked({ horizontal: true, vertical: true });
    }
    props.onLinkedChange?.(model.fieldKey, !model.linked);
  };

  const toggleAxis = (axis: SideAxis) => {
    const linked = model.linked || axisLinked[axis];
    if (!linked) {
      const [sourceIndex] = AXIS_SIDE_INDEXES[axis];
      const sourceProperty = props.properties[sourceIndex] as PageStyleProperty;
      updateIndexes(props, AXIS_SIDE_INDEXES[axis], propertyValue(props.state, sourceProperty));
    }
    if (model.linked) props.onLinkedChange?.(model.fieldKey, false);
    setAxisLinked((current) => ({ ...current, [axis]: !linked }));
  };

  return { axisLinked, model, toggleAll, toggleAxis, updateSide };
}
