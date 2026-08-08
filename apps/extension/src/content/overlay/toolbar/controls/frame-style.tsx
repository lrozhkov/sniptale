import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  FrameAnnotationCreationControls,
  type FrameAnnotationCreationMenu,
  type FrameAnnotationCreationSettings,
} from '../../../../composition/frame-annotation-controls/creation-controls';
import type { EffectMode } from '../../../../features/highlighter/contracts';
import { FrameSettingsPopover } from '../../../selection/frame-settings-popover';
import type {
  ToolbarFutureFrameCalloutActions,
  ToolbarFutureFrameStepBadgeActions,
  ToolbarFutureFrameStyle,
} from '../types';
import type { ToolbarMenuState, ToolbarPopoverMenu } from '../state/menu';
import { resolveContentPortalTarget } from '../../../selection/interactive-frame/layout/portal';
import { setFrameSessionBorderPreset } from '../../../selection/frame-runtime/session/border-preset';
import {
  getAnnotationTemplateSources,
  setAnnotationTemplateSource,
  subscribeAnnotationTemplateSources,
} from '../../../selection/frame-runtime/session/annotation-template-source';
import {
  addFutureFrameDefaultsChangedListener,
  dispatchFutureFrameDefaultsChanged,
  type FutureFrameDefaultsChangedDetail,
} from '../../../platform/page-context/frame-events';
import {
  applyAnnotationForkDrafts,
  loadAnnotationForkDrafts,
  persistAnnotationForkDrafts,
  selectAnnotationForkDrafts,
} from './annotation-fork-session';

const FUTURE_FRAME_ID = 'future-frame-style';
const EMPTY_FRAME_RECT = { x: 0, y: 0, width: 0, height: 0 };

