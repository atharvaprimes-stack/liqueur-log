import { Platform, Text, View } from 'react-native';

import {
  formatBillStamp,
  formatReceiptAmount,
  formatReceiptMath,
  groupReceiptLinesByStation,
  type ReceiptLine,
  type ReceiptPayload,
} from '../domain/billing';
import type { ReceiptCopy } from '../domain/receiptDocument';
import type { PrintFontSize } from '../printing/printFontSize';
import type { PrintPaperWidth } from '../printing/printPaperWidth';
import { PREVIEW_TYPE, printTypeScale, type TypeScale } from '../printing/printTypeScale';

type ReceiptVariant = 'preview' | 'print';

export function ThermalReceipt({
  receipt,
  copy,
  variant = 'preview',
  printFontSize = 'small',
  printPaperWidth = 58,
}: {
  receipt: ReceiptPayload;
  copy: ReceiptCopy;
  variant?: ReceiptVariant;
  /** Used only when `variant` is `print`. Default matches current Small. */
  printFontSize?: PrintFontSize;
  /** Used only when `variant` is `print`. Default 58 keeps existing slips. */
  printPaperWidth?: PrintPaperWidth;
}) {
  const type = variant === 'print' ? printTypeScale(printFontSize, printPaperWidth) : PREVIEW_TYPE;
  const dash = '-'.repeat(type.dashLen);
  const equals = '='.repeat(type.dashLen);
  const sections = groupReceiptLinesByStation(receipt.lines);
  const slipWidth =
    Platform.OS === 'web' && variant === 'preview'
      ? ({ width: '58mm' as unknown as number, maxWidth: '100%' as const })
      : { width: type.width, maxWidth: '100%' as const };

  return (
    <View className="max-w-full self-center overflow-hidden bg-white px-1 py-2" style={slipWidth}>
      <Text className={`text-center uppercase leading-tight text-black ${type.business}`}>
        {receipt.businessName}
      </Text>
      {receipt.address.trim() ? (
        <Text className={`mt-1 text-center leading-tight text-black ${type.address}`} numberOfLines={2}>
          {receipt.address.trim()}
        </Text>
      ) : null}
      <Rule glyph={equals} type={type} />
      <HeaderRow
        left={copy.billLabel}
        right={formatBillStamp(receipt.closedAt)}
        leftAlign="left"
        rightAlign="right"
        type={type}
      />
      <HeaderRow
        left={receipt.heading}
        right={receipt.cashierName.trim()}
        leftAlign="left"
        rightAlign="right"
        type={type}
      />
      <Rule glyph={dash} type={type} />
      <ReceiptSection title={copy.bar} lines={sections.bar} pcs={copy.pcs} type={type} />
      <ReceiptSection title={copy.kitchen} lines={sections.kitchen} pcs={copy.pcs} type={type} />
      <Rule glyph={dash} type={type} />
      <AmountRow label={copy.subtotal} amount={receipt.subtotal} type={type} />
      <AmountRow label={copy.roundOff} amount={receipt.roundOff} type={type} />
      <Rule glyph={equals} type={type} />
      <AmountRow label={copy.total} amount={receipt.totalAmount} emphasis type={type} />
      {receipt.isCredit ? (
        <>
          <AmountRow label={receipt.paymentLabel} amount={receipt.paidAmount} type={type} />
          <AmountRow label={copy.credit} amount={receipt.balanceAmount} type={type} />
        </>
      ) : (
        <Meta type={type}>{receipt.paymentLabel}</Meta>
      )}
      <Rule glyph={dash} type={type} />
      <Text className={`text-center leading-tight text-black ${type.thanks}`}>{copy.thanks}</Text>
      <Text className={`mt-1 text-center leading-tight text-black ${type.powered}`}>{copy.poweredBy}</Text>
    </View>
  );
}

function ReceiptSection({
  title,
  lines,
  pcs,
  type,
}: {
  title: string;
  lines: ReceiptLine[];
  pcs: string;
  type: TypeScale;
}) {
  if (lines.length === 0) {
    return null;
  }
  return (
    <>
      <Text className={`mt-2 text-center uppercase tracking-widest leading-tight text-black ${type.section}`}>
        {`· ${title} ·`}
      </Text>
      {lines.map((line, index) => (
        <View key={`${title}-${line.label}-${index}`} className="mt-2">
          <Text className={`font-bold leading-tight text-black ${type.line}`}>{line.label}</Text>
          <View className="mt-0.5 flex-row items-start justify-between gap-2">
            <Text className={`min-w-0 flex-1 leading-tight text-black ${type.line}`}>
              {formatReceiptMath(line.quantity, line.unitPrice, pcs)}
            </Text>
            <Text className={`shrink-0 leading-tight text-black ${type.line}`}>
              {formatReceiptAmount(line.lineTotal)}
            </Text>
          </View>
        </View>
      ))}
    </>
  );
}

function Meta({ children, type }: { children: string; type: TypeScale }) {
  return <Text className={`text-center leading-tight text-black ${type.amount}`}>{children}</Text>;
}

function HeaderRow({
  left,
  right,
  leftAlign,
  rightAlign,
  type,
}: {
  left: string;
  right: string;
  leftAlign: 'left' | 'right';
  rightAlign: 'left' | 'right';
  type: TypeScale;
}) {
  return (
    <View className="flex-row items-start gap-1">
      <Text
        className={`min-w-0 flex-1 font-bold leading-tight text-black ${type.meta} ${
          leftAlign === 'right' ? 'text-right' : 'text-left'
        }`}
        numberOfLines={2}
      >
        {left}
      </Text>
      <Text
        className={`min-w-0 flex-1 leading-tight text-black ${type.meta} ${
          rightAlign === 'right' ? 'text-right' : 'text-left'
        }`}
        numberOfLines={2}
      >
        {right}
      </Text>
    </View>
  );
}

function Rule({ glyph, type }: { glyph: string; type: TypeScale }) {
  return (
    <Text className={`my-1.5 font-mono leading-tight text-black ${type.rule}`} numberOfLines={1}>
      {glyph}
    </Text>
  );
}

function AmountRow({
  label,
  amount,
  emphasis = false,
  type,
}: {
  label: string;
  amount: number;
  emphasis?: boolean;
  type: TypeScale;
}) {
  const size = emphasis ? type.total : type.amount;
  return (
    <View className="flex-row items-start justify-between gap-2">
      <Text className={`min-w-0 flex-1 uppercase leading-tight text-black ${size}`}>{label}</Text>
      <Text className={`shrink-0 leading-tight text-black ${size}`}>{formatReceiptAmount(amount)}</Text>
    </View>
  );
}
