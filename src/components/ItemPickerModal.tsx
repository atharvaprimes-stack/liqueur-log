import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatRupeeInput } from '../domain/money';
import {
  filterStockEntrySearch,
  filterStockPickerCategory,
  itemNames,
  STOCK_PICKER_CATEGORIES,
  volumeMessage,
  type DraftLine,
  type StockItem,
  type StockPickerCategory,
} from '../domain/models/inventory';
import { useTheme } from '../theme/theme-context';

type ItemPickerModalProps = {
  visible: boolean;
  items: StockItem[];
  existingItemIds: string[];
  onClose: () => void;
  onAdd: (lines: DraftLine[]) => void;
};

export function ItemPickerModal({ visible, items, existingItemIds, onClose, onAdd }: ItemPickerModalProps) {
  const { t, i18n } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<StockPickerCategory>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const wasVisible = useRef(false);
  const alreadyOnBill = useMemo(() => new Set(existingItemIds), [existingItemIds]);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setSelectedIds(new Set());
      setQuery('');
      setCategory('all');
    }
    wasVisible.current = visible;
  }, [visible]);

  const visibleItems = useMemo(() => {
    return filterStockEntrySearch(filterStockPickerCategory(items, category), query);
  }, [category, items, query]);

  const selectedCount = selectedIds.size;

  const toggle = (itemId: string) => {
    if (alreadyOnBill.has(itemId)) {
      return;
    }
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={themeStyle} className="flex-1 justify-end">
        <Pressable accessibilityRole="button" className="flex-1 bg-black/50" onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            className="max-h-[88%] rounded-t-3xl border-t border-line bg-canvas"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <View className="mb-2 mt-3 h-1.5 w-12 self-center rounded-full bg-line" />
            <Text className="px-4 text-lg font-semibold text-ink">{t('stock.purchase.pickerTitle')}</Text>

            <View className="mx-4 mt-3 h-12 justify-center rounded-lg border border-line bg-surface px-4">
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('stock.purchase.pickerSearch')}
                placeholderTextColor={palette.muted}
                autoCorrect={false}
                autoCapitalize="none"
                className="w-full bg-transparent text-base text-ink"
                style={{ margin: 0, padding: 0, borderWidth: 0 }}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-3 max-h-12"
              contentContainerClassName="items-center gap-2 px-4"
            >
              {STOCK_PICKER_CATEGORIES.map((entry) => (
                <CategoryChip
                  key={entry}
                  label={t(`stock.purchase.pickerCategories.${entry}`)}
                  selected={category === entry}
                  onPress={() => setCategory(entry)}
                />
              ))}
            </ScrollView>

            <FlatList
              data={visibleItems}
              keyExtractor={(item) => item.id}
              className="mt-2"
              style={{ maxHeight: 420 }}
              contentContainerClassName="px-4 pb-3"
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text className="mt-8 text-center text-body text-muted">{t('stock.purchase.pickerEmpty')}</Text>
              }
              renderItem={({ item }) => {
                const names = itemNames(item, i18n.language);
                const volume = volumeMessage(item);
                const onBill = alreadyOnBill.has(item.id);
                const selected = selectedIds.has(item.id);
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected || onBill, disabled: onBill }}
                    disabled={onBill}
                    onPress={() => toggle(item.id)}
                    className={`mb-2 flex-row items-center gap-3 rounded-xl border px-3 py-3 ${
                      selected ? 'border-accent bg-surface' : 'border-line bg-surface'
                    } ${onBill ? 'opacity-60' : ''}`}
                  >
                    <View
                      className={`h-6 w-6 items-center justify-center rounded-md border ${
                        selected || onBill ? 'border-accent bg-accent' : 'border-line bg-canvas'
                      }`}
                    >
                      {selected || onBill ? <Text className="text-xs font-bold text-accent-ink">✓</Text> : null}
                    </View>
                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-sm font-bold text-accent">{item.itemCode}</Text>
                        {onBill ? (
                          <Text className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                            {t('stock.purchase.onBill')}
                          </Text>
                        ) : null}
                      </View>
                      <Text className="mt-0.5 text-base font-semibold text-ink" numberOfLines={1}>
                        {names.primary}
                      </Text>
                      <Text className="text-sm text-muted" numberOfLines={1}>
                        {t(volume.key, volume.values)} · {t('stock.inStock', { count: item.currentStock })}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />

            <View className="flex-row gap-3 border-t border-line px-4 pt-3">
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                className="h-12 flex-1 items-center justify-center rounded-lg border border-line bg-surface"
              >
                <Text className="text-base font-semibold text-ink">{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={selectedCount === 0}
                onPress={() => {
                  const added = items.flatMap((item) => {
                    if (!selectedIds.has(item.id) || alreadyOnBill.has(item.id)) {
                      return [];
                    }
                    return [
                      {
                        itemId: item.id,
                        quantity: '',
                        unitPrice: formatRupeeInput(item.purchasePrice),
                      },
                    ];
                  });
                  onAdd(added);
                }}
                className="h-12 flex-[1.4] items-center justify-center rounded-lg bg-accent disabled:opacity-50"
              >
                <Text className="text-center text-base font-semibold text-accent-ink">
                  {t('stock.purchase.pickerDone', { count: selectedCount })}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function CategoryChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-10 justify-center rounded-lg border px-3 ${selected ? 'border-accent bg-accent' : 'border-line bg-surface'}`}
    >
      <Text className={`text-sm font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}
