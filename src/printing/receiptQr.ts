import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import type { PDFDocument, PDFImage } from 'pdf-lib';

const QR_MODULE = require('../../assets/upi-qr.jpg') as number;

let qrBytesPromise: Promise<Uint8Array> | null = null;

export const RECEIPT_QR_SOURCE = QR_MODULE;

/** QR side length on a 58mm slip (points for PDF, dp for native preview). */
export const RECEIPT_QR_SIZE = 108;

export async function embedReceiptQr(pdf: PDFDocument): Promise<PDFImage> {
  return pdf.embedJpg(await loadReceiptQrBytes());
}

export async function receiptQrDataUri(): Promise<string> {
  const bytes = await loadReceiptQrBytes();
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

async function loadReceiptQrBytes(): Promise<Uint8Array> {
  if (!qrBytesPromise) {
    qrBytesPromise = readQr().catch((error: unknown) => {
      qrBytesPromise = null;
      throw error;
    });
  }
  return qrBytesPromise;
}

async function readQr(): Promise<Uint8Array> {
  const asset = Asset.fromModule(QR_MODULE);
  if (!asset.downloaded) {
    await asset.downloadAsync();
  }
  const uri = asset.localUri ?? asset.uri;
  if (!uri) {
    throw new Error('qr');
  }
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error('qr');
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  return new Uint8Array(await new File(uri).arrayBuffer());
}
