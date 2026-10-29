import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/auth-context';
import { getOrder, settleOrder } from '../data/repositories/orderRepository';
import {
  aggregateReceiptLines,
  buildReceipt,
  displayBillNumber,
  lineTotalPaise,
  receiptItemLabel,
  type ReceiptPayload,
} from '../domain/billing';
import { OrderValidationError, orderErrorCode, type OrderErrorCode } from '../domain/errors';
import { itemNames } from '../domain/models/inventory';
import { isPaymentMethod, type PaymentMethod, type SaleOrder } from '../domain/models/orders';
import type { ReceiptCopy } from '../domain/receiptDocument';
import { printReceipt, shareReceipt, type ShareReceiptResult } from '../printing/receiptFile';

export type BillPreview = {
  receipt: ReceiptPayload;
  copy: ReceiptCopy;
};

export function useBilling(): {
  isSubmitting: boolean;
  errorCode: OrderErrorCode | null;
  clearError: () => void;
  collectAndClose: (
    orderId: string,
    payment: { method: PaymentMethod; paidAmount: number },
  ) => Promise<SaleOrder>;
  shareBill: (orderId: string) => Promise<ShareReceiptResult | 'error'>;
  printBill: (orderId: string) => Promise<boolean>;
  sharePreview: (preview: BillPreview) => Promise<ShareReceiptResult | 'error'>;
  printPreview: (preview: BillPreview) => Promise<boolean>;
  draftReceiptPreview: (order: SaleOrder, method: PaymentMethod) => BillPreview | null;
  receiptPreview: (order: SaleOrder) => BillPreview | null;
} {
  const { t, i18n } = useTranslation();
  const { currentUser, currentTenant } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const actorId = currentUser?.id ?? null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<OrderErrorCode | null>(null);

  const receiptFor = useCallback(
    (
      order: SaleOrder,
      payment: { method: PaymentMethod; paidAmount: number; closedAt: number; isCredit: boolean },
    ): ReceiptPayload => {
      if (!currentTenant) {
        throw new OrderValidationError('unknown');
      }
      return buildReceipt({
        businessName: currentTenant.businessName,
        address: currentTenant.address,
        sequence: order.sequence,
        heading:
          order.orderType === 'COUNTER'
            ? t('billing.counterSale')
            : t('billing.tableTitle', { number: order.tableId ?? '' }),
        cashierName: currentUser?.name.trim() ?? '',
        closedAt: payment.closedAt,
        lines: aggregateReceiptLines(
          order.lines.map((line) => {
            const names = itemNames(line, i18n.language);
            const linePaise = lineTotalPaise(line.quantity, line.unitPrice);
            return {
              label: receiptItemLabel(names.primary, line.volumeMl),
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: linePaise / 100,
              station: line.serviceStation,
            };
          }),
        ),
        totalAmount: order.totalAmount,
        paidAmount: payment.paidAmount,
        paymentLabel: t(`billing.methods.${payment.method}`),
        isCredit: payment.isCredit,
        labels: {
          billNo: t('billing.billNo', { id: displayBillNumber(order.sequence) }),
          cashier: t('billing.cashier'),
          subtotal: t('billing.subtotal'),
          roundOff: t('billing.roundOff'),
          total: t('billing.grandTotal'),
          credit: t('billing.credit'),
          thanks: t('billing.thanks'),
          poweredBy: t('billing.poweredBy'),
          pcs: t('billing.pcs'),
        },
      });
    },
    [currentTenant, currentUser?.name, i18n.language, t],
  );

  const settledReceipt = useCallback(
    (order: SaleOrder): ReceiptPayload => {
      if (!order.paymentMethod || order.closedAt === null) {
        throw new OrderValidationError('unknown');
      }
      return receiptFor(order, {
        method: order.paymentMethod,
        paidAmount: order.paidAmount,
        closedAt: order.closedAt,
        isCredit: order.isCredit,
      });
    },
    [receiptFor],
  );

  const copyFor = useCallback(
    (receipt: ReceiptPayload): ReceiptCopy => ({
      thanks: t('billing.thanks'),
      poweredBy: t('billing.poweredBy'),
      scanPay: t('billing.scanPay'),
      billLabel: t('billing.billNo', { id: displayBillNumber(receipt.sequence) }),
      cashier: t('billing.cashier'),
      subtotal: t('billing.subtotal'),
      roundOff: t('billing.roundOff'),
      total: t('billing.grandTotal'),
      credit: t('billing.credit'),
      pcs: t('billing.pcs'),
    }),
    [t],
  );

  const collectAndClose = useCallback(
    async (orderId: string, payment: { method: PaymentMethod; paidAmount: number }) => {
      if (!tenantId || !actorId || !isPaymentMethod(payment.method)) {
        throw new OrderValidationError('unknown');
      }
      setIsSubmitting(true);
      setErrorCode(null);
      try {
        return await settleOrder({
          tenantId,
          actorId,
          orderId,
          method: payment.method,
          paidAmount: payment.paidAmount,
        });
      } catch (error) {
        const code = orderErrorCode(error);
        setErrorCode(code);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [actorId, tenantId],
  );

  const sharePreview = useCallback(async (preview: BillPreview) => {
    try {
      return await shareReceipt(preview.receipt, preview.copy);
    } catch {
      return 'error' as const;
    }
  }, []);

  const printPreview = useCallback(async (preview: BillPreview) => {
    try {
      await printReceipt(preview.receipt, preview.copy);
      return true;
    } catch {
      return false;
    }
  }, []);

  const shareBill = useCallback(
    async (orderId: string) => {
      if (!tenantId) {
        throw new OrderValidationError('unknown');
      }
      setIsSubmitting(true);
      setErrorCode(null);
      try {
        const order = await getOrder(tenantId, orderId);
        if (order.status !== 'PAID') {
          throw new OrderValidationError('unknown');
        }
        const receipt = settledReceipt(order);
        return shareReceipt(receipt, copyFor(receipt));
      } catch (error) {
        setErrorCode(orderErrorCode(error));
        return 'error';
      } finally {
        setIsSubmitting(false);
      }
    },
    [copyFor, settledReceipt, tenantId],
  );

  const printBill = useCallback(
    async (orderId: string) => {
      if (!tenantId) {
        throw new OrderValidationError('unknown');
      }
      setIsSubmitting(true);
      setErrorCode(null);
      try {
        const order = await getOrder(tenantId, orderId);
        if (order.status !== 'PAID') {
          throw new OrderValidationError('unknown');
        }
        const receipt = settledReceipt(order);
        await printReceipt(receipt, copyFor(receipt));
        return true;
      } catch (error) {
        setErrorCode(orderErrorCode(error));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [copyFor, settledReceipt, tenantId],
  );

  const draftReceiptPreview = useCallback(
    (order: SaleOrder, method: PaymentMethod) => {
      if (!isPaymentMethod(method) || order.lines.length === 0 || !currentTenant) {
        return null;
      }
      try {
        const receipt = receiptFor(order, {
          method,
          paidAmount: order.totalAmount,
          closedAt: Date.now(),
          isCredit: false,
        });
        return { receipt, copy: copyFor(receipt) };
      } catch {
        return null;
      }
    },
    [copyFor, currentTenant, receiptFor],
  );

  const receiptPreview = useCallback(
    (order: SaleOrder) => {
      if (order.status !== 'PAID' || !order.paymentMethod || order.closedAt === null) {
        return null;
      }
      try {
        const receipt = settledReceipt(order);
        return { receipt, copy: copyFor(receipt) };
      } catch {
        return null;
      }
    },
    [copyFor, settledReceipt],
  );

  return {
    isSubmitting,
    errorCode,
    clearError: () => setErrorCode(null),
    collectAndClose,
    shareBill,
    printBill,
    sharePreview,
    printPreview,
    draftReceiptPreview,
    receiptPreview,
  };
}
