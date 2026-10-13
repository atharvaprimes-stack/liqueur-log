import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, SectionList, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import {
  applyStockFacet,
  compactVolume,
  filterStock,
  groupStock,
  isLowStock,
  itemNames,
  LIQUOR_TYPES,
  stockFacetCounts,
  type StockFacet,
  type StockItem,
} from '../../../src/domain/models/inventory';
import { useInventory } from '../../../src/hooks/useInventory';
import { useTheme } from '../../../src/theme/theme-context';

export default function StockScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const language = i18n.language;
  const { items, isLoading, errorCode, isAdmin, reload } = useInventory();
  const [search, setSearch] = useState('');
  const [facet, setFacet] = useState<StockFacet>('all');
  const [refreshing, setRefreshing] = useState(false);

  const searched = useMemo(() => filterStock(items, search), [items, search]);
  const facets = useMemo(() => stockFacetCounts(searched), [searched]);
  const sections = useMemo(() => groupStock(applyStockFacet(searched, facet)), [facet, searched]);
  const chips = useMemo(() => {
    const types = LIQUOR_TYPES.filter((type) => facets.types[type] > 0 || facet === type);
    return ['all', ...types, 'low'] as StockFacet[];
  }, [facet, facets.types]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  const openItem = useCallback(
    (item: StockItem) => {
      if (!isAdmin) {
        return;
      }
      router.push({ pathname: '/stock/purchase', params: { itemId: item.id } });
    },
    [isAdmin],
  );

  let emptyKind: 'search' | 'filter' | 'catalog' = 'catalog';
  if (search.trim()) {
    emptyKind = 'search';
  } else if (facet !== 'all') {
    emptyKind = 'filter';
  }

  return (
    <ScreenWrapper padded={false}>
      <View className="flex-1">
        {items.length > 0 ? (
          <View className="pt-3">
            <View className="mx-4 h-11 flex-row items-center rounded-xl border border-line bg-surface px-3">
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('stock.search')}
                placeholderTextColor={palette.muted}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                className="h-11 min-w-0 flex-1 py-0 text-base text-ink"
                style={{ textAlignVertical: 'center' }}
              />
              {search.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('stock.clearSearch')}
                  hitSlop={8}
                  onPress={() => setSearch('')}
                  className="h-11 w-11 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color={palette.muted} />
                </Pressable>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mx-4 mt-3 h-10"
              contentContainerClassName="items-center gap-2"
            >
              {chips.map((chip) => (
                <FacetChip
                  key={chip}
                  label={chipLabel(chip, t)}
                  count={facetCount(chip, facets)}
                  selected={facet === chip}
                  emphasize={chip === 'low' && facet !== 'low' && facets.low > 0}
                  onPress={() => setFacet(chip)}
                />
              ))}
            </ScrollView>
            <View className="h-3" />
          </View>
        ) : null}

        {errorCode ? (
          <Text className="px-4 pb-2 text-sm text-danger">{t(`stock.errors.${errorCode}`)}</Text>
        ) : null}

        {isLoading ? (
          <SkeletonRows />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            key={facet}
            className="flex-1"
            contentContainerStyle={{ flexGrow: sections.length === 0 ? 1 : undefined, paddingBottom: 12 }}
            stickySectionHeadersEnabled
            extraData={language}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  void onRefresh();
                }}
                tintColor={palette.accent}
                colors={[palette.accent]}
              />
            }
            renderSectionHeader={({ section }) =>
              sections.length < 2 ? null : (
                <Text className="bg-canvas px-4 pb-1 pt-3 text-[13px] font-medium text-muted">
                  {t(`stock.types.${section.liquorType}`)}
                </Text>
              )
            }
            renderItem={({ item }) => (
              <StockRow item={item} language={language} isAdmin={isAdmin} onPress={openItem} />
            )}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center px-6">
                <Text className="text-center text-base text-muted">{t(emptyCopyKey(emptyKind))}</Text>
                {emptyKind === 'search' ? (
                  <Pressable accessibilityRole="button" onPress={() => setSearch('')} className="mt-3 h-11 justify-center">
                    <Text className="text-base font-semibold text-accent">{t('stock.clearSearch')}</Text>
                  </Pressable>
                ) : null}
                {emptyKind === 'filter' ? (
                  <Pressable accessibilityRole="button" onPress={() => setFacet('all')} className="mt-3 h-11 justify-center">
                    <Text className="text-base font-semibold text-accent">{t('stock.showAll')}</Text>
                  </Pressable>
                ) : null}
              </View>
            }
          />
        )}
      </View>
    </ScreenWrapper>
  );
}

