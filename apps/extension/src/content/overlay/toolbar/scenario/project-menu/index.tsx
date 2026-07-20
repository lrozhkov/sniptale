import type { CSSProperties, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Presentation } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductToolbarMenu } from '@sniptale/ui/product-menus/toolbar';
import type { ToolbarProps } from '../../types';
import type { ToolbarMenuState } from '../../state/menu';
import { resolveContentPortalTarget } from '../../../../selection/interactive-frame/layout/portal';
import { useScenarioProjectMenuDismissal, useScenarioProjectMenuStyle } from './helpers';
import { ScenarioProjectMenuCurrentProject, ScenarioProjectMenuPicker } from './parts';

type ScenarioToolbarProps = NonNullable<ToolbarProps['scenario']>;
type ToolbarScenarioProjectMenuProps = {
  displayMode: 'horizontal' | 'vertical';
  scenario: ScenarioToolbarProps;
  toolbarMenuState: ToolbarMenuState;
};

function ScenarioProjectMenuBody(props: { onClose: () => void; scenario: ScenarioToolbarProps }) {
  const [projectQuery, setProjectQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isSelectingProject, setIsSelectingProject] = useState(false);

  useEffect(() => {
    if (!props.scenario.pendingProjectSelection) {
      setProjectQuery('');
    }
  }, [props.scenario.pendingProjectSelection]);

  return (
    <div className="grid gap-3 p-3">
      <ScenarioProjectMenuCurrentProject projectName={props.scenario.projectName} />
      <ScenarioProjectMenuPicker
        isCreating={isCreating}
        isSelectingProject={isSelectingProject}
        onClose={props.onClose}
        onProjectQueryChange={setProjectQuery}
        projectQuery={projectQuery}
        setIsCreating={setIsCreating}
        setIsSelectingProject={setIsSelectingProject}
        scenario={props.scenario}
      />
    </div>
  );
}

function ScenarioProjectMenuPortal(props: {
  menuRef: RefObject<HTMLDivElement | null>;
  menuStyle: CSSProperties;
  onClose: () => void;
  scenario: ScenarioToolbarProps;
  triggerEl: HTMLButtonElement | null;
}) {
  return createPortal(
    <div
      ref={props.menuRef}
      data-ui="content.toolbar.scenario-project-menu"
      style={{ ...props.menuStyle, pointerEvents: 'auto' }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <ProductToolbarMenu
        title={translate('scenario.content.projectMenuTitle')}
        variant="capture"
        style={{
          position: 'static',
          top: 'auto',
          left: 'auto',
          minWidth: '100%',
          width: '100%',
          zIndex: 'auto',
        }}
      >
        <ScenarioProjectMenuBody scenario={props.scenario} onClose={props.onClose} />
      </ProductToolbarMenu>
    </div>,
    resolveContentPortalTarget(props.triggerEl)
  );
}

export function ToolbarScenarioProjectMenu(props: ToolbarScenarioProjectMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { setActiveMenuType } = props.toolbarMenuState;
  const projectMenuOpen = props.toolbarMenuState.activeMenuType === 'scenario-project';
  const menuStyle = useScenarioProjectMenuStyle({
    anchorEl: triggerRef.current,
    displayMode: props.displayMode,
    isOpen: projectMenuOpen,
    sidebarVisible: props.scenario.sidebarVisible,
  });

  useScenarioProjectMenuDismissal({
    isOpen: projectMenuOpen,
    menuRef,
    triggerRef,
    onClose: () => props.toolbarMenuState.closeMenu('scenario-project'),
  });

  useEffect(() => {
    if (props.scenario.pendingProjectSelection) {
      setActiveMenuType('scenario-project');
    }
  }, [props.scenario.pendingProjectSelection, setActiveMenuType]);

  return renderScenarioProjectMenu({
    menuRef,
    menuStyle,
    projectMenuOpen,
    scenario: props.scenario,
    toolbarMenuState: props.toolbarMenuState,
    triggerRef,
  });
}

function renderScenarioProjectMenu(args: {
  menuRef: RefObject<HTMLDivElement | null>;
  menuStyle: CSSProperties | null;
  projectMenuOpen: boolean;
  scenario: ScenarioToolbarProps;
  toolbarMenuState: ToolbarMenuState;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const buttonTitle = args.scenario.projectName
    ? `${translate('scenario.content.project')}: ${args.scenario.projectName}`
    : translate('scenario.content.project');

  return (
    <>
      <ContentToolbarButton
        ref={args.triggerRef}
        active={
          args.projectMenuOpen ||
          Boolean(args.scenario.projectId) ||
          args.scenario.pendingProjectSelection
        }
        onClick={(event) => {
          event.stopPropagation();
          args.toolbarMenuState.toggleMenu('scenario-project');
        }}
        title={buttonTitle}
        dataUi="content.toolbar.scenario-project-button"
        menuIndicator
        aria-label={translate('scenario.content.project')}
        aria-haspopup="menu"
        aria-expanded={args.projectMenuOpen}
      >
        <Presentation className="h-[18px] w-[18px]" />
      </ContentToolbarButton>

      {args.projectMenuOpen && args.menuStyle ? (
        <ScenarioProjectMenuPortal
          menuRef={args.menuRef}
          menuStyle={args.menuStyle}
          onClose={() => args.toolbarMenuState.closeMenu('scenario-project')}
          scenario={args.scenario}
          triggerEl={args.triggerRef.current}
        />
      ) : null}
    </>
  );
}
