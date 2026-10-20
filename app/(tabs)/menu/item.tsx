import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { SaveRow } from '../../../src/components/FormActions';
import { leaveScreen } from '../../../src/navigation/leave';
import { useAuth } from '../../../src/context/AuthContext';
import { inventoryErrorCode } from '../../../src/domain/errors';
import {
  defaultServiceStation,
  itemNames,
  knownTermLabel,
  type CatalogItemInput,
  type ServiceStation,
} from '../../../src/domain/models/inventory';
import { formatRupeeInput, sanitizeRupeeInput } from '../../../src/domain/money';
import { useCatalog } from '../../../src/hooks/useCatalog';
import { useTheme } from '../../../src/theme/theme-context';

const EMPTY_FORM: CatalogItemInput = {
  itemCode: '',
  nameEn: '',
  nameMr: '',
  brand: '',
  liquorType: 'IMFL',
  subType: 'Strong',
  serviceStation: 'bar',
  volumeMl: '',
  purchasePrice: '',
  sellingPrice: '',
  lowStockThreshold: '0',
};

export default function ItemFormScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, isReady } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const itemId = Array.isArray(id) ? id[0] : id;
  const { items, itemTypes, itemStrengths, isLoading, isAdmin, saveItem, removeItem } = useCatalog();
  const [form, setForm] = useState<CatalogItemInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const seeded = useRef(false);
  const existing = itemId ? items.find((item) => item.id === itemId) : undefined;

  useEffect(() => {
    if (!existing || seeded.current) {
      return;
    }
    seeded.current = true;
    setForm({
      itemCode: existing.itemCode,
      nameEn: existing.nameEn,
      nameMr: existing.nameMr,
      brand: existing.brand,
      liquorType: existing.liquorType,
      subType: existing.subType,
      serviceStation: existing.serviceStation,
      volumeMl: String(existing.volumeMl),
      purchasePrice: formatRupeeInput(existing.purchasePrice),
      sellingPrice: formatRupeeInput(existing.sellingPrice),
      lowStockThreshold: String(existing.lowStockThreshold),
    });
  }, [existing]);

  useEffect(() => {
    if (itemId) {
      return;
    }
    setForm((current) => {
      const liquorType = itemTypes.some((term) => term.name === current.liquorType)
        ? current.liquorType
        : (itemTypes[0]?.name ?? current.liquorType);
      const subType = itemStrengths.some((term) => term.name === current.subType)
        ? current.subType
        : (itemStrengths[0]?.name ?? current.subType);
      if (liquorType === current.liquorType && subType === current.subType) {
        return current;
      }
      return { ...current, liquorType, subType };
    });
  }, [itemId, itemStrengths, itemTypes]);

  if (!isReady) {
    return null;
  }
  if (!currentUser) {
    return <Redirect href="/login" />;
  }
  if (!isAdmin || currentUser.role !== 'ADMIN') {
    return <Redirect href="/menu" />;
  }

  const patch = (next: Partial<CatalogItemInput>) => {
    setForm((current) => ({ ...current, ...next }));
    setFormError(null);
  };

  const onSave = async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveItem(itemId ?? null, form);
      leaveScreen('/menu/items');
    } catch (error) {
      setFormError(inventoryErrorCode(error));
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!itemId || saving) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await removeItem(itemId);
      leaveScreen('/menu/items');
    } catch (error) {
      setConfirmDelete(false);
      setFormError(inventoryErrorCode(error));
      setSaving(false);
    }
  };

  const kitchen = form.serviceStation === 'kitchen';

  return (
    <ScreenWrapper padded={false}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8" keyboardShouldPersistTaps="handled">
          <Text className="pt-4 text-title font-semibold text-ink">
            {itemId ? t('catalog.edit') : t('catalog.create')}
          </Text>
          <Text className="mt-1 text-sm text-muted">{t('catalog.stockNote')}</Text>
          {itemId && isLoading && !existing ? <ActivityIndicator className="mt-6" color={palette.accent} /> : null}
          {itemId && !isLoading && !existing ? (
            <Text className="mt-4 text-sm text-danger">{t('catalog.errors.unknown-item')}</Text>
          ) : null}

          <Text className="mb-2 mt-5 text-sm font-semibold text-ink">{t('catalog.station')}</Text>
          <View className="flex-row gap-4">
            {(['bar', 'kitchen'] as const).map((station: ServiceStation) => {
              const selected = form.serviceStation === station;
              return (
                <Pressable
                  key={station}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => patch({ serviceStation: station })}
                  className="min-w-0 flex-1 flex-row items-center gap-2 py-1"
                >
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
                      selected ? 'border-accent' : 'border-line'
                    }`}
                  >
                    {selected ? <View className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
                  </View>
                  <Text className="text-base text-ink">
                    {t(station === 'bar' ? 'catalog.stationBar' : 'catalog.stationKitchen')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field label={t('catalog.code')}>
            <TextInput
              value={form.itemCode}
              onChangeText={(value) => patch({ itemCode: value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={t('catalog.codePlaceholder')}
              placeholderTextColor={palette.muted}
              className={inputClass}
            />
          </Field>
          <Field label={t('catalog.nameEn')}>
            <TextInput
              value={form.nameEn}
              onChangeText={(value) => patch({ nameEn: value })}
              placeholder={t('catalog.nameEnPlaceholder')}
              placeholderTextColor={palette.muted}
              className={inputClass}
            />
          </Field>
          <Field label={t('catalog.nameMr')}>
            <TextInput
              value={form.nameMr}
              onChangeText={(value) => patch({ nameMr: value })}
              placeholder={t('catalog.nameMrPlaceholder')}
              placeholderTextColor={palette.muted}
              className={inputClass}
            />
          </Field>
          <Field label={t('catalog.brand')}>
            <TextInput
              value={form.brand}
              onChangeText={(value) => patch({ brand: value })}
              placeholder={t('catalog.brandPlaceholder')}
              placeholderTextColor={palette.muted}
              className={inputClass}
            />
          </Field>

          <Text className="mb-2 mt-5 text-sm font-semibold text-ink">{t('catalog.type')}</Text>
          {itemTypes.length === 0 && !isLoading ? (
            <Text className="text-sm text-muted">{t('catalog.noTypes')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {choiceNames(itemTypes.map((term) => term.name), form.liquorType).map((type) => (
                <ChoiceChip
                  key={type}
                  label={knownTermLabel('types', type, t)}
                  selected={form.liquorType === type}
                  onPress={() =>
                    patch({
                      liquorType: type,
                      serviceStation: defaultServiceStation(type),
                    })
                  }
                />
              ))}
            </ScrollView>
          )}

          <Text className="mb-2 mt-5 text-sm font-semibold text-ink">{t('catalog.subType')}</Text>
          {itemStrengths.length === 0 && !isLoading ? (
            <Text className="text-sm text-muted">{t('catalog.noStrengths')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {choiceNames(itemStrengths.map((term) => term.name), form.subType).map((type) => (
                <ChoiceChip
                  key={type}
                  label={knownTermLabel('subTypes', type, t)}
                  selected={form.subType === type}
                  onPress={() => patch({ subType: type })}
                />
              ))}
            </ScrollView>
          )}

          <View className="mt-4 flex-row gap-3">
            <Field
              label={t(kitchen ? 'catalog.volumeSnack' : 'catalog.volume')}
              className="min-w-0 flex-1"
              alignLabel
            >
              <TextInput
                value={form.volumeMl}
                onChangeText={(value) => patch({ volumeMl: value.replace(/\D/g, '').slice(0, 5) })}
                keyboardType="number-pad"
                placeholder={t('catalog.volumePlaceholder')}
                placeholderTextColor={palette.muted}
                className={inputClass}
              />
            </Field>
            <Field label={t('catalog.threshold')} className="min-w-0 flex-1" alignLabel>
              <TextInput
                value={form.lowStockThreshold}
                onChangeText={(value) => patch({ lowStockThreshold: value.replace(/\D/g, '').slice(0, 4) })}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={palette.muted}
                className={inputClass}
              />
            </Field>
          </View>
          <View className="mt-4 flex-row gap-3">
            <Field label={t('catalog.cost')} className="min-w-0 flex-1" alignLabel>
              <TextInput
                value={form.purchasePrice}
                onChangeText={(value) => patch({ purchasePrice: sanitizeRupeeInput(value) })}
                keyboardType="decimal-pad"
                placeholder={t('catalog.pricePlaceholder')}
                placeholderTextColor={palette.muted}
                className={inputClass}
              />
            </Field>
            <Field label={t('catalog.selling')} className="min-w-0 flex-1" alignLabel>
              <TextInput
                value={form.sellingPrice}
                onChangeText={(value) => patch({ sellingPrice: sanitizeRupeeInput(value) })}
                keyboardType="decimal-pad"
                placeholder={t('catalog.pricePlaceholder')}
                placeholderTextColor={palette.muted}
                className={inputClass}
              />
            </Field>
          </View>

          {formError ? <Text className="mt-4 text-sm text-danger">{t(`catalog.errors.${formError}`)}</Text> : null}

          <SaveRow
            parent="/menu/items"
            saveLabel={t('catalog.save')}
            saving={saving && !confirmDelete}
            saveDisabled={Boolean(itemId) && !existing}
            onSave={() => {
              void onSave();
            }}
          />

          {itemId && existing ? (
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => setConfirmDelete(true)}
              className="mt-3 h-12 items-center justify-center"
            >
              <Text className="text-base font-semibold text-danger">{t('catalog.delete')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {confirmDelete && existing ? (
        <View className="absolute inset-0 items-center justify-center bg-black/70 px-5">
          <View className="w-full max-w-md rounded-lg border border-line bg-surface p-5">
            <Text className="text-title font-semibold text-ink">
              {t('catalog.deleteTitle', { name: itemNames(existing, i18n.language).primary })}
            </Text>
            <Text className="mt-2 text-body text-muted">{t('catalog.deleteBody')}</Text>
            <View className="mt-6 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => setConfirmDelete(false)}
                className="h-12 flex-1 items-center justify-center rounded-lg border border-line bg-canvas"
              >
                <Text className="text-base font-semibold text-ink">{t('catalog.cancel')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => {
                  void onDelete();
                }}
                className="h-12 flex-1 items-center justify-center rounded-lg bg-danger"
              >
                <Text className="text-base font-semibold text-accent-ink">{t('catalog.delete')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </ScreenWrapper>
  );
}

const inputClass = 'h-12 rounded-lg border border-line bg-surface px-4 text-base text-ink';

function choiceNames(names: string[], current: string): string[] {
  if (!current || names.includes(current)) {
    return names;
  }
  return [current, ...names];
}

function Field({
  label,
  children,
  className = 'mt-4',
  alignLabel = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  alignLabel?: boolean;
}) {
  return (
    <View className={className}>
      <View className={`mb-2 ${alignLabel ? 'min-h-10 justify-end' : ''}`}>
        <Text className="text-sm font-semibold leading-5 text-ink" numberOfLines={alignLabel ? 2 : undefined}>
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-10 items-center justify-center rounded-lg border px-3 ${
        selected ? 'border-accent bg-accent' : 'border-line bg-surface'
      }`}
    >
      <Text className={`text-[13px] font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}
