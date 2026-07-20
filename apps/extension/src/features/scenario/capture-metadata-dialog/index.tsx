import type { ScenarioCaptureMetadataView } from './types';
import { translate } from '../../../platform/i18n';
import { ProductModal, ProductModalBody, ProductModalHeader } from '@sniptale/ui/product-modal';
import { buildMetadataSections } from './sections';
import { ScenarioMetadataSectionView } from './section';
export type { ScenarioCaptureMetadataView } from './types';

export function ScenarioCaptureMetadataDialog(props: {
  onClose: () => void;
  stepTitle?: string;
  view: ScenarioCaptureMetadataView;
}) {
  return (
    <ProductModal maxWidth="720px" onClose={props.onClose} scrollable>
      <ProductModalHeader
        title={props.stepTitle || translate('scenario.common.metadata.title')}
        onClose={props.onClose}
      />
      <ProductModalBody className="grid gap-3">
        {buildMetadataSections(props.view).map((section) => (
          <ScenarioMetadataSectionView
            key={section.title}
            items={section.items}
            title={section.title}
          />
        ))}
      </ProductModalBody>
    </ProductModal>
  );
}
