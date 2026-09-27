import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
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
  const [expanded, setExpanded] = useState(true);
  const params = createFloatingWorkspaceCommandParams({ documentController, hasImage });
  // The color field already exposes the same palette in its picker.
  const commands = buildGridCompactCommands(params).filter(
    (command) => command.id !== 'grid-presets'
  );

  return (
    <div
      className={[
        'sniptale-inspector-surface editor-inspector-surface',
        'max-h-[min(70vh,36rem)] overflow-y-auto overscroll-contain',
      ].join(' ')}
    >
      <section aria-label={translate('editor.toolbar.viewSettings')}>
        <h2>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
            className={[
              'flex w-full items-center gap-2 rounded-md px-1 py-1 text-left',
              'text-xs font-semibold text-[color:var(--sniptale-color-text-primary)]',
              'hover:bg-[color:var(--sniptale-color-surface-hover)]',
              'focus-visible:outline focus-visible:outline-1',
              'focus-visible:outline-[color:var(--sniptale-color-border-strong)]',
            ].join(' ')}
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
            <span className="min-w-0 flex-1">{translate('editor.toolbar.viewSettings')}</span>
            <ChevronDown
              size={15}
              aria-hidden="true"
              className={expanded ? 'transition-transform' : '-rotate-90 transition-transform'}
            />
          </button>
        </h2>
        {expanded ? (
          <div className="space-y-3 pt-2">
            <CompactWorkspaceColorPanel params={params} />
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
        ) : null}
      </section>
    </div>
  );
}
