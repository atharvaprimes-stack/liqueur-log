import type { ReceiptPayload } from '../domain/billing';
import type { ReceiptCopy } from '../domain/receiptDocument';

export type ReceiptCaptureJob = {
  receipt: ReceiptPayload;
  copy: ReceiptCopy;
  resolve: (base64: string) => void;
  reject: (error: unknown) => void;
};

type CaptureRunner = (job: ReceiptCaptureJob) => void;

let runner: CaptureRunner | null = null;
let pending: ReceiptCaptureJob | null = null;

export function registerReceiptCaptureRunner(next: CaptureRunner | null): void {
  runner = next;
  if (runner && pending) {
    const job = pending;
    pending = null;
    runner(job);
  }
}

/** Renders the thermal slip off-screen (58 or 80mm per preference) and returns PNG base64. */
export function captureReceiptPng(receipt: ReceiptPayload, copy: ReceiptCopy): Promise<string> {
  return new Promise((resolve, reject) => {
    const job: ReceiptCaptureJob = { receipt, copy, resolve, reject };
    if (runner) {
      runner(job);
      return;
    }
    pending = job;
    // Host mounts on next frame in root layout; fail if it never registers.
    setTimeout(() => {
      if (pending === job) {
        pending = null;
        reject(new Error('capture-host'));
      }
    }, 4000);
  });
}
