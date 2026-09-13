import { useState, type ComponentProps } from 'react';
import { MousePointer2, ScanSearch, Play, RotateCcw } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { TourStage } from './stage';

/** View mode belongs to the canvas session and never enters project history. */
export function TourCameraTools(props: ComponentProps<typeof TourStage>) {
  const [view, setView] = useState<'edit' | 'frame' | 'preview'>('edit');
  const [replay, setReplay] = useState(0);
  const slide = props.tour.slides.find(
    (entry) => entry.id === (props.selection?.kind === 'slide' ? props.selection.slideId : null)
  );
  const image = slide?.kind === 'image' && slide.image;
  const effectiveView =
    view === 'frame' && slide?.kind === 'image' && slide.camera.mode !== 'manual' ? 'edit' : view;
  return (
    <div className="tour-camera-editor">
      <TourStage {...props} view={effectiveView} previewKey={replay} />
      {image && (
        <div className="tour-camera-tools" aria-label={props.t('scenario.editor.tourCamera')}>
          <ProductActionButton
            compact
            tone="secondary"
            aria-pressed={effectiveView === 'edit'}
            onClick={() => setView('edit')}
          >
            <MousePointer2 size={14} />
            {props.t('scenario.editor.tourCameraEdit')}
          </ProductActionButton>
          {slide.camera.mode === 'manual' && (
            <ProductActionButton
              compact
              tone="secondary"
              disabled={props.disabled}
              aria-pressed={effectiveView === 'frame'}
              onClick={() => setView('frame')}
            >
              <ScanSearch size={14} />
              {props.t('scenario.editor.tourCameraFrame')}
            </ProductActionButton>
          )}
          <ProductActionButton
            compact
            tone="secondary"
            aria-pressed={effectiveView === 'preview'}
            onClick={() => {
              setView('preview');
              setReplay((value) => value + 1);
            }}
          >
            {effectiveView === 'preview' ? <RotateCcw size={14} /> : <Play size={14} />}
            {props.t(
              effectiveView === 'preview'
                ? 'scenario.editor.tourCameraReplay'
                : 'scenario.editor.tourCameraPreview'
            )}
          </ProductActionButton>
          {effectiveView === 'preview' && (
            <span role="status">{props.t('scenario.editor.tourCameraResult')}</span>
          )}
        </div>
      )}
    </div>
  );
}
