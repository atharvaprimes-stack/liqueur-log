import { Image, Platform, Text, View } from 'react-native';

import {
  formatBillStamp,
  formatReceiptAmount,
  formatReceiptMath,
  groupReceiptLinesByStation,
  type ReceiptLine,
  type ReceiptPayload,
} from '../domain/billing';
import type { ReceiptCopy } from '../domain/receiptDocument';
import { RECEIPT_QR_SIZE, RECEIPT_QR_SOURCE } from '../printing/receiptQr';

const DASH = '-'.repeat(48);
const EQUALS = '='.repeat(48);

/** 58mm at 160 dp per inch. NativeWind drops mm and in, so the slip sets this width directly. */
const SLIP_WIDTH_DP = Math.round((58 / 25.4) * 160);

export function ThermalReceipt({ receipt, copy }: { receipt: ReceiptPayload; copy: ReceiptCopy }) {
  const sections = groupReceiptLinesByStation(receipt.lines);
  return (
    <View
      className="w-[58mm] max-w-full self-center overflow-hidden bg-white px-1 py-2"
      style={Platform.OS === 'web' ? { width: '58mm', maxWidth: '100%' } : { width: SLIP_WIDTH_DP, maxWidth: '100%' }}
    >
      <Text className="text-center text-[15px] font-bold uppercase leading-tight text-black">{receipt.businessName}</Text>
      {receipt.address.trim() ? (
        <Text className="mt-0.5 text-center text-[9px] leading-tight text-black" numberOfLines={1}>
          {receipt.address.trim()}
        </Text>
      ) : null}
      <Rule glyph={EQUALS} />
      <HeaderRow left={copy.billLabel} right={formatBillStamp(receipt.closedAt)} leftAlign="left" rightAlign="right" />
      <HeaderRow
        left={receipt.heading}
        right={receipt.cashierName.trim()}
        leftAlign="left"
        rightAlign="right"
      />
      <Rule glyph={DASH} />
      <ReceiptSection title={copy.bar} lines={sections.bar} pcs={copy.pcs} />
      <ReceiptSection title={copy.kitchen} lines={sections.kitchen} pcs={copy.pcs} />
      <Rule glyph={DASH} />
      <AmountRow label={copy.subtotal} amount={receipt.subtotal} />
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
      <ScanPayBlock label={copy.scanPay} />
      <Rule glyph={DASH} />
      <Text className="text-center text-[11px] font-bold leading-tight text-black">{copy.thanks}</Text>
      <Text className="mt-0.5 text-center text-[10px] leading-tight text-black">{copy.poweredBy}</Text>
    </View>
  );
}

function ScanPayBlock({ label }: { label: string }) {
  return (
    <View className="my-1.5 items-center">
      <Text className="mb-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-black">{label}</Text>
      <View className="border border-black bg-white p-1.5">
        <Image
          source={RECEIPT_QR_SOURCE}
          accessibilityLabel={label}
          resizeMode="contain"
          style={{ width: RECEIPT_QR_SIZE, height: RECEIPT_QR_SIZE }}
        />
      </View>
    </View>
  );
}

function ReceiptSection({ title, lines, pcs }: { title: string; lines: ReceiptLine[]; pcs: string }) {
  if (lines.length === 0) {
    return null;
  }
  return (
    <>
      <Text className="mt-1.5 text-center text-[8px] font-semibold uppercase tracking-widest leading-tight text-black">
        {`· ${title} ·`}
      </Text>
      {lines.map((line, index) => (
        <View key={`${title}-${line.label}-${index}`} className="mt-1.5">
          <Text className="font-bold text-[11px] leading-tight text-black">{line.label}</Text>
          <View className="flex-row items-start justify-between gap-2">
            <Text className="flex-1 text-[11px] leading-tight text-black">
              {formatReceiptMath(line.quantity, line.unitPrice, pcs)}
            </Text>
            <Text className="shrink-0 text-[11px] leading-tight text-black">{formatReceiptAmount(line.lineTotal)}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

function Meta({ children }: { children: string }) {
  return <Text className="text-center text-[11px] leading-tight text-black">{children}</Text>;
}

function HeaderRow({
  left,
  right,
  leftAlign,
  rightAlign,
}: {
  left: string;
  right: string;
  leftAlign: 'left' | 'right';
  rightAlign: 'left' | 'right';
}) {
  return (
    <View className="flex-row items-start gap-1">
      <Text
        className={`min-w-0 flex-1 text-[9px] font-bold leading-tight text-black ${
          leftAlign === 'right' ? 'text-right' : 'text-left'
        }`}
        numberOfLines={1}
      >
        {left}
      </Text>
      <Text
        className={`min-w-0 flex-1 text-[9px] leading-tight text-black ${
          rightAlign === 'right' ? 'text-right' : 'text-left'
        }`}
        numberOfLines={1}
      >
        {right}
      </Text>
    </View>
  );
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
