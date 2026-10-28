import { ChevronDown } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import {
  FrameCommentIcon,
  FrameNumberIcon,
} from '../../features/highlighter/frame-annotation/icons';
import { FrameAnnotationToolbarEffectButton } from '../../features/highlighter/frame-annotation/floating-toolbar';
import type { EffectMode } from '../../features/highlighter/contracts';
import { translate } from '../../platform/i18n';
import type { FrameAnnotationCreationMenu, FrameAnnotationCreationSettings } from './contracts';
import type { FrameAnnotationMenuDirection } from './popover/position';

export type FrameAnnotationMenuDirectionResolver = (
  menu: FrameAnnotationCreationMenu,
  anchor: HTMLElement | null
) => FrameAnnotationMenuDirection | undefined;

function useCreationMenuDirection(
  menu: FrameAnnotationCreationMenu,
  anchorRef: RefObject<HTMLButtonElement | null>,
  resolve: FrameAnnotationMenuDirectionResolver | undefined
) {
  const [direction, setDirection] = useState<FrameAnnotationMenuDirection>();
  useLayoutEffect(() => {
    if (!resolve) return;
    const refresh = () => setDirection(resolve(menu, anchorRef.current));
    const cleanup = bindFloatingInteractionPositionListeners(anchorRef.current, refresh);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
    if (anchorRef.current) {
      observer?.observe(anchorRef.current);
      const toolbar = anchorRef.current.closest('.sniptale-toolbar');
      if (toolbar) observer?.observe(toolbar);
    }
    return () => {
      cleanup?.();
      observer?.disconnect();
    };
  });
  return direction;
}

function CreationAnnotationButton(props: {
  active: boolean;
  standalone?: boolean;
  children: ReactNode;
  dataUi: string;
  disabled?: boolean;
  menuOpen: boolean;
  menuRef: RefObject<HTMLButtonElement | null>;
  menu: FrameAnnotationCreationMenu;
  resolveMenuDirection?: FrameAnnotationMenuDirectionResolver | undefined;
  onMenuClick: () => void;
  onToggle: () => void;
  title: string;
}) {
  const menuSide = useCreationMenuDirection(props.menu, props.menuRef, props.resolveMenuDirection);
  return (
    <div className="sniptale-annotation-menu-control" data-active={props.active ? 'true' : 'false'}>
      <ContentToolbarButton
        tone={props.standalone ? 'default' : 'property'}
        data-content-tool={props.standalone ? 'true' : undefined}
        active={props.active}
        aria-pressed={props.active}
        dataUi={props.dataUi}
        disabled={props.disabled ?? false}
        onClick={(event) => {
          event.stopPropagation();
          props.onToggle();
        }}
        title={props.title}
      >
        {props.children}
      </ContentToolbarButton>
      <ContentToolbarButton
        tone="property"
        ref={props.menuRef}
        aria-expanded={props.menuOpen}
        aria-haspopup="dialog"
        className="sniptale-annotation-properties-arrow sniptale-full-page-chevron"
        data-menu-side={menuSide}
        dataUi={`${props.dataUi}.menu`}
        disabled={props.disabled ?? false}
        onClick={(event) => {
          event.stopPropagation();
          props.onMenuClick();
        }}
        title={props.title}
      >
        <ChevronDown size={12} />
      </ContentToolbarButton>
    </div>
  );
}

