import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { displayBillNumber, formatBillStamp } from '../domain/billing';
import { formatInr } from '../domain/money';
import { balancePaise, type OrderSummary } from '../domain/models/orders';
import { useBillHistory } from '../hooks/useBillHistory';
import { useTheme } from '../theme/theme-context';

type BillListParent = '/reports' | '/table/history';

export function BillHistoryPane({ parent }: { parent: BillListParent }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const { orders, isLoading, errorCode } = useBillHistory(query);
  const needle = query.trim();

  return (
    <View className="flex-1">
      <View className="px-4 pt-4">
        <Text className="text-title font-semibold text-ink">{t('billing.historyTitle')}</Text>
        <Text className="mt-1 text-sm text-muted">{t('billing.historyHint')}</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('billing.historySearch')}
          placeholderTextColor={palette.muted}
          autoCorrect={false}
          autoCapitalize="none"
          className="mt-3 h-12 rounded-xl border border-line bg-surface px-4 text-base text-ink"
        />
      </View>
      {isLoading ? (
        <ActivityIndicator className="mt-8" color={palette.accent} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(order) => order.id}
          contentContainerClassName="px-4 pb-8 pt-3"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text className="py-6 text-body text-muted">
              {errorCode
                ? t(`billing.errors.${errorCode}`)
                : needle
                  ? t('billing.historyNone')
                  : t('billing.historyEmpty')}
            </Text>
          }
          renderItem={({ item }) => <HistoryRow order={item} parent={parent} />}
        />
      )}
    </View>
  );
}

function HistoryRow({ order, parent }: { order: OrderSummary; parent: BillListParent }) {
  const { t } = useTranslation();
  const place =
    order.orderType === 'COUNTER' ? t('billing.counterTitle') : t('billing.tableTitle', { number: order.tableId ?? '' });
  const method = order.paymentMethod ? t(`billing.methods.${order.paymentMethod}`) : '';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/table/bill/[id]', params: { id: order.id, returnTo: parent } })
      }
      className="mb-2 rounded-2xl border border-line bg-surface px-4 py-3"
    >
      <Text className="text-base font-bold text-ink">{displayBillNumber(order.sequence)}</Text>
      <Text className="mt-1 text-sm text-muted">
        {place} · {method} · {order.closedAt ? formatBillStamp(order.closedAt) : ''}
      </Text>
      <View className="mt-2 flex-row items-center justify-between gap-3">
        <Text className="text-base font-semibold text-ink">{formatInr(order.totalAmount)}</Text>
        {order.isCredit ? (
          <Text className="text-sm font-semibold text-danger">
            {t('billing.credit')} {formatInr(balancePaise(order.totalAmount, order.paidAmount) / 100)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
