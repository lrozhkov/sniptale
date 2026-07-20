import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { applyPageStylePatchWithHistory } from '../runtime/actions';
import type {
  PageStyleDeclarationValueMap,
  PageStyleSelectionSnapshot,
} from '../runtime/properties';
import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleInspectorActions } from '../types';
import { normalizeInspectorValue } from './state';

const BORDER_VISIBLE_STYLE = 'solid';

function resolveBorderCompanionStyleProperty(
  property: PageStyleProperty
): PageStyleProperty | null {
  const match = property.match(/^border-(top|right|bottom|left)-(width|color)$/);
  return match?.[1] ? (`border-${match[1]}-style` as PageStyleProperty) : null;
}

function shouldSetVisibleBorderStyle(defaultValue: string | undefined): boolean {
  const normalized = normalizeInspectorValue(defaultValue).toLowerCase();
  return !normalized || normalized === 'none';
}

function createBorderCompanionUpdates(
  defaultValues: PageStyleDeclarationValueMap,
  updates: Array<{ property: PageStyleProperty; value: string }>
): Array<{ property: PageStyleProperty; value: string }> {
  const companionUpdates: Array<{ property: PageStyleProperty; value: string }> = [];
  const updatedProperties = new Set(updates.map((update) => update.property));

  for (const update of updates) {
    if (!normalizeInspectorValue(update.value)) {
      continue;
    }

    const styleProperty = resolveBorderCompanionStyleProperty(update.property);
    if (
      styleProperty &&
      !updatedProperties.has(styleProperty) &&
      shouldSetVisibleBorderStyle(defaultValues[styleProperty])
    ) {
      companionUpdates.push({ property: styleProperty, value: BORDER_VISIBLE_STYLE });
      updatedProperties.add(styleProperty);
    }
  }

  return companionUpdates;
}

function updateLocalValues(
  setValues: Dispatch<SetStateAction<PageStyleDeclarationValueMap>>,
  updates: Array<{ property: PageStyleProperty; value: string }>
) {
  setValues((current) => ({
    ...current,
    ...Object.fromEntries(updates.map((update) => [update.property, update.value])),
  }));
}

function createSingleValueDeclarations(args: {
  defaultValues: PageStyleDeclarationValueMap;
  property: PageStyleProperty;
  updates: Array<{ property: PageStyleProperty; value: string }>;
  value: string;
}) {
  const defaultValue = args.defaultValues[args.property] ?? '';
  const patchValue =
    normalizeInspectorValue(args.value) === normalizeInspectorValue(defaultValue)
      ? null
      : args.value.trim() || null;

  return [
    { property: args.property, value: patchValue },
    ...args.updates
      .filter((update) => update.property !== args.property)
      .map((update) => ({ property: update.property, value: update.value })),
  ];
}

function createPatchDeclarations(
  defaultValues: PageStyleDeclarationValueMap,
  updates: Array<{ property: PageStyleProperty; value: string }>
) {
  return updates.map((update) => {
    const defaultValue = defaultValues[update.property] ?? '';
    const patchValue =
      normalizeInspectorValue(update.value) === normalizeInspectorValue(defaultValue)
        ? null
        : update.value.trim() || null;

    return { property: update.property, value: patchValue };
  });
}

function applyValueUpdates(args: {
  declarations: ReturnType<typeof createPatchDeclarations>;
  selection: PageStyleSelectionSnapshot;
}) {
  void applyPageStylePatchWithHistory({
    element: args.selection.element,
    patch: {
      assets: [],
      declarations: args.declarations,
    },
    selector: args.selection.selector,
  });
}

export function usePageStyleValueActions(args: {
  defaultValues: PageStyleDeclarationValueMap;
  selection: PageStyleSelectionSnapshot | null;
  setValues: Dispatch<SetStateAction<PageStyleDeclarationValueMap>>;
}) {
  const { defaultValues, selection, setValues } = args;
  const updateValue = useCallback<PageStyleInspectorActions['updateValue']>(
    (property, value) => {
      if (!selection) {
        return;
      }

      const updates = [
        { property, value },
        ...createBorderCompanionUpdates(defaultValues, [{ property, value }]),
      ];

      updateLocalValues(setValues, updates);
      applyValueUpdates({
        declarations: createSingleValueDeclarations({ defaultValues, property, updates, value }),
        selection,
      });
    },
    [defaultValues, selection, setValues]
  );

  const updateValues = useCallback<PageStyleInspectorActions['updateValues']>(
    (updates) => {
      if (!selection || updates.length === 0) {
        return;
      }

      const expandedUpdates = [...updates, ...createBorderCompanionUpdates(defaultValues, updates)];

      updateLocalValues(setValues, expandedUpdates);
      applyValueUpdates({
        declarations: createPatchDeclarations(defaultValues, expandedUpdates),
        selection,
      });
    },
    [defaultValues, selection, setValues]
  );

  const resetValue = useCallback<PageStyleInspectorActions['resetValue']>(
    (property) => updateValue(property, defaultValues[property] ?? ''),
    [defaultValues, updateValue]
  );

  return { resetValue, updateValue, updateValues };
}
