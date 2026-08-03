import type { ScenarioImageElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { InspectorNativeSelect } from '../fields';
import type { ScenarioInspectorElementPatch } from '../types';

export function ImageElementFields(props: {
  element: ScenarioImageElement;
  onChange: (patch: ScenarioInspectorElementPatch) => void;
  onEditImageElement?: (elementId: string) => void;
}) {
  return (
    <>
      <ImageFitField element={props.element} onChange={props.onChange} />
      <ImageElementActions
        element={props.element}
        onChange={props.onChange}
        onEditImageElement={props.onEditImageElement}
      />
    </>
  );
}

function ImageFitField(props: {
  element: ScenarioImageElement;
  onChange: (patch: ScenarioInspectorElementPatch) => void;
}) {
  return (
    <InspectorNativeSelect
      label={translate('scenario.editor.imageFit')}
      value={props.element.fit}
      options={[
        { label: translate('scenario.editor.imageFitContain'), value: 'contain' },
        { label: translate('scenario.editor.imageFitCover'), value: 'cover' },
        { label: translate('scenario.editor.imageFitFill'), value: 'fill' },
        { label: translate('scenario.editor.imageFitOriginal'), value: 'original' },
      ]}
      onChange={(fit) => props.onChange({ fit })}
    />
  );
}

function ImageElementActions(props: {
  element: ScenarioImageElement;
  onChange: (patch: ScenarioInspectorElementPatch) => void;
  onEditImageElement: ((elementId: string) => void) | undefined;
}) {
  return (
    <>
      <ProductActionButton
        compact
        tone="secondary"
        onClick={() => props.onChange({ contentTransform: { scale: 1, x: 0, y: 0 } })}
      >
        {translate('scenario.editor.resetContentTransform')}
      </ProductActionButton>
      {props.onEditImageElement ? (
        <ProductActionButton
          compact
          tone="primary"
          onClick={() => props.onEditImageElement?.(props.element.id)}
        >
          {translate('scenario.editor.editImage')}
        </ProductActionButton>
      ) : null}
    </>
  );
}
