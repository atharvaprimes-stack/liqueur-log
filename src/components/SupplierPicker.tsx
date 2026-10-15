import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type Vendor } from '../domain/models/inventory';
import { useTheme } from '../theme/theme-context';

type SupplierPickerProps = {
  visible: boolean;
  vendors: Vendor[];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (vendorId: string) => void;
};

export function SupplierPicker({ visible, vendors, selectedId, onClose, onSelect }: SupplierPickerProps) {
  const { t } = useTranslation();
  const { themeStyle } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={themeStyle} className="flex-1 bg-canvas">
        <SafeAreaView className="flex-1">
          <View className="flex-row items-center justify-between px-4 py-3">
            <Text className="text-title font-semibold text-ink">{t('stock.purchase.supplier')}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} className="h-11 justify-center px-1">
              <Text className="text-base font-semibold text-accent">{t('stock.purchase.cancel')}</Text>
            </Pressable>
          </View>
          <FlatList
            data={vendors}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-4 pb-8"
            renderItem={({ item }) => {
              const selected = item.id === selectedId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(item.id)}
                  className={`mb-2 min-h-14 justify-center rounded-lg border px-4 py-3 ${
                    selected ? 'border-accent bg-accent' : 'border-line bg-surface'
                  }`}
                >
                  <Text className={`text-base font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}>{item.name}</Text>
                  {item.phone ? (
                    <Text className={`mt-0.5 text-sm ${selected ? 'text-accent-ink' : 'text-muted'}`}>{item.phone}</Text>
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text className="pt-8 text-center text-base text-muted">{t('stock.purchase.noVendors')}</Text>
            }
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}
