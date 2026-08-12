import { writeBrowserClipboardItems } from '@sniptale/platform/browser/clipboard';
import type { DesktopFrameImageFormat } from '../../contracts/messaging/contracts/runtime-message/desktop-frame.types';
import {
  acquireOffscreenMediaActivityLease,
  type OffscreenMediaActivityLease,
} from '../media-activity/lease';
import { acquireDesktopStream } from './desktop-stream';
import { captureDesktopStreamFrame } from '../../platform/media-utils/desktop-frame';

const RESERVATION_TIMEOUT_MS = 30_000;

export type DesktopFrameResult = {
  result: 'captured';
  dataUrl: string;
  width: number;
  height: number;
};

type Reservation = {
  lease: OffscreenMediaActivityLease;
  timeout: ReturnType<typeof setTimeout>;
};

const reservations = new Map<string, Reservation>();

function takeReservation(requestId: string): Reservation {
  const reservation = reservations.get(requestId);
  if (!reservation) throw new Error('Desktop screenshot reservation is missing or expired');
  reservations.delete(requestId);
  clearTimeout(reservation.timeout);
  return reservation;
}

export function reserveDesktopFrame(requestId: string): 'accepted' {
  if (reservations.has(requestId)) return 'accepted';
  const acquisition = acquireOffscreenMediaActivityLease('desktop-screenshot');
  if (!acquisition.acquired) {
    throw new Error(`Desktop screenshot is unavailable while ${acquisition.busyOwner} is active`);
  }
  const timeout = setTimeout(() => {
    const reservation = reservations.get(requestId);
    if (!reservation) return;
    reservations.delete(requestId);
    reservation.lease.release();
  }, RESERVATION_TIMEOUT_MS);
  reservations.set(requestId, { lease: acquisition.lease, timeout });
  return 'accepted';
}

export function cancelDesktopFrame(requestId: string): 'accepted' {
  const reservation = reservations.get(requestId);
  if (!reservation) return 'accepted';
  reservations.delete(requestId);
  clearTimeout(reservation.timeout);
  reservation.lease.release();
  return 'accepted';
}

export async function writeDesktopFrameClipboard(dataUrl: string): Promise<'copied'> {
  const blob = await (await fetch(dataUrl)).blob();
  if (blob.type !== 'image/png')
    throw new Error('Desktop clipboard capture must be encoded as PNG');
  await writeBrowserClipboardItems([new ClipboardItem({ 'image/png': blob })]);
  return 'copied';
}

export async function captureDesktopFrame(args: {
  requestId: string;
  streamId: string;
  imageFormat: DesktopFrameImageFormat;
  imageQuality: number;
}): Promise<DesktopFrameResult> {
  const reservation = takeReservation(args.requestId);
  try {
    const frame = await captureDesktopStreamFrame({
      acquireStream: () =>
        acquireDesktopStream({
          desktopStreamId: args.streamId,
          controlledCursorCaptureEnabled: true,
        }),
      imageFormat: args.imageFormat,
      imageQuality: args.imageQuality,
    });
    return { result: 'captured', ...frame };
  } finally {
    reservation.lease.release();
  }
}
