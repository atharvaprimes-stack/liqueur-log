import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { ThermalReceipt } from '../components/ThermalReceipt';
import { getPrintFontSize, type PrintFontSize } from './printFontSize';
import { getPrintPaperWidth, type PrintPaperWidth } from './printPaperWidth';
import { registerReceiptCaptureRunner, type ReceiptCaptureJob } from './receiptCapture';
import { thermalPaperDots } from './thermalConstants';

type CaptureLayout = {
  fontSize: PrintFontSize;
  paperWidth: PrintPaperWidth;
};

/**
 * Off-screen host that rasterizes ThermalReceipt for ESC/POS image print.
 * Required so Marathi (Devanagari) and the UPI QR match the on-screen slip.
 */
export function ReceiptCaptureHost() {
  const shotRef = useRef<ViewShotRef>(null);
  const [job, setJob] = useState<ReceiptCaptureJob | null>(null);
  const [layout, setLayout] = useState<CaptureLayout | null>(null);

  useEffect(() => {
    registerReceiptCaptureRunner((next) => setJob(next));
    return () => registerReceiptCaptureRunner(null);
  }, []);

  useEffect(() => {
    if (!job) {
      setLayout(null);
      return;
    }
    let cancelled = false;
    void Promise.all([getPrintFontSize(), getPrintPaperWidth()]).then(([fontSize, paperWidth]) => {
      if (!cancelled) {
        setLayout({ fontSize, paperWidth });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [job]);

  const onLayout = useCallback(() => {
    if (!job || !layout || !shotRef.current?.capture) {
      return;
    }
    const active = job;
    // Wait for fonts/images to paint before snapshotting.
    requestAnimationFrame(() => {
      setTimeout(() => {
        void shotRef.current
          ?.capture?.()
          .then((uri) => {
            const base64 = uri.includes('base64,') ? uri.slice(uri.indexOf('base64,') + 7) : uri;
            active.resolve(base64.replace(/\s+/g, ''));
          })
          .catch(active.reject)
          .finally(() => setJob((current) => (current === active ? null : current)));
      }, 280);
    });
  }, [job, layout]);

  if (!job || !layout) {
    return null;
  }

  const captureWidth = thermalPaperDots(layout.paperWidth);

  return (
    <View
      pointerEvents="none"
      collapsable={false}
      // Below the fold — Android often snapshots blank views parked at negative coords.
      style={{ position: 'absolute', left: 0, top: 4000, opacity: 1 }}
    >
      <ViewShot
        ref={shotRef}
        options={{
          format: 'png',
          quality: 1,
          result: 'base64',
          width: captureWidth,
        }}
        style={{ width: captureWidth, backgroundColor: '#ffffff' }}
        onLayout={onLayout}
      >
        <View collapsable={false} style={{ width: captureWidth, backgroundColor: '#ffffff' }}>
          <ThermalReceipt
            receipt={job.receipt}
            copy={job.copy}
            variant="print"
            printFontSize={layout.fontSize}
            printPaperWidth={layout.paperWidth}
          />
        </View>
      </ViewShot>
    </View>
  );
}