export function FrameStyleCreationButton(props: {
  renderControl?: ((control: ReactNode) => ReactNode) | undefined;
  activeMenu: FrameAnnotationCreationMenu | null;
  contentContext: boolean;
  dataUi?: string;
  disabled?: boolean;
  frameActive: boolean;
  frameRef: RefObject<HTMLButtonElement | null>;
  onToggleFrame: () => void;
  onEffectModeChange?: (mode: EffectMode) => void;
  resolveMenuDirection?: FrameAnnotationMenuDirectionResolver | undefined;
  settings: FrameAnnotationCreationSettings;
  toggle: (menu: FrameAnnotationCreationMenu) => void;
}) {
  const dataUi = props.contentContext
    ? 'content.toolbar.future-frame-style'
    : 'frame-annotation.creation.frame';
  const menuSide = useCreationMenuDirection('frame', props.frameRef, props.resolveMenuDirection);
  const control = (
    <div
      className="sniptale-toolbar-subgroup"
      data-ui={
        props.contentContext
          ? 'content.toolbar.future-frame-effects-group'
          : (props.dataUi ?? 'frame-annotation.creation-controls')
      }
    >
      <FrameAnnotationToolbarEffectButton
        contentContext
        active={props.frameActive}
        dataUi={dataUi}
        disabled={props.disabled ?? false}
        menuOpen={props.activeMenu === 'frame'}
        anchorRef={props.frameRef}
        effectMode={props.settings.effectMode}
        menuSide={menuSide}
        onClick={(event) => {
          event.stopPropagation();
          props.toggle('frame');
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onSelect={(mode, event) => {
          event.stopPropagation();
          if (mode === props.settings.effectMode) props.onToggleFrame();
          else {
            props.onEffectModeChange?.(mode);
            if (!props.frameActive) props.onToggleFrame();
          }
        }}
        label={getEffectLabel(props.settings.effectMode)}
      />
    </div>
  );
  return props.renderControl ? props.renderControl(control) : control;
}

export function AnnotationCreationButtons(props: {
  standalone?: boolean;
  calloutActive?: boolean;
  stepBadgeActive?: boolean;
  grouped?: boolean | undefined;
  renderControl?: ((menu: 'callout' | 'step-badge', control: ReactNode) => ReactNode) | undefined;
  activeMenu: FrameAnnotationCreationMenu | null;
  calloutRef: RefObject<HTMLButtonElement | null>;
  contentContext: boolean;
  disabled?: boolean;
  onCalloutMenu: () => void;
  onStepBadgeMenu: () => void;
  onToggleCallout: () => void;
  onToggleStepBadge: () => void;
  resolveMenuDirection?: FrameAnnotationMenuDirectionResolver | undefined;
  settings: FrameAnnotationCreationSettings;
  showCallout: boolean;
  showStepBadge: boolean;
  stepBadgeRef: RefObject<HTMLButtonElement | null>;
}) {
  const calloutActive =
    props.calloutActive ??
    (props.settings.callout !== null && props.settings.callout.enabled !== false);
  const stepBadgeActive =
    props.stepBadgeActive ??
    (props.settings.stepBadge !== null && props.settings.stepBadge.enabled !== false);
  const renderControl = props.renderControl ?? ((_menu, control) => control);
  const buttons = (
    <>
      {props.showCallout
        ? renderControl(
            'callout',
            <CreationAnnotationButton
              active={calloutActive}
              standalone={props.standalone ?? false}
              dataUi={
                props.contentContext
                  ? 'content.toolbar.future-frame-callout'
                  : 'frame-annotation.creation.callout'
              }
              disabled={props.disabled ?? false}
              menuOpen={props.activeMenu === 'callout'}
              menuRef={props.calloutRef}
              menu="callout"
              resolveMenuDirection={props.resolveMenuDirection}
              onMenuClick={props.onCalloutMenu}
              onToggle={props.onToggleCallout}
              title={translate('content.callout.settingsTitle')}
            >
              <FrameCommentIcon size={18} />
            </CreationAnnotationButton>
          )
        : null}
      {props.showStepBadge
        ? renderControl(
            'step-badge',
            <CreationAnnotationButton
              active={stepBadgeActive}
              standalone={props.standalone ?? false}
              dataUi={
                props.contentContext
                  ? 'content.toolbar.future-frame-step-badge'
                  : 'frame-annotation.creation.step-badge'
              }
              disabled={props.disabled ?? false}
              menuOpen={props.activeMenu === 'step-badge'}
              menuRef={props.stepBadgeRef}
              menu="step-badge"
              resolveMenuDirection={props.resolveMenuDirection}
              onMenuClick={props.onStepBadgeMenu}
              onToggle={props.onToggleStepBadge}
              title={translate('content.stepBadge.settingsTitle')}
            >
              <FrameNumberIcon size={18} />
            </CreationAnnotationButton>
          )
        : null}
    </>
  );
  return props.grouped === false ? (
    buttons
  ) : (
    <div
      className="sniptale-toolbar-subgroup sniptale-toolbar-annotation-group"
      data-ui={
        props.contentContext
          ? 'content.toolbar.future-frame-annotations-group'
          : 'frame-annotation.creation-annotations'
      }
    >
      {buttons}
    </div>
  );
}

function getEffectLabel(mode: EffectMode): string {
  if (mode === 'border') return translate('content.interactiveFrame.effectBorder');
  if (mode === 'blur') return translate('content.interactiveFrame.effectBlur');
  return translate('content.interactiveFrame.effectFocus');
}
