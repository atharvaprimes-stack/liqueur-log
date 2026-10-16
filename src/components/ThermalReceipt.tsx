import { Platform, Text, View } from 'react-native';

import { formatBillStamp, formatReceiptAmount, formatReceiptMath, type ReceiptPayload } from '../domain/billing';
import type { ReceiptCopy } from '../domain/receiptDocument';

const DASH = '-'.repeat(48);
const EQUALS = '='.repeat(48);

/** 58mm at 160 dp per inch. NativeWind drops mm and in, so the slip sets this width directly. */
const SLIP_WIDTH_DP = Math.round((58 / 25.4) * 160);

export function ThermalReceipt({ receipt, copy }: { receipt: ReceiptPayload; copy: ReceiptCopy }) {
  return (
    <View
      className="w-[58mm] max-w-full self-center overflow-hidden bg-white px-1 py-2"
      style={Platform.OS === 'web' ? { width: '58mm', maxWidth: '100%' } : { width: SLIP_WIDTH_DP, maxWidth: '100%' }}
    >
      <Text className="text-center text-[15px] font-bold uppercase leading-tight text-black">{receipt.businessName}</Text>
      <Rule glyph={EQUALS} />
      <Text className="text-center text-[12px] font-bold leading-tight text-black">{copy.billLabel}</Text>
      <Meta>{formatBillStamp(receipt.closedAt)}</Meta>
      <Meta>{receipt.heading}</Meta>
      {receipt.cashierName.trim() ? <Meta>{`${copy.cashier}: ${receipt.cashierName.trim()}`}</Meta> : null}
      <Rule glyph={DASH} />
      {receipt.lines.map((line, index) => (
        <View key={`${line.label}-${index}`} className="mt-1.5">
          <Text className="font-bold text-[11px] leading-tight text-black">{line.label}</Text>
          <View className="flex-row items-start justify-between gap-2">
            <Text className="flex-1 text-[11px] leading-tight text-black">
              {formatReceiptMath(line.quantity, line.unitPrice, copy.pcs)}
            </Text>
            <Text className="shrink-0 text-[11px] leading-tight text-black">{formatReceiptAmount(line.lineTotal)}</Text>
          </View>
        </View>
      ))}
      <Rule glyph={DASH} />
      <AmountRow label={copy.subtotal} amount={receipt.subtotal} />
      <AmountRow label={copy.tax} amount={receipt.taxAmount} />
      <AmountRow label={copy.roundOff} amount={receipt.roundOff} />
      <Rule glyph={EQUALS} />
      <AmountRow label={copy.total} amount={receipt.totalAmount} emphasis />
      {receipt.isCredit ? (
        <>
          <AmountRow label={receipt.paymentLabel} amount={receipt.paidAmount} />
          <AmountRow label={copy.credit} amount={receipt.balanceAmount} />
        </>
      ) : (
        <Meta>{receipt.paymentLabel}</Meta>
      )}
      <Rule glyph={DASH} />
      <Text className="text-center text-[11px] font-bold leading-tight text-black">{copy.thanks}</Text>
      <Text className="mt-0.5 text-center text-[10px] leading-tight text-black">{copy.poweredBy}</Text>
    </View>
  );
}

function Meta({ children }: { children: string }) {
  return <Text className="text-center text-[11px] leading-tight text-black">{children}</Text>;
}

function Rule({ glyph }: { glyph: string }) {
  return (
    <Text className="my-1 font-mono text-[11px] leading-tight text-black" numberOfLines={1}>
      {glyph}
    </Text>
  );
}

function AmountRow({ label, amount, emphasis = false }: { label: string; amount: number; emphasis?: boolean }) {
  const type = emphasis ? 'text-[13px] font-bold leading-tight text-black' : 'text-[11px] leading-tight text-black';
  return (
    <View className="flex-row items-start justify-between gap-2">
      <Text className={`flex-1 uppercase ${type}`}>{label}</Text>
      <Text className={`shrink-0 ${type}`}>{formatReceiptAmount(amount)}</Text>
    </View>
  );
}
