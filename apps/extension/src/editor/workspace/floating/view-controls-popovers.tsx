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
  // The color field already exposes the same palette in its picker.
  const commands = buildGridCompactCommands(params).filter(
    (command) =>
      command.id !== 'grid-presets' &&
      (params.workspace.gridEnabled || command.id === 'grid-toggle')
  );

  return (
    <div
      className={[
        'sniptale-inspector-surface editor-inspector-surface',
        'max-h-[calc(100dvh-6.5rem)] max-[720px]:max-h-[calc(100dvh-10.5rem)]',
        'overflow-y-auto overscroll-contain pb-3',
      ].join(' ')}
    >
      <section aria-label={translate('editor.toolbar.viewSettings')}>
        <div className="space-y-3">
          <CompactWorkspaceColorPanel params={params} />
          <div className="space-y-2 border-t border-[color:var(--sniptale-color-border-soft)] pt-2">
            <SelectionVisibilitySetting />
            <div className="space-y-2 border-t border-[color:var(--sniptale-color-border-soft)] pt-2">
              {commands.map((command) => (
                <div key={command.id}>
                  {command.active === undefined ? (
                    renderFloatingToolbarCommandBody(command, { hideLabel: true })
                  ) : (
                    <div
                      data-inspector-toggle
                      className="flex min-h-8 items-center justify-between gap-3"
                    >
                      <span className="min-w-0 text-xs">{command.title}</span>
                      <ProductGlassSwitch
                        aria-label={command.title}
                        aria-pressed={command.active}
                        on={command.active}
                        disabled={command.disabled}
                        onClick={() => void command.onClick?.()}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
