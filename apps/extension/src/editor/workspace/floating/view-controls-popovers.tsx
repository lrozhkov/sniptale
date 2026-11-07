import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { buildGridCompactCommands } from '../../inspector/compact/inspector/workspace-sections';
import type { InspectorCommandParams } from '../../inspector/compact/inspector/command-types';
import { CompactWorkspaceColorPanel } from '../../inspector/workspace-color/compact-workspace-content';
import { translate } from '../../../platform/i18n';
import { SelectionVisibilitySetting } from '../../inspector/environment/selection-visibility';
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
  const allCommands = buildGridCompactCommands(params);
  const visibleIds = [
    'grid-toggle',
    'grid-snap-toggle',
    ...(params.workspace.gridEnabled || params.workspace.gridSnapEnabled ? ['grid-size'] : []),
    ...(params.workspace.gridEnabled ? ['grid-color'] : []),
  ];
  const commands = visibleIds.flatMap((id) => allCommands.filter((command) => command.id === id));

  return (
    <div
      className={[
        'sniptale-inspector-surface editor-inspector-surface',
        'max-h-[calc(100dvh-6.5rem)] max-[720px]:max-h-[calc(100dvh-10.5rem)]',
        'min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain pb-3',
      ].join(' ')}
    >
      <section aria-label={translate('editor.toolbar.viewSettings')}>
        <div className="space-y-3">
          <section className="sniptale-parameter-stack">
            <h3 className="m-0 px-2 text-[13px] font-medium leading-8">
              {translate('windowHeader.appearance')}
            </h3>
            <CompactWorkspaceColorPanel params={params} />
          </section>
          <section className="sniptale-parameter-stack">
            <h3 className="m-0 px-2 text-[13px] font-medium leading-8">
              {translate('editor.compact.workspaceSelection')}
            </h3>
            <SelectionVisibilitySetting />
          </section>
          <section className="sniptale-parameter-stack">
            <h3 className="m-0 px-2 text-[13px] font-medium leading-8">
              {translate('editor.compact.workspaceGrid')}
            </h3>
            {commands.map((command) => (
              <div key={command.id}>
                {command.active === undefined ? (
                  renderFloatingToolbarCommandBody(command, { hideLabel: true })
                ) : (
                  <div
                    data-inspector-toggle
                    className="sniptale-parameter-row sniptale-boolean-parameter"
                  >
                    <span className="sniptale-parameter-name">{command.title}</span>
                    <div className="sniptale-parameter-value">
                      <ProductGlassSwitch
                        aria-label={command.title}
                        aria-pressed={command.active}
                        on={command.active}
                        disabled={command.disabled}
                        onClick={() => void command.onClick?.()}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>
        </div>
      </section>
    </div>
  );
}
