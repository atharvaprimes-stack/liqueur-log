import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatRupeeInput, parseQuantity, sanitizeQuantityInput, sanitizeRupeeInput } from '../domain/money';
import {
  filterStock,
  itemNames,
  knownTermLabel,
  volumeMessage,
  type DraftLine,
  type StockItem,
} from '../domain/models/inventory';
import { useTheme } from '../theme/theme-context';

type ItemPickerModalProps = {
  visible: boolean;
  items: StockItem[];
  lines: DraftLine[];
  onClose: () => void;
  onApply: (lines: DraftLine[]) => void;
};

type LineEdit = {
  quantity: string;
  unitPrice: string;
};

export function ItemPickerModal({ visible, items, lines, onClose, onApply }: ItemPickerModalProps) {
  const { t, i18n } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [edits, setEdits] = useState<Record<string, LineEdit>>({});
  const wasVisible = useRef(false);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      const next: Record<string, LineEdit> = {};
      for (const line of lines) {
        next[line.itemId] = { quantity: line.quantity, unitPrice: line.unitPrice };
      }
      setEdits(next);
      setQuery('');
      setCategory('all');
    }
    wasVisible.current = visible;
  }, [lines, visible]);

  const visibleItems = useMemo(() => {
    const inCategory = category === 'all' ? items : items.filter((item) => item.liquorType === category);
    return filterStock(inCategory, query);
  }, [category, items, query]);

  const selectedCount = items.filter((item) => {
    const quantity = edits[item.id]?.quantity ?? '';
    return parseQuantity(quantity) !== null;
  }).length;

  const update = (item: StockItem, patch: Partial<LineEdit>) => {
    setEdits((current) => {
      const previous = current[item.id] ?? {
        quantity: '',
        unitPrice: formatRupeeInput(item.purchasePrice),
      };
      return { ...current, [item.id]: { ...previous, ...patch } };
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={themeStyle} className="flex-1 bg-canvas">
        <SafeAreaView className="flex-1">
          <View className="flex-row items-center gap-2 px-2 py-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('stock.purchase.cancel')}
              onPress={onClose}
              className="h-11 w-11 items-center justify-center rounded-lg"
            >
              <Ionicons name="close" size={28} color={palette.ink} />
            </Pressable>
            <Text className="min-w-0 flex-1 text-lg font-semibold text-ink" numberOfLines={1}>
              {t('stock.purchase.pickerTitle')}
            </Text>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('stock.purchase.pickerSearch')}
            placeholderTextColor={palette.muted}
            autoCorrect={false}
            className="mx-4 h-14 rounded-2xl border border-line bg-surface px-4 text-body text-ink"
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-3 max-h-14"
            contentContainerClassName="items-center gap-2 px-4"
          >
            <CategoryChip
              label={t('stock.all')}
              selected={category === 'all'}
              onPress={() => setCategory('all')}
            />
            {typeNames(items).map((type) => (
              <CategoryChip
                key={type}
                label={knownTermLabel('types', type, t)}
                selected={category === type}
                onPress={() => setCategory(type)}
              />
            ))}
          </ScrollView>

          <FlatList
            data={visibleItems}
            keyExtractor={(item) => item.id}
            className="mt-3 flex-1"
            contentContainerClassName="px-4 pb-4"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text className="mt-8 text-center text-body text-muted">{t('stock.purchase.pickerEmpty')}</Text>}
            renderItem={({ item }) => {
              const names = itemNames(item, i18n.language);
              const volume = volumeMessage(item);
              const edit = edits[item.id] ?? {
                quantity: '',
                unitPrice: formatRupeeInput(item.purchasePrice),
              };
              const selected = parseQuantity(edit.quantity) !== null;
              return (
                <View className={`mb-3 rounded-3xl border bg-surface p-4 ${selected ? 'border-accent' : 'border-line'}`}>
                  <Text className="text-sm font-bold text-accent">{item.itemCode}</Text>
                  <Text className="mt-1 text-base font-semibold text-ink">{names.primary}</Text>
                  <Text className="text-sm text-muted">
                    {t(volume.key, volume.values)} · {t('stock.inStock', { count: item.currentStock })}
                  </Text>
                  <Text className="mb-2 mt-4 text-sm text-ink">{t('stock.purchase.quantity')}</Text>
                  <TextInput
                    value={edit.quantity}
                    onChangeText={(value) => update(item, { quantity: sanitizeQuantityInput(value) })}
                    placeholder={t('stock.purchase.quantityPlaceholder')}
                    placeholderTextColor={palette.muted}
                    keyboardType="number-pad"
                    className="h-14 rounded-2xl border border-line bg-canvas px-4 text-body text-ink"
                  />
                  <Text className="mb-2 mt-4 text-sm text-ink">{t('stock.purchase.cost')}</Text>
                  <TextInput
                    value={edit.unitPrice}
                    onChangeText={(value) => update(item, { unitPrice: sanitizeRupeeInput(value) })}
                    placeholder={t('stock.purchase.costPlaceholder')}
                    placeholderTextColor={palette.muted}
                    keyboardType="decimal-pad"
                    className="h-14 rounded-2xl border border-line bg-canvas px-4 text-body text-ink"
                  />
                </View>
              );
            }}
          />

          <View className="border-t border-line px-4 py-3">
            <Pressable
              accessibilityRole="button"
              disabled={selectedCount === 0}
              onPress={() => {
                const next = items.flatMap((item) => {
                  const edit = edits[item.id];
                  if (!edit || parseQuantity(edit.quantity) === null) {
                    return [];
                  }
                  return [{ itemId: item.id, quantity: edit.quantity.trim(), unitPrice: edit.unitPrice.trim() }];
                });
                onApply(next);
              }}
              className="h-16 items-center justify-center rounded-lg bg-accent disabled:opacity-50"
            >
              <Text className="text-body font-bold text-accent-ink">
                {t('stock.purchase.pickerDone', { count: selectedCount })}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function typeNames(items: StockItem[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    if (!names.includes(item.liquorType)) {
      names.push(item.liquorType);
    }
  }
  return names;
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
      className={`h-11 justify-center rounded-lg border px-4 ${selected ? 'border-accent bg-accent' : 'border-line bg-surface'}`}
    >
      <Text className={`text-base font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}
