import { forwardRef } from 'react';
import type { ReactNode, Ref } from 'react';

import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type { ProductSelectProps } from '@sniptale/ui/product-form-controls';

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

export type PopupSelectProps<T extends string = string> = ProductSelectProps<T>;

function PopupSelectInner<T extends string = string>(
  {
    className,
    containerClassName,
    controlSize,
    dataUi,
    menuClassName,
    ...props
  }: PopupSelectProps<T>,
  ref: Ref<HTMLButtonElement>
) {
  return (
    <ProductSelect
      ref={ref}
      {...props}
      controlSize={controlSize ?? 'sm'}
      dataUi={dataUi ?? 'shared.ui.popup-select'}
      className={cx('sniptale-popup-select', className)}
      containerClassName={cx('sniptale-popup-select-shell', containerClassName)}
      menuClassName={cx('sniptale-popup-select-menu', menuClassName)}
    />
  );
}

const PopupSelectBase = forwardRef<HTMLButtonElement, PopupSelectProps<string>>(PopupSelectInner);

export const PopupSelect = PopupSelectBase as <T extends string = string>(
  props: PopupSelectProps<T> & { ref?: Ref<HTMLButtonElement> }
) => ReactNode;
