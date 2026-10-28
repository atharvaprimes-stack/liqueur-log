import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatInr } from '../domain/money';
import {
  filterStock,
  itemNames,
  tracksStock,
  volumeMessage,
  type StockItem,
} from '../domain/models/inventory';
import { useTheme } from '../theme/theme-context';
import { ActionRow } from './FormActions';

type SaleItemPickerProps = {
  visible: boolean;
  items: StockItem[];
  onClose: () => void;
  onPick: (itemId: string) => void;
};

export function SaleItemPicker({ visible, items, onClose, onPick }: SaleItemPickerProps) {
  const { t, i18n } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const [query, setQuery] = useState('');
  const visibleItems = useMemo(() => filterStock(items, query), [items, query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => setQuery('')}
    >
      <View style={themeStyle} className="flex-1 bg-canvas">
        <SafeAreaView className="flex-1">
          <View className="px-4 py-3">
            <Text className="text-lg font-semibold text-ink" numberOfLines={1}>
              {t('billing.pickerTitle')}
            </Text>
          </View>
          <View
            className="mx-4 mb-4 h-14 justify-center rounded-lg border border-line bg-surface px-4"
            style={{ height: 56, borderRadius: 8 }}
          >
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('billing.pickerSearch')}
              placeholderTextColor={palette.muted}
              autoCorrect={false}
              autoCapitalize="characters"
              underlineColorAndroid="transparent"
              className="w-full bg-transparent text-base text-ink"
              style={{
                margin: 0,
                padding: 0,
                borderWidth: 0,
                outlineWidth: 0,
                backgroundColor: 'transparent',
              }}
            />
          </View>
          <FlatList
            data={visibleItems}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-4 pb-8"
            ListEmptyComponent={<Text className="px-1 py-6 text-body text-muted">{t('billing.pickerEmpty')}</Text>}
            renderItem={({ item }) => {
              const names = itemNames(item, i18n.language);
              const volume = volumeMessage(item);
              const stocked = tracksStock(item);
              const out = stocked && item.currentStock <= 0;
              return (
                <Pressable
                  accessibilityRole="button"
                  disabled={out}
                  onPress={() => onPick(item.id)}
                  className="mb-2 rounded-2xl border border-line bg-surface px-4 py-3 disabled:opacity-50"
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <Text className="text-lg font-bold text-ink">
                        #{item.serialNo} · {item.itemCode}
                      </Text>
                      <Text className="mt-1 text-sm text-ink" numberOfLines={1}>
                        {names.primary}
                      </Text>
                      <Text className="text-sm text-muted">
                        {t(volume.key, volume.values)}
                        {stocked
                          ? ` · ${out ? t('billing.out') : t('billing.inStock', { count: item.currentStock })}`
                          : ''}
                      </Text>
                    </View>
                    <Text className="text-base font-semibold text-ink">{formatInr(item.sellingPrice)}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
          <ActionRow pinned leading={{ label: t('common.cancel'), onPress: onClose }} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}
