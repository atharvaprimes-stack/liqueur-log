import { receiptQrDataUri } from './receiptQr';

/** Raw base64 (no data-URI prefix) of the UPI QR JPEG for ESC/POS image print. */
export async function loadReceiptQrBase64(): Promise<string> {
  const uri = await receiptQrDataUri();
  const marker = 'base64,';
  const index = uri.indexOf(marker);
  return index >= 0 ? uri.slice(index + marker.length) : uri;
}
