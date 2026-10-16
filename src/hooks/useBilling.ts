import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/auth-context';
import { getOrder, settleOrder } from '../data/repositories/orderRepository';
import { buildReceipt, lineTotalPaise, receiptItemLabel, type ReceiptPayload } from '../domain/billing';
import { OrderValidationError, orderErrorCode, type OrderErrorCode } from '../domain/errors';
import { itemNames } from '../domain/models/inventory';
import { isPaymentMethod, type PaymentMethod, type SaleOrder } from '../domain/models/orders';
import type { ReceiptCopy } from '../domain/receiptDocument';
import { printReceipt, shareAndPrintReceipt, shareReceipt, type ShareReceiptResult } from '../printing/receiptFile';

export type CollectionResult = {
  share: ShareReceiptResult;
  order: SaleOrder;
};

export function useBilling(): {
  isSubmitting: boolean;
  errorCode: OrderErrorCode | null;
  clearError: () => void;
  collectAndClose: (
    orderId: string,
    payment: { method: PaymentMethod; paidAmount: number },
  ) => Promise<CollectionResult>;
  shareBill: (orderId: string) => Promise<ShareReceiptResult | 'error'>;
  printBill: (orderId: string) => Promise<boolean>;
  receiptPreview: (order: SaleOrder) => { receipt: ReceiptPayload; copy: ReceiptCopy } | null;
} {
  const { t, i18n } = useTranslation();
  const { currentUser, currentTenant } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const actorId = currentUser?.id ?? null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<OrderErrorCode | null>(null);

  const receiptFor = useCallback(
    (order: SaleOrder): ReceiptPayload => {
      if (!order.paymentMethod || order.closedAt === null || !currentTenant) {
        throw new OrderValidationError('unknown');
      }
      return buildReceipt({
        businessName: currentTenant.businessName,
        sequence: order.sequence,
        heading:
          order.orderType === 'COUNTER'
            ? t('billing.counterSale')
            : t('billing.tableTitle', { number: order.tableId ?? '' }),
        cashierName: currentUser?.name.trim() ?? '',
        closedAt: order.closedAt,
        lines: order.lines.map((line) => {
          const names = itemNames(line, i18n.language);
          const linePaise = lineTotalPaise(line.quantity, line.unitPrice);
          return {
            label: receiptItemLabel(names.primary, line.liquorType, line.volumeMl),
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: linePaise / 100,
          };
        }),
        totalAmount: order.totalAmount,
        paidAmount: order.paidAmount,
        paymentLabel: t(`billing.methods.${order.paymentMethod}`),
        isCredit: order.isCredit,
        labels: {
          cashier: t('billing.cashier'),
          subtotal: t('billing.subtotal'),
          tax: t('billing.vat'),
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

  const copyFor = useCallback(
    (receipt: ReceiptPayload): ReceiptCopy => ({
      thanks: t('billing.thanks'),
      poweredBy: t('billing.poweredBy'),
      billLabel: receipt.sequence,
      cashier: t('billing.cashier'),
      subtotal: t('billing.subtotal'),
      tax: t('billing.vat'),
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
        const order = await settleOrder({
          tenantId,
          actorId,
          orderId,
          method: payment.method,
          paidAmount: payment.paidAmount,
        });
        const receipt = receiptFor(order);
        const share = await shareAndPrintReceipt(receipt, copyFor(receipt));
        return { share, order };
      } catch (error) {
        const code = orderErrorCode(error);
        setErrorCode(code);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [actorId, copyFor, receiptFor, tenantId],
  );

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
        const receipt = receiptFor(order);
        return shareReceipt(receipt, copyFor(receipt));
      } catch (error) {
        setErrorCode(orderErrorCode(error));
        return 'error';
      } finally {
        setIsSubmitting(false);
      }
    },
    [copyFor, receiptFor, tenantId],
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
        const receipt = receiptFor(order);
        await printReceipt(receipt, copyFor(receipt));
        return true;
      } catch (error) {
        setErrorCode(orderErrorCode(error));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [copyFor, receiptFor, tenantId],
  );

  const receiptPreview = useCallback(
    (order: SaleOrder) => {
      if (order.status !== 'PAID' || !order.paymentMethod || order.closedAt === null) {
        return null;
      }
      try {
        const receipt = receiptFor(order);
        return { receipt, copy: copyFor(receipt) };
      } catch {
        return null;
      }
    },
    [copyFor, receiptFor],
  );

  return {
    isSubmitting,
    errorCode,
    clearError: () => setErrorCode(null),
    collectAndClose,
    shareBill,
    printBill,
    receiptPreview,
  };
}
