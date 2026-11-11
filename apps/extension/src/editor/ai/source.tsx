import { useState } from 'react';
import { Icon } from '@iconify/react';
import marqueeIcon from '@iconify-icons/tabler/marquee-2';
import cameraIcon from '@iconify-icons/tabler/camera-spark';
import stackIcon from '@iconify-icons/tabler/stack-forward';
import photoIcon from '@iconify-icons/tabler/photo-plus';
import { PopupExpandingModeButton } from '../../ui/popup-shell/expanding-mode-button';
import { translate } from '../../platform/i18n';
import type { ImageBounds } from '../controller/ai-image/types';
import type { ImageEditorSession, ImageSessionState } from './session';

const RegionIcon = ({ className }: { className?: string }) => (
  <Icon ssr aria-hidden="true" icon={marqueeIcon} className={className} />
);
const SourceIcon = ({ className }: { className?: string }) => (
  <Icon ssr aria-hidden="true" icon={cameraIcon} className={className} />
);
const LayersIcon = ({ className }: { className?: string }) => (
  <Icon ssr aria-hidden="true" icon={stackIcon} className={className} />
);
const NewIcon = ({ className }: { className?: string }) => (
  <Icon ssr aria-hidden="true" icon={photoIcon} className={className} />
);

/** Uses the popup mode interaction with four source choices. Picking a region does not lock the inspector. */
export function ImageSourceControls(props: {
  session: Pick<ImageEditorSession, 'setDraft'>;
  state: Pick<ImageSessionState, 'source' | 'draft'>;
  region: ImageBounds | null;
  selectedCount: number;
  busy: boolean;
  pickingRegion: boolean;
  onSelectRegion(): void;
  onSelectLayers(): void;
  onCancelRegion(): void;
}) {
  const [animate, setAnimate] = useState(false);
  const region =
    props.state.source?.intention === 'region' ? props.state.source.targetBounds : props.region;
  const count =
    props.state.source?.intention === 'layers'
      ? props.state.source.sources.length
      : props.selectedCount;
  const choices = [
    {
      value: 'region',
      label: translate('editor.ai.modeRegion'),
      icon: RegionIcon,
      description: props.pickingRegion
        ? translate('editor.ai.modeRegionPicking')
        : region
          ? `${Math.round(region.width)} × ${Math.round(region.height)}`
          : translate('editor.ai.modeRegionHint'),
    },
    {
      value: 'source',
      label: translate('editor.ai.modeSource'),
      icon: SourceIcon,
      description: translate('editor.ai.modeSourceHint'),
    },
    {
      value: 'layers',
      label: translate('editor.ai.modeLayers'),
      icon: LayersIcon,
      description: `${translate('editor.ai.modeLayersHint')} ${count}`,
    },
    {
      value: 'new-image',
      label: translate('editor.ai.modeNew'),
      icon: NewIcon,
      description: translate('editor.ai.modeNewHint'),
    },
  ] as const;
  return (
    <div
      className="flex gap-1.5 [container-type:inline-size]"
      role="group"
      aria-label={translate('editor.ai.source')}
      data-ui="editor.ai.modes"
    >
      {choices.map((choice) => (
        <PopupExpandingModeButton
          key={choice.value}
          dataUi={`editor.ai.mode.${choice.value}`}
          icon={choice.icon}
          label={choice.label}
          description={choice.description}
          compact
          optionCount={4}
          active={choice.value === (props.pickingRegion ? 'region' : props.state.draft.intention)}
          animate={animate}
          disabled={props.busy}
          accentClassName="text-[var(--sniptale-color-accent)]"
          onClick={() => {
            setAnimate(true);
            if (choice.value === 'region') props.onSelectRegion();
            else if (choice.value === 'layers') props.onSelectLayers();
            else {
              props.onCancelRegion();
              props.session.setDraft({
                intention: choice.value,
                context: 'region',
                regionSource: 'canvas',
              });
            }
          }}
        />
      ))}
    </div>
  );
}
