import {
  SCENARIO_BACKGROUND_TRANSITIONS,
  SCENARIO_PRESENTATION_THEMES,
  SCENARIO_SLIDE_LAYOUTS,
  SCENARIO_SLIDE_TRANSITIONS,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../platform/i18n';
import {
  InspectorBooleanField,
  InspectorNativeSelect,
  InspectorNumberField,
  InspectorSection,
} from './fields';
import { SCENARIO_INSPECTOR_LIMITS } from './constraints';
import {
  getBackgroundTransitionLabelKey,
  getPresentationThemeLabelKey,
  getSlideLayoutLabelKey,
  getSlideTransitionLabelKey,
} from './labels';
import type { ScenarioInspectorProjectPresentationPatch, ScenarioInspectorProps } from './types';

export function ProjectPresentationFields(props: {
  onUpdatePresentation: (patch: ScenarioInspectorProjectPresentationPatch) => void;
  presentation: NonNullable<ScenarioInspectorProps['presentation']>;
}) {
  return (
    <InspectorSection title={translate('scenario.editor.defaultPresentation')}>
      <InspectorNativeSelect
        label={translate('scenario.editor.theme')}
        options={Object.values(SCENARIO_PRESENTATION_THEMES).map((value) => ({
          label: translate(getPresentationThemeLabelKey(value)),
          value,
        }))}
        value={props.presentation.themeId}
        onChange={(themeId) => props.onUpdatePresentation({ themeId })}
      />
      <InspectorNativeSelect
        label={translate('scenario.editor.defaultLayout')}
        options={createLayoutOptions()}
        value={props.presentation.defaultLayoutId}
        onChange={(defaultLayoutId) => props.onUpdatePresentation({ defaultLayoutId })}
      />
      <DefaultTransitionFields {...props} />
      <DefaultPlaybackFields {...props} />
      <DefaultGridFields {...props} />
    </InspectorSection>
  );
}

function DefaultTransitionFields(props: {
  onUpdatePresentation: (patch: ScenarioInspectorProjectPresentationPatch) => void;
  presentation: NonNullable<ScenarioInspectorProps['presentation']>;
}) {
  return (
    <>
      <InspectorNativeSelect
        label={translate('scenario.editor.transition')}
        options={createTransitionOptions()}
        value={props.presentation.transition.kind}
        onChange={(kind) =>
          props.onUpdatePresentation({ transition: { durationMs: 420, easing: 'ease', kind } })
        }
      />
      <InspectorNativeSelect
        label={translate('scenario.editor.backgroundTransition')}
        options={createBackgroundTransitionOptions()}
        value={props.presentation.backgroundTransition.kind}
        onChange={(kind) =>
          props.onUpdatePresentation({
            backgroundTransition: { durationMs: 420, easing: 'ease', kind },
          })
        }
      />
    </>
  );
}

function DefaultPlaybackFields(props: {
  onUpdatePresentation: (patch: ScenarioInspectorProjectPresentationPatch) => void;
  presentation: NonNullable<ScenarioInspectorProps['presentation']>;
}) {
  return (
    <>
      <InspectorBooleanField
        label={translate('scenario.editor.showPlayControls')}
        value={props.presentation.controls.showControls}
        onChange={(showControls) => props.onUpdatePresentation({ controls: { showControls } })}
      />
      <InspectorBooleanField
        label={translate('scenario.editor.showProgress')}
        value={props.presentation.controls.showProgress}
        onChange={(showProgress) => props.onUpdatePresentation({ controls: { showProgress } })}
      />
      <InspectorBooleanField
        label={translate('scenario.editor.loopPlayback')}
        value={props.presentation.controls.loop}
        onChange={(loop) => props.onUpdatePresentation({ controls: { loop } })}
      />
    </>
  );
}

function DefaultGridFields(props: {
  onUpdatePresentation: (patch: ScenarioInspectorProjectPresentationPatch) => void;
  presentation: NonNullable<ScenarioInspectorProps['presentation']>;
}) {
  return (
    <>
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.gridColumns}
        label={translate('scenario.editor.gridColumns')}
        value={props.presentation.grid.columns}
        onCommit={(columns) => props.onUpdatePresentation({ grid: { columns } })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.gridRows}
        label={translate('scenario.editor.gridRows')}
        value={props.presentation.grid.rows}
        onCommit={(rows) => props.onUpdatePresentation({ grid: { rows } })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.gridGutter}
        label={translate('scenario.editor.gridGutter')}
        value={props.presentation.grid.gutter}
        onCommit={(gutter) => props.onUpdatePresentation({ grid: { gutter } })}
      />
      <InspectorNumberField
        constraint={SCENARIO_INSPECTOR_LIMITS.gridMargin}
        label={translate('scenario.editor.gridMargin')}
        value={props.presentation.grid.margin}
        onCommit={(margin) => props.onUpdatePresentation({ grid: { margin } })}
      />
    </>
  );
}

function createLayoutOptions() {
  return Object.values(SCENARIO_SLIDE_LAYOUTS).map((value) => ({
    label: translate(getSlideLayoutLabelKey(value)),
    value,
  }));
}

function createTransitionOptions() {
  return Object.values(SCENARIO_SLIDE_TRANSITIONS).map((value) => ({
    label: translate(getSlideTransitionLabelKey(value)),
    value,
  }));
}

function createBackgroundTransitionOptions() {
  return Object.values(SCENARIO_BACKGROUND_TRANSITIONS).map((value) => ({
    label: translate(getBackgroundTransitionLabelKey(value)),
    value,
  }));
}

export function createInspectorLayoutOptions() {
  return createLayoutOptions();
}

export function createInspectorTransitionOptions() {
  return createTransitionOptions();
}

export function createInspectorBackgroundTransitionOptions() {
  return createBackgroundTransitionOptions();
}
