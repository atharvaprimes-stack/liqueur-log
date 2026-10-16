import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, SectionList, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import {
  compactVolume,
  filterStockEntrySearch,
  groupStock,
  isLowStock,
  itemNames,
  knownTermLabel,
  type StockItem,
} from '../../../src/domain/models/inventory';
import { useVoiceSearch } from '../../../src/hooks/useVoiceSearch';
import { useInventory } from '../../../src/hooks/useInventory';
import { useTheme } from '../../../src/theme/theme-context';

export default function StockScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const language = i18n.language;
  const { items, itemTypes, isLoading, errorCode, isAdmin, reload } = useInventory();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const voice = useVoiceSearch((transcript) => {
    setSearch(transcript);
  }, language);

  const searched = useMemo(() => filterStockEntrySearch(items, search), [items, search]);
  const sections = useMemo(() => groupStock(searched, itemTypes), [itemTypes, searched]);
  const selectedCount = selectedIds.size;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  const startSelecting = () => {
    setSelecting(true);
    setSelectedIds(new Set());
  };

  const cancelSelecting = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const toggleItem = (itemId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const proceed = () => {
    if (selectedCount === 0) {
      return;
    }
    const itemIds = [...selectedIds].join(',');
    setSelecting(false);
    setSelectedIds(new Set());
    router.push({ pathname: '/stock/purchase', params: { itemIds } });
  };

  const emptyKind: 'search' | 'catalog' = search.trim() ? 'search' : 'catalog';

  return (
    <ScreenWrapper padded={false}>
      <View className="flex-1">
        {items.length > 0 || isLoading ? (
          <View className="px-4 pb-3 pt-3">
            <View className="h-11 flex-row items-center rounded-xl border border-line bg-surface px-3">
              <Ionicons name="search" size={18} color={palette.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('stock.search')}
                placeholderTextColor={palette.muted}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                className="mx-2 h-11 min-w-0 flex-1 py-0 text-base text-ink"
                style={{ textAlignVertical: 'center' }}
              />
              {search.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('stock.clearSearch')}
                  hitSlop={8}
                  onPress={() => setSearch('')}
                  className="mr-1 h-8 w-8 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color={palette.muted} />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('stock.voiceSearch')}
                onPress={() => {
                  if (!voice.supported) {
                    Alert.alert(t('stock.voiceUnavailableTitle'), t('stock.voiceUnavailableBody'));
                    return;
                  }
                  voice.toggle();
                }}
                className={`h-8 w-8 items-center justify-center rounded-md ${voice.listening ? 'bg-accent' : ''}`}
              >
                <Ionicons
                  name={voice.listening ? 'mic' : 'mic-outline'}
                  size={18}
                  color={voice.listening ? palette.accentInk : palette.ink}
                />
              </Pressable>
            </View>
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
            className="flex-1"
            contentContainerStyle={{ flexGrow: sections.length === 0 ? 1 : undefined, paddingBottom: 12 }}
            stickySectionHeadersEnabled
            extraData={{ language, selecting, selectedCount }}
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
                  {knownTermLabel('types', section.liquorType, t)}
                </Text>
              )
            }
            renderItem={({ item }) => (
              <StockRow
                item={item}
                language={language}
                selecting={selecting}
                selected={selectedIds.has(item.id)}
                onToggle={() => toggleItem(item.id)}
              />
            )}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center px-6">
                <Text className="text-center text-base text-muted">
                  {t(emptyKind === 'search' ? 'stock.emptySearch' : 'stock.emptyCatalog')}
                </Text>
                {emptyKind === 'search' ? (
                  <Pressable accessibilityRole="button" onPress={() => setSearch('')} className="mt-3 h-11 justify-center">
                    <Text className="text-base font-semibold text-accent">{t('stock.clearSearch')}</Text>
                  </Pressable>
                ) : null}
              </View>
            }
          />
        )}

        {isAdmin ? (
          <View className="border-t border-line bg-surface px-4 py-3">
            {selecting ? (
              <View className="gap-2">
                <Text className="text-sm text-muted">{t('stock.selectHint')}</Text>
                <View className="flex-row gap-2">
                  <Pressable
                    accessibilityRole="button"
                    onPress={cancelSelecting}
                    className="h-12 flex-1 items-center justify-center rounded-lg border border-line bg-canvas"
                  >
                    <Text className="text-base font-semibold text-ink">{t('common.cancel')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={selectedCount === 0}
                    onPress={proceed}
                    className="h-12 flex-[1.4] items-center justify-center rounded-lg bg-accent disabled:opacity-50"
                  >
                    <Text className="text-base font-semibold text-accent-ink">
                      {t('stock.proceed', { count: selectedCount })}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={items.length === 0}
                onPress={startSelecting}
                className="h-12 items-center justify-center rounded-lg bg-accent disabled:opacity-50"
              >
                <Text className="text-base font-semibold text-accent-ink">{t('stock.add')}</Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </View>
    </ScreenWrapper>
  );
}

function StockRow({
  item,
  language,
  selecting,
  selected,
  onToggle,
}: {
  item: StockItem;
  language: string;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
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
      {selecting ? (
        <View
          className={`h-6 w-6 items-center justify-center rounded-md border ${
            selected ? 'border-accent bg-accent' : 'border-line bg-surface'
          }`}
        >
          {selected ? <Text className="text-xs font-bold text-accent-ink">✓</Text> : null}
        </View>
      ) : null}
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

  if (selecting) {
    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={rowLabel}
        onPress={onToggle}
        android_ripple={{ color: palette.line }}
        className={rowClass}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View accessibilityRole="text" accessibilityLabel={rowLabel} className={rowClass}>
      {body}
    </View>
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
