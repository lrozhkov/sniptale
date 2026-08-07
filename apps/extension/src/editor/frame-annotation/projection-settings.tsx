import type { FrameAnnotationSnapshotV1 } from '../../features/highlighter/frame-annotation';
import { FutureCalloutSettingsPopover } from '../../composition/frame-annotation-controls/callout/popover';
import { FutureStepBadgeSettingsPopover } from '../../composition/frame-annotation-controls/step-badge/popover';
import {
  FrameAnnotationCreationFramePopover,
  type FrameAnnotationStyleSettings,
} from '../../composition/frame-annotation-controls/frame/popover';
import {
  createDefaultHighlighterSettings,
  DEFAULT_BORDER_PRESET,
} from '../../features/highlighter/style/defaults';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import {
  getFrameCallout,
  removeFrameCallout,
  setFrameCallout,
} from '../../features/highlighter/frame-annotation/callout/collection';

export type ProjectionSettingsMenu = 'callout' | 'effect' | 'step' | null;
export function FrameProjectionSettings(props: {
  activeCalloutIndex: number;
  anchor: HTMLButtonElement | null;
  controlsRoot: HTMLDivElement;
  menu: ProjectionSettingsMenu;
  scene: { borderColor: string; borderWidth: number };
  snapshot: FrameAnnotationSnapshotV1;
  close: () => void;
  onChange: (snapshot: FrameAnnotationSnapshotV1) => void;
  onPreview: (snapshot: FrameAnnotationSnapshotV1) => void;
  onReorder: (direction: 'up' | 'down') => void;
  onDraftCommit: () => void;
}) {
  const activeCallout = getFrameCallout(props.snapshot, props.activeCalloutIndex);
  const closeDraft = () => {
    props.onDraftCommit();
    props.close();
  };
  return (
    <>
      {activeCallout?.enabled ? (
        <FutureCalloutSettingsPopover
          anchorEl={props.anchor}
          headerContext="element"
          isOpen={props.menu === 'callout'}
          onChange={(callout) =>
            props.onPreview(setFrameCallout(props.snapshot, props.activeCalloutIndex, callout))
          }
          onClose={closeDraft}
          onDisable={() => {
            props.onChange(removeFrameCallout(props.snapshot, props.activeCalloutIndex));
            props.close();
          }}
          portalTarget={props.controlsRoot}
          resetKey={`${props.snapshot.id}:${activeCallout.instanceId ?? props.activeCalloutIndex}`}
          settings={activeCallout}
        />
      ) : null}
      <FrameAnnotationCreationFramePopover
        anchorEl={props.anchor}
        headerContext="element"
        isOpen={props.menu === 'effect'}
        onChange={(settings) =>
          props.onPreview({
            ...props.snapshot,
            borderSettings: settings.borderSettings,
            blurSettings: settings.blurSettings,
            effectMode: settings.effectMode,
            focusSettings: settings.focusSettings,
          })
        }
        onClose={closeDraft}
        portalTarget={props.controlsRoot}
        resetKey={props.snapshot.id}
        settings={resolveFrameStyleSettings(props.snapshot)}
      />
      {props.snapshot.stepBadge?.enabled ? (
        <FutureStepBadgeSettingsPopover
          anchorEl={props.anchor}
          frameVisuals={{
            borderColor: props.scene.borderColor,
            borderWidth: props.scene.borderWidth,
            ...(props.snapshot.borderSettings?.fillColor
              ? { fillColor: props.snapshot.borderSettings.fillColor }
              : {}),
            ...(props.snapshot.borderSettings?.fillOpacity === undefined
              ? {}
              : { fillOpacity: props.snapshot.borderSettings.fillOpacity }),
          }}
          headerContext="element"
          isOpen={props.menu === 'step'}
          onChange={(stepBadge) => props.onPreview({ ...props.snapshot, stepBadge })}
          onClose={closeDraft}
          onDisable={() => {
            props.onChange({
              ...props.snapshot,
              stepBadge: { ...props.snapshot.stepBadge!, enabled: false },
            });
            props.close();
          }}
          onReorder={props.onReorder}
          portalTarget={props.controlsRoot}
          resetKey={props.snapshot.id}
          settings={props.snapshot.stepBadge}
        />
      ) : null}
    </>
  );
}

function resolveFrameStyleSettings(
  snapshot: FrameAnnotationSnapshotV1
): FrameAnnotationStyleSettings {
  const defaults = createDefaultHighlighterSettings();
  return {
    blurSettings: snapshot.blurSettings ?? defaults.defaultBlurSettings,
    borderSettings:
      snapshot.borderSettings ?? projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET),
    effectMode: snapshot.effectMode ?? defaults.defaultEffectMode,
    focusSettings: snapshot.focusSettings ?? defaults.defaultFocusSettings,
  };
}