export function FutureFrameStyleControls(props: {
  compactMenus?: boolean;
  futureFrameStyle: ToolbarFutureFrameStyle;
  onFutureFrameEffectModeChange: (mode: EffectMode) => void;
  futureFrameCalloutActions?: ToolbarFutureFrameCalloutActions;
  futureFrameStepBadgeActions?: ToolbarFutureFrameStepBadgeActions;
  toolbarMenuState: ToolbarMenuState;
}) {
  const [style, setStyle] = useState(props.futureFrameStyle);
  const [forkDraftsHydrated, setForkDraftsHydrated] = useState(false);
  const activeForkDraftsRef = useRef<ReturnType<typeof selectAnnotationForkDrafts>>({});
  const localForkRevisionRef = useRef(0);
  const skipHydrationPersistenceRef = useRef(true);
  const templateSources = useSyncExternalStore(
    subscribeAnnotationTemplateSources,
    getAnnotationTemplateSources,
    getAnnotationTemplateSources
  );

  useEffect(
    () => setStyle(applyAnnotationForkDrafts(props.futureFrameStyle, activeForkDraftsRef.current)),
    [props.futureFrameStyle]
  );
  useEffect(
    () =>
      addFutureFrameDefaultsChangedListener((detail) => {
        localForkRevisionRef.current += 1;
        setStyle((current) => {
          const next = applyFutureFrameDefaultsToToolbarStyle(current, detail);
          activeForkDraftsRef.current = selectAnnotationForkDrafts(next);
          return next;
        });
      }),
    []
  );
  useEffect(() => {
    let active = true;
    const hydrationRevision = localForkRevisionRef.current;
    void loadAnnotationForkDrafts().then((drafts) => {
      if (!active) return;
      if (localForkRevisionRef.current !== hydrationRevision) {
        skipHydrationPersistenceRef.current = false;
        setForkDraftsHydrated(true);
        return;
      }
      activeForkDraftsRef.current = drafts;
      setStyle((current) => applyAnnotationForkDrafts(current, drafts));
      if (drafts.frame) {
        dispatchFutureFrameDefaultsChanged({ kind: 'frame', settings: drafts.frame });
      }
      if (drafts.callout) {
        dispatchFutureFrameDefaultsChanged({ kind: 'callout', settings: drafts.callout });
      }
      if (drafts.stepBadge) {
        dispatchFutureFrameDefaultsChanged({ kind: 'stepBadge', settings: drafts.stepBadge });
      }
      setForkDraftsHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!forkDraftsHydrated) return;
    if (skipHydrationPersistenceRef.current) {
      skipHydrationPersistenceRef.current = false;
      return;
    }
    void persistAnnotationForkDrafts(selectAnnotationForkDrafts(style));
  }, [forkDraftsHydrated, style]);

  const creationSettings = toCreationSettings(style);
  return (
    <FrameAnnotationCreationControls
      activeMenu={toCreationMenu(props.toolbarMenuState.activeMenuType)}
      context="content"
      calloutTemplateSourceControl={{
        onChange: (source) => setAnnotationTemplateSource('callout', source),
        value: templateSources.callout,
      }}
      {...(props.futureFrameCalloutActions
        ? { enableCallout: props.futureFrameCalloutActions.enable }
        : {})}
      {...(props.futureFrameStepBadgeActions
        ? { enableStepBadge: props.futureFrameStepBadgeActions.enable }
        : {})}
      onChange={(next) => {
        const previous = style;
        const nextStyle = fromCreationSettings(next);
        localForkRevisionRef.current += 1;
        activeForkDraftsRef.current = selectAnnotationForkDrafts(nextStyle);
        setStyle(nextStyle);
        if (next.effectMode !== previous.effectMode) {
          props.onFutureFrameEffectModeChange(next.effectMode);
        }
        if (next.borderSettings !== previous.borderSettings) {
          setFrameSessionBorderPreset(next.borderSettings);
        }
        if (next.callout !== previous.futureCallout) {
          props.futureFrameCalloutActions?.set(next.callout);
        }
        if (next.stepBadge !== previous.futureStepBadge) {
          props.futureFrameStepBadgeActions?.set(next.stepBadge);
        }
      }}
      onMenuChange={(menu) => props.toolbarMenuState.setActiveMenuType(toToolbarMenu(menu))}
      portalTarget={resolveContentPortalTarget()}
      stepBadgeTemplateSourceControl={{
        onChange: (source) => setAnnotationTemplateSource('stepBadge', source),
        value: templateSources.stepBadge,
      }}
      renderFramePopover={(popover) => (
        <FrameSettingsPopover
          anchorEl={popover.anchorEl}
          blurSettings={popover.settings.blurSettings}
          borderSettings={popover.settings.borderSettings}
          compact={props.compactMenus ?? false}
          effectMode={popover.settings.effectMode}
          focusSettings={popover.settings.focusSettings}
          frameId={FUTURE_FRAME_ID}
          frameRect={EMPTY_FRAME_RECT}
          isOpen={popover.isOpen}
          onApplyToFrame={(patch) => popover.onChange({ ...popover.settings, ...patch })}
          onClose={popover.onClose}
          onEffectModeChange={(effectMode) => popover.onChange({ ...popover.settings, effectMode })}
          scope="session"
        />
      )}
      settings={creationSettings}
      showCallout={props.futureFrameCalloutActions !== undefined}
      showStepBadge={props.futureFrameStepBadgeActions !== undefined}
    />
  );
}

function applyFutureFrameDefaultsToToolbarStyle(
  current: ToolbarFutureFrameStyle,
  detail: FutureFrameDefaultsChangedDetail
): ToolbarFutureFrameStyle {
  if (detail.kind === 'frame') {
    return { ...current, ...detail.settings };
  }
  if (detail.kind === 'callout') {
    return { ...current, futureCallout: structuredClone(detail.settings) };
  }
  return { ...current, futureStepBadge: structuredClone(detail.settings) };
}

function toCreationSettings(style: ToolbarFutureFrameStyle): FrameAnnotationCreationSettings {
  return {
    blurSettings: style.blurSettings,
    borderSettings: style.borderSettings,
    effectMode: style.effectMode,
    focusSettings: style.focusSettings,
    callout: style.futureCallout ?? null,
    stepBadge: style.futureStepBadge ?? null,
  };
}

function fromCreationSettings(settings: FrameAnnotationCreationSettings): ToolbarFutureFrameStyle {
  return {
    blurSettings: settings.blurSettings,
    borderSettings: settings.borderSettings,
    effectMode: settings.effectMode,
    focusSettings: settings.focusSettings,
    futureCallout: settings.callout,
    futureStepBadge: settings.stepBadge,
  };
}

function toCreationMenu(menu: ToolbarPopoverMenu | null): FrameAnnotationCreationMenu | null {
  if (menu === 'frame-style') return 'frame';
  if (menu === 'future-callout') return 'callout';
  if (menu === 'future-step-badge') return 'step-badge';
  return null;
}

function toToolbarMenu(menu: FrameAnnotationCreationMenu | null): ToolbarPopoverMenu | null {
  if (menu === 'frame') return 'frame-style';
  if (menu === 'callout') return 'future-callout';
  if (menu === 'step-badge') return 'future-step-badge';
  return null;
}
