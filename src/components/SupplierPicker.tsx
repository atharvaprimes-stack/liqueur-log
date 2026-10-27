import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMemo } from 'react';

import { isDefaultSupplierName, type Vendor } from '../domain/models/inventory';
import { useTheme } from '../theme/theme-context';
import { ActionRow } from './FormActions';

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
  const orderedVendors = useMemo(() => {
    const preferred = vendors.filter((vendor) => isDefaultSupplierName(vendor.name));
    const rest = vendors.filter((vendor) => !isDefaultSupplierName(vendor.name));
    return [...preferred, ...rest];
  }, [vendors]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={themeStyle} className="flex-1 bg-canvas">
        <SafeAreaView className="flex-1">
          <View className="px-4 py-3">
            <Text className="text-lg font-semibold text-ink" numberOfLines={1}>
              {t('stock.purchase.supplier')}
            </Text>
          </View>
          <FlatList
            data={orderedVendors}
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
          <ActionRow pinned leading={{ label: t('common.cancel'), onPress: onClose }} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}
