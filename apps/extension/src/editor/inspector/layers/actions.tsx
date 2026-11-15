import React from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { Icon } from '@iconify/react';
import adjustmentsIcon from '@iconify-icons/tabler/adjustments-horizontal';
import rasterizeIcon from '@iconify-icons/tabler/photo-down';
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { EditorIconButton, cx } from '../../chrome/ui';
import { LayerMutationButtons } from './mutation-buttons';
import type { EditorLayerEffectsOpenHandler } from './types';

const logger = createLogger({ namespace: 'EditorLayerActions' });
const LAYER_ACTION_BUTTON_CLASS_NAME = 'h-[26px] w-[26px] shrink-0';
const expandedActionsClassName = 'flex min-w-0 shrink-0 items-center pr-1.5';
const expandedActionsRowClassName = 'flex items-center gap-0.5';
function LayerImageSettingsButton(props: {
  autoNavigateSelectedLayer: boolean;
  isImmutable: boolean;
  layer: EditorLayerItem;
  onOpenLayerEffects: EditorLayerEffectsOpenHandler;
}) {
  const controller = useEditorController();
  const [pending, setPending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const inFlight = React.useRef(false),
    mounted = React.useRef(true),
    latest = React.useRef(props);
  latest.current = props;
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const open = () =>
    props.onOpenLayerEffects(props.layer.id, 'adjustments', 'brightness', {
      focusViewport: props.autoNavigateSelectedLayer,
    });
  const activate = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    let selected = false;
    try {
      if (props.layer.raster) {
        open();
        return;
      }
      controller.withHistoryMuted(() =>
        controller.selectLayer(props.layer.id, { focusViewport: props.autoNavigateSelectedLayer })
      );
      selected = true;
      const converted = await controller.rasterizeLayer(props.layer.id);
      if (
        !mounted.current ||
        latest.current.layer.id !== props.layer.id ||
        !latest.current.layer.selected
      )
        return;
      if (converted) open();
      else {
        logger.warn('Layer rasterization was refused', {
          phase: 'rasterizing',
          reason: 'conversion-refused',
        });
        setFailed(true);
      }
    } catch {
      if (mounted.current && (!selected || latest.current.layer.selected)) {
        logger.warn('Layer correction preparation failed', {
          phase: props.layer.raster ? 'opening' : selected ? 'rasterizing' : 'selecting',
          reason: 'conversion-failed',
        });
        setFailed(true);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  };
  const title = failed
    ? translate('editor.toolbar.layerRasterizeFailed')
    : translate(
        props.layer.raster
          ? 'editor.toolbar.layerImageSettings'
          : 'editor.toolbar.layerRasterizeAndAdjust'
      );
  return (
    <>
      <EditorIconButton
        variant="utility"
        title={title}
        aria-label={translate(
          props.layer.raster
            ? 'editor.toolbar.layerImageSettings'
            : 'editor.toolbar.layerRasterizeAndAdjust'
        )}
        data-ui={
          props.layer.raster ? 'editor.layers.image-settings' : 'editor.layers.rasterize-and-adjust'
        }
        aria-busy={pending}
        disabled={props.layer.locked || pending || (!props.layer.raster && props.isImmutable)}
        className={cx(
          LAYER_ACTION_BUTTON_CLASS_NAME,
          failed && 'text-[var(--sniptale-color-danger)]'
        )}
        onClick={() => void activate()}
      >
        <Icon
          icon={props.layer.raster ? adjustmentsIcon : rasterizeIcon}
          ssr
          aria-hidden
          width={14}
          height={14}
        />
      </EditorIconButton>
      {failed ? (
        <span role="alert" className="sr-only">
          {translate('editor.toolbar.layerRasterizeFailed')}
        </span>
      ) : null}
    </>
  );
}

function LayerVisibilityButton(props: {
  disabled: boolean;
  layer: EditorLayerItem;
  onToggle: () => void;
}) {
  return (
    <EditorIconButton
      variant="utility"
      title={
        props.layer.visible
          ? translate('editor.toolbar.hideLayer')
          : translate('editor.toolbar.showLayer')
      }
      onClick={props.onToggle}
      active={!props.layer.visible}
      disabled={props.disabled}
      className={LAYER_ACTION_BUTTON_CLASS_NAME}
    >
      {props.layer.visible ? (
        <Eye size={13} strokeWidth={2} />
      ) : (
        <EyeOff size={13} strokeWidth={2} className="text-[var(--sniptale-color-accent)]" />
      )}
    </EditorIconButton>
  );
}

function LayerLockButton(props: { disabled: boolean; locked: boolean; onToggle: () => void }) {
  return (
    <EditorIconButton
      variant="utility"
      title={
        props.locked
          ? translate('editor.toolbar.unlockLayer')
          : translate('editor.toolbar.lockLayer')
      }
      onClick={props.onToggle}
      active={props.locked}
      disabled={props.disabled}
      className={LAYER_ACTION_BUTTON_CLASS_NAME}
    >
      {props.locked ? (
        <Lock size={13} strokeWidth={2} className="text-[var(--sniptale-color-accent)]" />
      ) : (
        <Unlock size={13} strokeWidth={2} />
      )}
    </EditorIconButton>
  );
}

export function LayerActionRail(props: { layer: EditorLayerItem }) {
  const controller = useEditorController();

  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <LayerVisibilityButton
        disabled={props.layer.locked}
        layer={props.layer}
        onToggle={() => controller.toggleLayerVisibility(props.layer.id)}
      />
      <LayerLockButton
        disabled={false}
        locked={props.layer.locked}
        onToggle={() => controller.toggleLayerLock(props.layer.id)}
      />
    </div>
  );
}

export function LayerExpandedActions(props: {
  autoNavigateSelectedLayer: boolean;
  editingName: boolean;
  isImmutable: boolean;
  layer: EditorLayerItem;
  visible: boolean;
  onOpenLayerEffects: EditorLayerEffectsOpenHandler;
}) {
  if (props.editingName) {
    return null;
  }

  const locked = props.layer.locked;

  return (
    <div
      data-ui="editor.layers.expanded-actions"
      className={cx(expandedActionsClassName, !props.visible && 'hidden')}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div data-ui="editor.layers.expanded-actions-row" className={expandedActionsRowClassName}>
        <LayerImageSettingsButton
          autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
          isImmutable={props.isImmutable}
          layer={props.layer}
          onOpenLayerEffects={props.onOpenLayerEffects}
        />
        <LayerMutationButtons
          autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
          canDelete={!locked && !props.isImmutable}
          canDuplicate={!locked && (!props.isImmutable || props.layer.type === 'source-image')}
          layerId={props.layer.id}
        />
      </div>
    </div>
  );
}