function emptyCopyKey(kind: 'search' | 'filter' | 'catalog'): 'stock.emptySearch' | 'stock.emptyFilter' | 'stock.emptyCatalog' {
  if (kind === 'search') {
    return 'stock.emptySearch';
  }
  if (kind === 'filter') {
    return 'stock.emptyFilter';
  }
  return 'stock.emptyCatalog';
}

function facetCount(
  chip: StockFacet,
  facets: { all: number; low: number; types: Record<(typeof LIQUOR_TYPES)[number], number> },
): number {
  if (chip === 'all') {
    return facets.all;
  }
  if (chip === 'low') {
    return facets.low;
  }
  return facets.types[chip];
}

function chipLabel(chip: StockFacet, t: (key: string) => string): string {
  if (chip === 'all') {
    return t('stock.all');
  }
  if (chip === 'low') {
    return t('stock.low');
  }
  return t(`stock.types.${chip}`);
}

function labelTone(selected: boolean, emphasize: boolean): string {
  if (selected) {
    return 'text-accent-ink';
  }
  if (emphasize) {
    return 'text-danger';
  }
  return 'text-ink';
}

function countTone(selected: boolean, emphasize: boolean): string {
  if (selected) {
    return 'text-accent-ink';
  }
  if (emphasize) {
    return 'text-danger';
  }
  return 'text-muted';
}

function FacetChip({
  label,
  count,
  selected,
  emphasize,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  emphasize: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${count}`}
      onPress={onPress}
      className={`h-10 flex-row items-center gap-1 rounded-lg border px-3 ${
        selected ? 'border-accent bg-accent' : 'border-line bg-surface'
      }`}
    >
      <Text className={`text-[13px] font-semibold ${labelTone(selected, emphasize)}`}>{label}</Text>
      <Text className={`text-[13px] font-semibold ${countTone(selected, emphasize)}`} style={{ fontVariant: ['tabular-nums'] }}>
        {count}
      </Text>
    </Pressable>
  );
}

function StockRow({
  item,
  language,
  isAdmin,
  onPress,
}: {
  item: StockItem;
  language: string;
  isAdmin: boolean;
  onPress: (item: StockItem) => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const devanagari = language.startsWith('mr');
  const name = itemNames(item, language).primary;
  const volume = compactVolume(item);
  const detail = `${item.itemCode} · ${t(volume.key, volume.values)}`;
  const low = isLowStock(item);
  let status = '';
  let statusLabel = '';
  if (item.currentStock === 0) {
    status = t('stock.statusOut');
    statusLabel = t('stock.out');
  } else if (low) {
    status = t('stock.statusLow');
    statusLabel = t('stock.low');
  }
  const rowLabel = t('stock.rowLabel', { name, detail, count: item.currentStock, status });
  const rowClass = 'min-h-16 flex-row items-center gap-3 border-b border-line px-4 py-2';
  const body = (
    <>
      <View className="min-w-0 flex-1">
        <Text
          className="text-base font-medium text-ink"
          numberOfLines={1}
          style={devanagari ? { lineHeight: 24 } : undefined}
        >
          {name}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-2">
          <Text
            className="min-w-0 flex-1 text-[13px] text-muted"
            numberOfLines={1}
            style={devanagari ? { lineHeight: 20 } : undefined}
          >
            {detail}
          </Text>
          {statusLabel ? (
            <Text className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">
              {statusLabel}
            </Text>
          ) : null}
        </View>
      </View>
      <Text
        className={`min-w-12 shrink-0 text-right text-base font-semibold ${low ? 'text-danger' : 'text-ink'}`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {item.currentStock}
      </Text>
    </>
  );

  if (!isAdmin) {
    return (
      <View accessibilityRole="text" accessibilityLabel={rowLabel} className={rowClass}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rowLabel}
      onPress={() => onPress(item)}
      android_ripple={{ color: palette.line }}
      className={rowClass}
    >
      {body}
    </Pressable>
  );
}

function SkeletonRows() {
  return (
    <View className="flex-1 px-4">
      {Array.from({ length: 8 }, (_, index) => (
        <View key={index} className="h-16 flex-row items-center gap-3 border-b border-line">
          <View className="flex-1 gap-2">
            <View className="h-3.5 w-2/3 rounded bg-line" />
            <View className="h-3 w-1/3 rounded bg-line" />
          </View>
          <View className="h-4 w-8 rounded bg-line" />
        </View>
      ))}
    </View>
  );
}
