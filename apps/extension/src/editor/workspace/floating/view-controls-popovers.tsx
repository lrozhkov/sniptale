import { buildGridCompactCommands } from '../../inspector/compact/inspector/workspace-sections';
import type { InspectorCommandParams } from '../../inspector/compact/inspector/command-types';
import { CompactWorkspaceColorPanel } from '../../inspector/workspace-color/compact-workspace-content';
import { renderFloatingToolbarCommandBody } from './canvas-toolbar-command-groups';

type FloatingWorkspacePopoverController = Omit<InspectorCommandParams, 'hasImage'> &
  Partial<Pick<InspectorCommandParams, 'hasImage'>>;

function createFloatingWorkspaceCommandParams(props: {
  documentController: FloatingWorkspacePopoverController;
  hasImage: boolean;
}): InspectorCommandParams {
  return { ...props.documentController, hasImage: props.hasImage };
}

export function CompactWorkspacePopoverContent({
  documentController,
  hasImage = true,
}: {
  documentController: FloatingWorkspacePopoverController;
  hasImage?: boolean;
}) {
  const params = createFloatingWorkspaceCommandParams({ documentController, hasImage });
  return <CompactWorkspaceColorPanel params={params} />;
}

export function CompactGridPopoverContent({
  documentController,
  hasImage = true,
}: {
  documentController: FloatingWorkspacePopoverController;
  hasImage?: boolean;
}) {
  const params = createFloatingWorkspaceCommandParams({ documentController, hasImage });
  const commands = buildGridCompactCommands(params);

  return (
    <div className="space-y-4">
      {commands.map((command) => (
        <div key={command.id}>{renderFloatingToolbarCommandBody(command, { hideLabel: true })}</div>
      ))}
    </div>
  );
}
