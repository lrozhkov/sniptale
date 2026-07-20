import { translate, useAppLocale } from '../../../platform/i18n';
import { ProductCountdownToast } from '@sniptale/ui/product-feedback/toast';

interface CountdownToastProps {
  count: number;
  onCancel?: () => void;
}

export function CountdownToast({ count, onCancel }: CountdownToastProps) {
  useAppLocale();
  const toastProps = {
    count,
    labelPrefix: translate('content.interactiveFrame.countdownPrefix'),
    labelSuffix: translate('content.interactiveFrame.countdownSuffix'),
    ...(onCancel
      ? {
          cancelLabel: translate('content.interactiveFrame.cancelScreenshot'),
          onCancel,
        }
      : {}),
  };

  return <ProductCountdownToast {...toastProps} />;
}
