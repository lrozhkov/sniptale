import type { NativeAppRuntimeStatus } from '../../../../../contracts/native-app/runtime';
import type { NativeRuntimeOperation } from '../types';
import { NativeStatusPanel } from './status-panel';

export function NativeConnectionView(props: {
  onAction: (operation: NativeRuntimeOperation) => void;
  status: NativeAppRuntimeStatus | null;
}) {
  return <NativeStatusPanel status={props.status} onAction={props.onAction} />;
}
