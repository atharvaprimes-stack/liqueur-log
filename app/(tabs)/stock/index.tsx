import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { useInventory } from '../../../src/hooks/useInventory';
import { itemNames, volumeMessage, type StockItem } from '../../../src/domain/models/inventory';
import { useTheme } from '../../../src/theme/theme-context';

export default function StockScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [search, setSearch] = useState('');
  const { sections, isLoading, errorCode, isAdmin, adjustingId, adjustStock } = useInventory(search);
  const language = i18n.language;

  return (
    <ScreenWrapper padded={false}>
      <View className="relative flex-1">
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          className="flex-1"
          contentContainerClassName="px-4 pb-36"
          stickySectionHeadersEnabled={false}
          extraData={adjustingId}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View className="pb-2">
              <Text className="text-display font-semibold text-ink">{t('stock.title')}</Text>
              <View className="mt-4 self-start rounded-full border border-line bg-surface px-4 py-2">
                <Text className="text-body font-semibold text-ink">
                  {t(isAdmin ? 'stock.fullAccess' : 'stock.viewOnly')}
                </Text>
              </View>
              <Text className="mt-4 text-body text-muted">{t(isAdmin ? 'stock.adminBody' : 'stock.staffBody')}</Text>
              {isAdmin ? <Text className="mt-2 text-sm text-muted">{t('stock.hint')}</Text> : null}
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('stock.search')}
                placeholderTextColor={palette.muted}
                autoCorrect={false}
                className="mt-5 h-14 rounded-2xl border border-line bg-surface px-4 text-body text-ink"
              />
              {errorCode ? <Text className="mt-4 text-sm text-danger">{t(`stock.errors.${errorCode}`)}</Text> : null}
              {isLoading ? <ActivityIndicator className="mt-6" color={palette.accent} /> : null}
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Text className="mb-3 mt-4 text-title font-semibold text-ink">
              {t(`stock.types.${section.liquorType}`)}
            </Text>
          )}
          renderItem={({ item }) => (
            <StockRow
              item={item}
              language={language}
              isAdmin={isAdmin}
              busy={adjustingId === item.id}
              onAdjust={(delta) => {
                void adjustStock(item.id, delta);
              }}
            />
          )}
          ListEmptyComponent={
            isLoading ? null : <Text className="mt-6 text-center text-body text-muted">{t('stock.empty')}</Text>
          }
        />

        {isAdmin ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/stock/purchase')}
            style={{ elevation: 8 }}
            className="absolute bottom-4 left-4 right-4 h-16 items-center justify-center rounded-full bg-accent px-4"
          >
            <Text
              className="text-center text-lg font-bold text-accent-ink"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {t('stock.entryFab')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScreenWrapper>
  );
}

function StockRow({
  item,
  language,
  isAdmin,
  busy,
  onAdjust,
}: {
  item: StockItem;
  language: string;
  isAdmin: boolean;
  busy: boolean;
  onAdjust: (delta: 1 | -1) => void;
}) {
  const { t } = useTranslation();
  const names = useMemo(() => itemNames(item, language), [item, language]);
  const volume = volumeMessage(item);
  const low = item.currentStock <= item.lowStockThreshold;
  let stockLabel = t('stock.onHand');
  if (item.currentStock === 0) {
    stockLabel = t('stock.out');
  } else if (low) {
    stockLabel = t('stock.low');
  }
  const showBrand =
    item.brand.toLowerCase() !== names.primary.toLowerCase() &&
    !names.primary.toLowerCase().includes(item.brand.toLowerCase());

  return (
    <View className={`mb-3 rounded-3xl border bg-surface p-4 ${low ? 'border-danger' : 'border-line'}`}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <View className="self-start rounded-full bg-canvas px-3 py-1">
            <Text className="text-sm font-bold text-ink">{item.itemCode}</Text>
          </View>
          <Text className="mt-2 text-base font-semibold text-ink">{names.primary}</Text>
          {names.secondary !== names.primary ? (
            <Text className="text-sm text-muted">{names.secondary}</Text>
          ) : null}
          {showBrand ? <Text className="text-sm text-muted">{item.brand}</Text> : null}
          <Text className="mt-1 text-sm text-muted">
            {t(volume.key, volume.values)} · {t(`stock.subTypes.${item.subType}`)}
          </Text>
        </View>
        <Text className={`text-sm font-semibold ${low ? 'text-danger' : 'text-success'}`}>
          {stockLabel}
        </Text>
      </View>

      <View className="mt-4 flex-row items-center justify-center gap-5">
        {isAdmin ? (
          <AdjustButton
            label="−"
            accessibilityLabel={t('stock.adjustDown', { name: names.primary })}
            disabled={busy || item.currentStock === 0}
            tone="danger"
            onPress={() => onAdjust(-1)}
          />
        ) : null}
        <Text className={`min-w-16 text-center text-display font-bold ${low ? 'text-danger' : 'text-ink'}`}>
          {item.currentStock}
        </Text>
        {isAdmin ? (
          <AdjustButton
            label="+"
            accessibilityLabel={t('stock.adjustUp', { name: names.primary })}
            disabled={busy}
            tone="accent"
            onPress={() => onAdjust(1)}
          />
        ) : null}
      </View>
    </View>
  );
}

function AdjustButton({
  label,
  accessibilityLabel,
  disabled,
  tone,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  tone: 'accent' | 'danger';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      className={`h-16 w-16 items-center justify-center rounded-full ${
        tone === 'accent' ? 'bg-accent' : 'bg-danger'
      } disabled:opacity-40`}
    >
      <Text className="text-2xl font-bold text-accent-ink">{label}</Text>
    </Pressable>
  );
}
