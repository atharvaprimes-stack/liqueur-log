import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File as ExpoFile, Paths } from 'expo-file-system';

import type { ReceiptPayload } from '../domain/billing';
import { buildReceiptDocument, type ReceiptCopy } from '../domain/receiptDocument';
import { buildReceiptPdf } from './receiptPdf';
import { receiptQrDataUri } from './receiptQr';

export type ShareReceiptResult = 'shared' | 'downloaded' | 'unopened';

/** Android PrintManager / share sheets sit under RN Modal windows — wait for dismiss. */
export function afterModalDismissed(): Promise<void> {
  if (Platform.OS === 'web') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, Platform.OS === 'android' ? 400 : 320);
  });
}

export async function sharePdfDocument(bytes: Uint8Array, fileName: string): Promise<ShareReceiptResult> {
  if (Platform.OS === 'web') {
    return sharePdfOnWeb(bytes, fileName);
  }
  return shareReceiptPdf(await writePdfFile(bytes, fileName));
}

export async function printPdfDocument(bytes: Uint8Array, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    await printPdfOnWeb(bytes);
    return;
  }
  await printReceiptPdf(await writePdfFile(bytes, fileName));
}

export async function savePdfDocument(
  bytes: Uint8Array,
  fileName: string,
): Promise<'saved' | 'downloaded'> {
  if (Platform.OS === 'web') {
    downloadPdf(bytes, fileName);
    return 'downloaded';
  }
  const destination = new ExpoFile(Paths.document, fileName);
  if (destination.exists) {
    destination.delete();
  }
  destination.create();
  destination.write(bytes);
  return 'saved';
}

export async function shareReceipt(receipt: ReceiptPayload, copy: ReceiptCopy): Promise<ShareReceiptResult> {
  const pdf = await buildReceiptPdf(receipt, copy);
  return sharePdfDocument(pdf.bytes, pdf.fileName);
}

export async function printReceipt(receipt: ReceiptPayload, copy: ReceiptCopy): Promise<void> {
  if (Platform.OS === 'web') {
    const document = buildReceiptDocument(receipt, copy, await receiptQrDataUri());
    await printReceiptHtml(document.html);
    return;
  }
  // Registered 58mm Bluetooth thermal (e.g. Posiflow PSF588) — ESC/POS, no system dialog.
  const thermal = await import('./thermalPrint');
  if (await thermal.hasThermalPrinter()) {
    const printed = await thermal.printThermalReceipt(receipt, copy);
    if (!printed) {
      throw new Error('thermal-print');
    }
    return;
  }
  const pdf = await buildReceiptPdf(receipt, copy);
  await printPdfDocument(pdf.bytes, pdf.fileName);
}

async function writePdfFile(bytes: Uint8Array, fileName: string): Promise<string> {
  const destination = new ExpoFile(Paths.cache, fileName);
  if (destination.exists) {
    destination.delete();
  }
  destination.create();
  destination.write(bytes);
  return destination.uri;
}

async function shareReceiptPdf(uri: string): Promise<ShareReceiptResult> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    return 'unopened';
  }
  // System share sheet (FileProvider + FLAG_GRANT_READ_URI_PERMISSION). Direct
  // IntentLauncher SEND extras cannot carry a Uri STREAM, so they never open WhatsApp correctly.
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'WhatsApp',
  });
  return 'shared';
}

async function printReceiptPdf(uri: string): Promise<void> {
  try {
    await Print.printAsync({ uri });
  } catch (error) {
    // iOS rejects when the print UI is dismissed without starting a print.
    if (Platform.OS === 'ios') {
      return;
    }
    throw error;
  }
}

function pdfBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(bytes);
}

async function sharePdfOnWeb(bytes: Uint8Array, fileName: string): Promise<ShareReceiptResult> {
  const file = new File([pdfBytes(bytes)], fileName, { type: 'application/pdf' });
  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'shared';
      }
    }
  }
  downloadPdf(bytes, fileName);
  return 'downloaded';
}

function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([pdfBytes(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function printPdfOnWeb(bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([pdfBytes(bytes)], { type: 'application/pdf' }));
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.left = '0';
    frame.style.top = '0';
    frame.style.width = '210mm';
    frame.style.height = '297mm';
    frame.style.border = '0';
    frame.style.zIndex = '-1';
    frame.style.pointerEvents = 'none';
    frame.src = url;
    document.body.appendChild(frame);
    frame.onload = () => {
      const cleanup = () => {
        window.setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 400);
      };
      try {
        frame.contentWindow?.addEventListener('afterprint', cleanup, { once: true });
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(cleanup, 60_000);
        resolve();
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
  });
}

function printReceiptHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.left = '0';
    frame.style.top = '0';
    frame.style.width = '58mm';
    frame.style.height = '100%';
    frame.style.border = '0';
    frame.style.zIndex = '-1';
    frame.style.pointerEvents = 'none';
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) {
      frame.remove();
      reject(new Error('print'));
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();
    window.setTimeout(() => {
      const cleanup = () => {
        window.setTimeout(() => frame.remove(), 400);
      };
      try {
        win.addEventListener('afterprint', cleanup, { once: true });
        win.focus();
        win.print();
        window.setTimeout(cleanup, 60_000);
        resolve();
      } catch (error) {
        frame.remove();
        reject(error);
      }
    }, 250);
  });
}
