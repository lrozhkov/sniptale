import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { buildGridCompactCommands } from '../../inspector/compact/inspector/workspace-sections';
import type { InspectorCommandParams } from '../../inspector/compact/inspector/command-types';
import { CompactWorkspaceColorPanel } from '../../inspector/workspace-color/compact-workspace-content';
import { translate } from '../../../platform/i18n';
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
    (command) => command.id !== 'grid-presets'
  );

  return (
    <div
      className={[
        'sniptale-inspector-surface editor-inspector-surface',
        'max-h-[min(70vh,36rem)] space-y-3 overflow-y-auto overscroll-contain',
      ].join(' ')}
    >
      <section aria-label={translate('editor.toolbar.workspace')} className="space-y-3">
        <h2 className="text-xs font-medium text-[color:var(--sniptale-color-text-secondary)]">
          {translate('editor.toolbar.workspace')}
        </h2>
        <CompactWorkspaceColorPanel params={params} />
      </section>
      <section
        aria-label={translate('editor.toolbar.gridMode')}
        className="space-y-3 border-t border-[color:var(--sniptale-color-border-soft)] pt-3"
      >
        <h2 className="text-xs font-medium text-[color:var(--sniptale-color-text-secondary)]">
          {translate('editor.toolbar.gridMode')}
        </h2>
        {commands.map((command) => (
          <div key={command.id}>
            {command.active === undefined ? (
              renderFloatingToolbarCommandBody(command, { hideLabel: true })
            ) : (
              <div
                data-inspector-toggle
                className="flex min-h-9 items-center justify-between gap-3"
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
      </section>
    </div>
  );
}
