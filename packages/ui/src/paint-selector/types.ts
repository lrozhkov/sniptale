import type { Paint, PaintStopIdFactory } from '@sniptale/foundation/paint';

export interface PaintSelectorTransactionOptions {
  createId: PaintStopIdFactory;
  onChange: (paint: Paint) => void;
  onPreviewChange?: (paint: Paint) => void;
  onPreviewReset?: (paint: Paint) => void;
  value: Paint;
}

export interface CompactPaintSelectorProps extends Omit<
  PaintSelectorTransactionOptions,
  'createId'
> {
  className?: string;
  disabled?: boolean;
  label: string;
  onOpenChange?: (open: boolean) => void;
  palette?: readonly string[];
  recentColors?: readonly string[];
  title: string;
}
