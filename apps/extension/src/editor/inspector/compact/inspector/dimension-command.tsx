import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import { SizeControlsRow } from '../../size-controls';
import type { InspectorCommandParams } from './command-types';

interface DimensionCommandArgs {
  applyTitle: string;
  aspectRatio: number | null;
  label: string;
  locked: boolean;
  setDraft:
    | InspectorCommandParams['setImageSizeDraft']
    | InspectorCommandParams['setCanvasSizeDraft'];
  setLocked:
    | InspectorCommandParams['setImageSizeLocked']
    | InspectorCommandParams['setCanvasSizeLocked'];
  sizeText: string;
  sizeDraft: { width: number; height: number };
  triggerId: string;
  onApply: () => void;
  updateLockedDraft: InspectorCommandParams['updateLockedDraft'];
}

const DimensionRow: React.FC<{
  aspectRatio: number | null;
  locked: boolean;
  setDraft:
    | InspectorCommandParams['setImageSizeDraft']
    | InspectorCommandParams['setCanvasSizeDraft'];
  setLocked:
    | InspectorCommandParams['setImageSizeLocked']
    | InspectorCommandParams['setCanvasSizeLocked'];
  sizeDraft: { width: number; height: number };
  updateLockedDraft: InspectorCommandParams['updateLockedDraft'];
}> = ({ aspectRatio, locked, setDraft, setLocked, sizeDraft, updateLockedDraft }) => (
  <SizeControlsRow
    width={sizeDraft.width}
    height={sizeDraft.height}
    locked={locked}
    onWidthChange={(nextValue) =>
      setDraft((state) => updateLockedDraft(state, 'width', nextValue, locked, aspectRatio))
    }
    onHeightChange={(nextValue) =>
      setDraft((state) => updateLockedDraft(state, 'height', nextValue, locked, aspectRatio))
    }
    onToggleLock={() => setLocked((state) => !state)}
  />
);

export function buildDimensionCommands(args: DimensionCommandArgs): CompactCommand[] {
  return [
    {
      id: args.triggerId,
      icon: 'size',
      title: args.label,
      trigger: <CompactCommandToken>SZ</CompactCommandToken>,
      value: args.sizeText,
      content: (
        <CompactCommandField label={args.label} value={args.sizeText}>
          <DimensionRow
            aspectRatio={args.aspectRatio}
            locked={args.locked}
            setDraft={args.setDraft}
            setLocked={args.setLocked}
            sizeDraft={args.sizeDraft}
            updateLockedDraft={args.updateLockedDraft}
          />
        </CompactCommandField>
      ),
    },
    {
      id: `${args.triggerId}-apply`,
      title: args.applyTitle,
      trigger: <CompactCommandToken>OK</CompactCommandToken>,
      onClick: args.onApply,
    },
  ];
}
