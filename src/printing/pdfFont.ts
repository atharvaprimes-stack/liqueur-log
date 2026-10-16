import 'regenerator-runtime/runtime';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { PDFDocument, type PDFFont } from 'pdf-lib';
import * as fontkitNamespace from '@pdf-lib/fontkit';

const FONT = require('../../assets/fonts/NotoSansDevanagari-Regular.ttf') as number;

let fontBytesPromise: Promise<ArrayBuffer> | null = null;

export async function embedDocumentFont(pdf: PDFDocument): Promise<PDFFont> {
  pdf.registerFontkit(fontkit());
  return pdf.embedFont(await loadFontBytes(), { subset: true });
}

function fontkit(): Parameters<PDFDocument['registerFontkit']>[0] {
  const namespace = fontkitNamespace as unknown as {
    create?: (buffer: Uint8Array) => unknown;
    default?: { create: (buffer: Uint8Array) => unknown };
  };
  const resolved = namespace.create ? namespace : namespace.default;
  if (!resolved?.create) {
    throw new Error('fontkit');
  }
  return resolved as Parameters<PDFDocument['registerFontkit']>[0];
}

async function loadFontBytes(): Promise<ArrayBuffer> {
  if (!fontBytesPromise) {
    fontBytesPromise = readFont().catch((error: unknown) => {
      fontBytesPromise = null;
      throw error;
    });
  }
  return fontBytesPromise;
}

async function readFont(): Promise<ArrayBuffer> {
  const asset = Asset.fromModule(FONT);
  if (!asset.downloaded) {
    await asset.downloadAsync();
  }
  const uri = asset.localUri ?? asset.uri;
  if (!uri) {
    throw new Error('font');
  }
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error('font');
    }
    return response.arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}
