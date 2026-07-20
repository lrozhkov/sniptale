import type React from 'react';
import {
  ContentToolbarButton,
  ContentToolbarDivider,
  ContentToolbarGroup,
  ContentToolbarShell,
} from '@sniptale/ui/content-toolbar';
import { FloatingChromePanel, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import type { EditorToolbarSelectionState } from '../toolbar/types';
import { type FloatingToolbarGroup } from './canvas-toolbar-groups';
import { useCanvasSelectionToolbarGeometry } from './canvas-toolbar-geometry';
import {
  type CanvasToolbarPopoverPlacement,
  useCanvasToolbarGroups,
  useCanvasToolbarState,
} from './canvas-toolbar-state';
import type { EditorFloatingDocumentController } from './document-bar';

const POPOVER_BASE_CLASS_NAME = floatingChromeClassNames(
  'absolute z-50 max-h-[var(--editor-floating-popover-max-height)] overflow-y-auto p-3',
  '[scrollbar-gutter:stable_both-edges]'
);

const POPOVER_PLACEMENT_CLASS_NAMES = {
  above: 'bottom-[calc(100%+0.75rem)]',
  below: 'top-[calc(100%+0.75rem)]',
} as const;

const POPOVER_WIDTH_CLASS_NAMES: Record<NonNullable<FloatingToolbarGroup['width']>, string> = {
  simple: 'w-[min(16rem,calc(100vw-1.5rem))]',
  style: 'w-[min(18rem,calc(100vw-1.5rem))]',
  rich: 'w-[min(22rem,calc(100vw-1.5rem))]',
  menu: 'w-[min(17rem,calc(100vw-1.5rem))]',
};

function EditorCanvasToolbarGroupButton({
  active,
  group,
  onActivate,
  setButtonRef,
}: {
  active: boolean;
  group: FloatingToolbarGroup;
  onActivate: (group: FloatingToolbarGroup) => void;
  setButtonRef: (button: HTMLButtonElement | null) => void;
}) {
  return (
    <ContentToolbarButton
      ref={setButtonRef}
      title={group.title}
      active={active}
      disabled={group.disabled}
      className={group.id === 'font' ? '!w-auto min-w-9 px-2.5' : undefined}
      onClick={() => {
        onActivate(group);
      }}
      dataUi={`editor.floating.canvas-toolbar.group.${group.id}`}
    >
      {group.trigger}
    </ContentToolbarButton>
  );
}

function renderCanvasToolbarButtons(args: {
  activeGroupId: string | null;
  groups: FloatingToolbarGroup[];
  onActivateGroup: (group: FloatingToolbarGroup) => void;
  registerButtonRef: (groupId: string, button: HTMLButtonElement | null) => void;
}) {
  return args.groups.map((group) => (
    <EditorCanvasToolbarGroupButton
      key={group.id}
      active={Boolean(group.active) || args.activeGroupId === group.id}
      group={group}
      onActivate={args.onActivateGroup}
      setButtonRef={(button) => args.registerButtonRef(group.id, button)}
    />
  ));
}

function EditorCanvasToolbarUtilityGroups(props: {
  actionGroupCount: number;
  activeGroupId: string | null;
  groups: FloatingToolbarGroup[];
  onActivateGroup: (group: FloatingToolbarGroup) => void;
  registerButtonRef: (groupId: string, button: HTMLButtonElement | null) => void;
}) {
  if (props.groups.length === 0) {
    return null;
  }

  return (
    <>
      {props.actionGroupCount > 0 ? (
        <ContentToolbarDivider dataUi="editor.floating.canvas-toolbar.lock-divider" />
      ) : null}
      <ContentToolbarGroup dataUi="editor.floating.canvas-toolbar.utility-groups">
        {renderCanvasToolbarButtons(props)}
      </ContentToolbarGroup>
    </>
  );
}

function EditorCanvasToolbarSurface({
  activeGroupId,
  groups,
  onActivateGroup,
  registerButtonRef,
}: {
  activeGroupId: string | null;
  groups: FloatingToolbarGroup[];
  onActivateGroup: (group: FloatingToolbarGroup) => void;
  registerButtonRef: (groupId: string, button: HTMLButtonElement | null) => void;
}) {
  const actionGroups = groups.filter((group) => group.id !== 'layer-lock' && group.id !== 'more');
  const utilityGroups = groups.filter((group) => group.id === 'layer-lock' || group.id === 'more');

  return (
    <ContentToolbarShell
      dataUi="editor.floating.canvas-selection-toolbar.surface"
      className="!relative"
    >
      <ContentToolbarGroup dataUi="editor.floating.canvas-toolbar.groups">
        {renderCanvasToolbarButtons({
          activeGroupId,
          groups: actionGroups,
          onActivateGroup,
          registerButtonRef,
        })}
      </ContentToolbarGroup>
      <EditorCanvasToolbarUtilityGroups
        actionGroupCount={actionGroups.length}
        activeGroupId={activeGroupId}
        groups={utilityGroups}
        onActivateGroup={onActivateGroup}
        registerButtonRef={registerButtonRef}
      />
    </ContentToolbarShell>
  );
}

function EditorCanvasToolbarPopover({
  group,
  left,
  maxHeight,
  placement,
  popoverRef,
}: {
  group: FloatingToolbarGroup | null;
  left: number;
  maxHeight: number;
  placement: CanvasToolbarPopoverPlacement;
  popoverRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!group) {
    return null;
  }

  return (
    <FloatingChromePanel
      ref={popoverRef}
      dataUi={`editor.floating.canvas-toolbar.popover.${group.id}`}
      className={[
        POPOVER_BASE_CLASS_NAME,
        POPOVER_PLACEMENT_CLASS_NAMES[placement],
        POPOVER_WIDTH_CLASS_NAMES[group.width ?? 'style'],
      ].join(' ')}
      style={
        {
          '--editor-floating-popover-max-height': `${maxHeight}px`,
          left,
        } as React.CSSProperties
      }
    >
      {group.content}
    </FloatingChromePanel>
  );
}

function CanvasSelectionToolbarContent(props: {
  activeGroup: FloatingToolbarGroup | null;
  geometry: { left: number; top: number };
  groups: FloatingToolbarGroup[];
  toolbarState: ReturnType<typeof useCanvasToolbarState>;
}) {
  return (
    <div
      ref={props.toolbarState.rootRef}
      data-ui="editor.floating.canvas-selection-toolbar"
      className="absolute z-50"
      style={{
        left: props.geometry.left,
        top: props.geometry.top,
        transform: 'translateX(-50%)',
        width: 'max-content',
      }}
    >
      <EditorCanvasToolbarSurface
        activeGroupId={props.toolbarState.activeGroupId}
        groups={props.groups}
        onActivateGroup={(nextGroup) => {
          if (nextGroup.onClick) {
            props.toolbarState.setActiveGroupId(null);
            void nextGroup.onClick();
            return;
          }
          props.toolbarState.setActiveGroupId((current) =>
            current === nextGroup.id ? null : nextGroup.id
          );
        }}
        registerButtonRef={(groupId, button) => {
          if (button) {
            props.toolbarState.buttonRefs.current.set(groupId, button);
            return;
          }
          props.toolbarState.buttonRefs.current.delete(groupId);
        }}
      />
      <EditorCanvasToolbarPopover
        group={props.activeGroup}
        left={props.toolbarState.popoverLeft}
        maxHeight={props.toolbarState.popoverMaxHeight}
        placement={props.toolbarState.popoverPlacement}
        popoverRef={props.toolbarState.popoverRef}
      />
    </div>
  );
}

export function EditorCanvasSelectionToolbar({
  documentController,
  enabled,
  selection,
}: {
  documentController: EditorFloatingDocumentController;
  enabled: boolean;
  selection: EditorToolbarSelectionState;
}) {
  const groups = useCanvasToolbarGroups({ documentController, selection });
  const geometryState = useCanvasSelectionToolbarGeometry(enabled);
  const toolbarState = useCanvasToolbarState(
    enabled && geometryState.geometry !== null,
    groups,
    geometryState.geometry?.placement ?? 'above-selection',
    geometryState.visibilityRevision
  );
  const activeGroup = groups.find((group) => group.id === toolbarState.activeGroupId) ?? null;
  const { geometry } = geometryState;

  if (!enabled || !geometry) {
    return null;
  }

  return (
    <CanvasSelectionToolbarContent
      activeGroup={activeGroup}
      geometry={geometry}
      groups={groups}
      toolbarState={toolbarState}
    />
  );
}
