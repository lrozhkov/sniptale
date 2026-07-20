import { translate } from '../../platform/i18n';
import {
  InspectorColorField,
  InspectorNativeSelect,
  InspectorNumberField,
  InspectorSection,
} from './fields';
import { SCENARIO_INSPECTOR_LIMITS } from './constraints';
import type { ScenarioInspectorProps, ScenarioInspectorSlidePatch } from './types';

type InspectorSlide = NonNullable<ScenarioInspectorProps['slide']>;

export function SlideCanvasFields(props: {
  onUpdateSlide: (patch: ScenarioInspectorSlidePatch) => void;
  slide: InspectorSlide;
}) {
  const background = props.slide.canvas.background;

  return (
    <InspectorSection title={translate('scenario.editor.canvas')}>
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.canvasWidth}
        label={translate('scenario.editor.width')}
        value={props.slide.canvas.width}
        onCommit={(width) => props.onUpdateSlide({ canvas: { width } })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.canvasHeight}
        label={translate('scenario.editor.height')}
        value={props.slide.canvas.height}
        onCommit={(height) => props.onUpdateSlide({ canvas: { height } })}
      />
      <InspectorNativeSelect
        label={translate('scenario.editor.background')}
        options={[
          { label: translate('scenario.editor.backgroundSolid'), value: 'solid' },
          { label: translate('scenario.editor.backgroundTransparent'), value: 'transparent' },
        ]}
        value={background.kind}
        onChange={(kind) => props.onUpdateSlide({ canvas: { background: createBackground(kind) } })}
      />
      {background.kind === 'solid' ? (
        <InspectorColorField
          label={translate('scenario.editor.color')}
          value={background.color}
          onCommit={(color) =>
            props.onUpdateSlide({ canvas: { background: { color, kind: 'solid' } } })
          }
        />
      ) : null}
    </InspectorSection>
  );
}

function createBackground(kind: 'solid' | 'transparent') {
  return kind === 'solid' ? { color: '#ffffff', kind } : { kind };
}
