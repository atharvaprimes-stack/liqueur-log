import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ActionRow } from '../../../src/components/FormActions';
import { FormScreen } from '../../../src/components/FormScreen';
import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { leaveScreen } from '../../../src/navigation/leave';
import { useAuth } from '../../../src/context/AuthContext';
import { inventoryErrorCode } from '../../../src/domain/errors';
import {
  defaultServiceStation,
  itemNames,
  knownTermLabel,
  strengthRequiresVolume,
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
  liquorType: 'NA',
  subType: 'NA',
  serviceStation: 'bar',
  volumeMl: '',
  purchasePrice: '',
  sellingPrice: '',
  initialStock: '0',
  lowStockThreshold: '0',
};

function preferCatalogTerm(terms: { name: string }[], current: string): string {
  if (terms.some((term) => term.name === current)) {
    return current;
  }
  const na = terms.find((term) => term.name.trim().toLowerCase() === 'na');
  if (na) {
    return na.name;
  }
  return terms[0]?.name ?? current;
}

const inputClass = 'h-12 rounded-lg border border-line bg-canvas px-3 text-base text-ink';

function choiceNames(names: string[], current: string): string[] {
  if (!current || names.includes(current)) {
    return names;
  }
  return [current, ...names];
}

function FormCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="rounded-xl border border-line bg-surface p-4">
      <Text className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  children,
  className = 'mt-3',
  alignLabel = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  alignLabel?: boolean;
}) {
  return (
    <View className={className}>
      <View className={`mb-1.5 ${alignLabel ? 'min-h-9 justify-end' : ''}`}>
        <Text className="text-sm font-semibold leading-5 text-ink" numberOfLines={alignLabel ? 2 : undefined}>
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

function ChipWrap({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return hex;
  }
  const channel = Math.max(0, Math.min(255, Math.round(alpha * 255)))
    .toString(16)
    .padStart(2, '0');
  return `#${normalized}${channel}`;
}

function HorizontalChipRow({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const canOverflow = contentWidth > viewportWidth + 2;
  const canScrollMore = canOverflow && scrollX < contentWidth - viewportWidth - 8;

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollX(event.nativeEvent.contentOffset.x);
  };

  return (
    <View
      className="relative overflow-hidden"
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
    >
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 24 }}
        onContentSizeChange={(width) => setContentWidth(width)}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Android release APK: keep horizontal swipe from fighting the parent form scroll.
        {...(Platform.OS === 'android' ? { overScrollMode: 'never' as const } : {})}
      >
        {children}
      </ScrollView>
      {canScrollMore ? (
        <LinearGradient
          pointerEvents="none"
          colors={[withAlpha(palette.surface, 0), palette.surface]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 28 }}
        />
      ) : null}
    </View>
  );
}

function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-9 items-center justify-center rounded-full border px-3 ${
        selected ? 'border-accent bg-accent' : 'border-line bg-canvas'
      }`}
    >
      <Text className={`text-[13px] font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

function StationSegment({
  value,
  onChange,
  barLabel,
  kitchenLabel,
  hint,
}: {
  value: ServiceStation;
  onChange: (station: ServiceStation) => void;
  barLabel: string;
  kitchenLabel: string;
  hint: string;
}) {
  return (
    <View>
      <Text className="mb-2 text-sm font-semibold text-ink">{hint}</Text>
      <View className="flex-row rounded-full border border-line bg-surface p-1">
        {(['bar', 'kitchen'] as const).map((station) => {
          const selected = value === station;
          return (
            <Pressable
              key={station}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(station)}
              className={`h-10 min-w-0 flex-1 items-center justify-center rounded-full ${
                selected ? 'bg-accent' : 'bg-transparent'
              }`}
            >
              <Text className={`text-sm font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}>
                {station === 'bar' ? barLabel : kitchenLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ItemFormScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, isReady } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const itemId = Array.isArray(id) ? id[0] : id;
  const isCreate = !itemId;
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
      initialStock: '0',
      lowStockThreshold: String(existing.lowStockThreshold),
    });
  }, [existing]);

  useEffect(() => {
    if (itemId) {
      return;
    }
    setForm((current) => {
      const liquorType = preferCatalogTerm(itemTypes, current.liquorType);
      const subType = preferCatalogTerm(itemStrengths, current.subType);
      if (liquorType === current.liquorType && subType === current.subType) {
        return current;
      }
      return {
        ...current,
        liquorType,
        subType,
        serviceStation: defaultServiceStation(liquorType),
      };
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
  const showVolume = strengthRequiresVolume(form.subType);
  const typeChoices = choiceNames(
    itemTypes.map((term) => term.name),
    form.liquorType,
  );
  const strengthChoices = choiceNames(
    itemStrengths.map((term) => term.name),
    form.subType,
  );

  return (
    <ScreenWrapper padded={false}>
      <FormScreen
        contentContainerClassName="gap-3 px-4 pb-4 pt-4"
        nestedScrollEnabled
        footer={
          <ActionRow
            pinned
            leading={{
              label: t('common.cancel'),
              onPress: () => leaveScreen('/menu/items'),
              disabled: saving,
            }}
            trailing={{
              label: t('catalog.save'),
              onPress: () => {
                void onSave();
              },
              tone: 'accent',
              busy: saving && !confirmDelete,
              disabled: Boolean(itemId) && !existing,
            }}
          />
        }
      >
          <View>
            <Text className="text-title font-semibold text-ink">
              {itemId ? t('catalog.edit') : t('catalog.create')}
            </Text>
            {isCreate ? <Text className="mt-1 text-sm text-muted">{t('catalog.stockNote')}</Text> : null}
          </View>

          {itemId && isLoading && !existing ? <ActivityIndicator className="mt-2" color={palette.accent} /> : null}
          {itemId && !isLoading && !existing ? (
            <Text className="text-sm text-danger">{t('catalog.errors.unknown-item')}</Text>
          ) : null}

          <StationSegment
            value={form.serviceStation}
            onChange={(serviceStation) => patch({ serviceStation })}
            barLabel={t('catalog.stationBar')}
            kitchenLabel={t('catalog.stationKitchen')}
            hint={t('catalog.station')}
          />

          <FormCard title={t('catalog.basicInfo')}>
            <Field label={t('catalog.code')} className="mt-0">
              <TextInput
                value={form.itemCode}
                onChangeText={(value) =>
                  patch({ itemCode: value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })
                }
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={t('catalog.codePlaceholder')}
                placeholderTextColor={palette.muted}
                className={inputClass}
              />
            </Field>
            <View className="mt-3 flex-row gap-3">
              <Field label={t('catalog.nameEn')} className="min-w-0 flex-1" alignLabel>
                <TextInput
                  value={form.nameEn}
                  onChangeText={(value) => patch({ nameEn: value })}
                  placeholder={t('catalog.nameEnPlaceholder')}
                  placeholderTextColor={palette.muted}
                  className={inputClass}
                />
              </Field>
              <Field label={t('catalog.nameMr')} className="min-w-0 flex-1" alignLabel>
                <TextInput
                  value={form.nameMr}
                  onChangeText={(value) => patch({ nameMr: value })}
                  placeholder={t('catalog.nameMrPlaceholder')}
                  placeholderTextColor={palette.muted}
                  className={inputClass}
                />
              </Field>
            </View>
            <Field label={t('catalog.brand')}>
              <TextInput
                value={form.brand}
                onChangeText={(value) => patch({ brand: value })}
                placeholder={t('catalog.brandPlaceholder')}
                placeholderTextColor={palette.muted}
                className={inputClass}
              />
            </Field>
          </FormCard>

          <FormCard title={t('catalog.classification')}>
            <Text className="mb-2 text-sm font-semibold text-ink">{t('catalog.type')}</Text>
            {itemTypes.length === 0 && !isLoading ? (
              <Text className="text-sm text-muted">{t('catalog.noTypes')}</Text>
            ) : (
              <HorizontalChipRow>
                {typeChoices.map((type) => (
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
              </HorizontalChipRow>
            )}

            <Text className="mb-2 mt-4 text-sm font-semibold text-ink">{t('catalog.subType')}</Text>
            {itemStrengths.length === 0 && !isLoading ? (
              <Text className="text-sm text-muted">{t('catalog.noStrengths')}</Text>
            ) : (
              <ChipWrap>
                {strengthChoices.map((type) => (
                  <ChoiceChip
                    key={type}
                    label={knownTermLabel('subTypes', type, t)}
                    selected={form.subType === type}
                    onPress={() => patch({ subType: type })}
                  />
                ))}
              </ChipWrap>
            )}
          </FormCard>

          <FormCard title={t('catalog.pricingInventory')}>
            <View className="flex-row gap-3">
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

            <View className="mt-3 flex-row gap-3">
              {isCreate ? (
                <Field label={t('catalog.initialStock')} className="min-w-0 flex-1" alignLabel>
                  <TextInput
                    value={form.initialStock}
                    onChangeText={(value) => patch({ initialStock: value.replace(/\D/g, '').slice(0, 4) })}
                    keyboardType="number-pad"
                    placeholder={t('catalog.initialStockPlaceholder')}
                    placeholderTextColor={palette.muted}
                    className={inputClass}
                  />
                </Field>
              ) : null}
              {showVolume ? (
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
              ) : null}
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
          </FormCard>

          {formError ? <Text className="text-sm text-danger">{t(`catalog.errors.${formError}`)}</Text> : null}

          {itemId && existing ? (
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => setConfirmDelete(true)}
              className="h-12 items-center justify-center"
            >
              <Text className="text-base font-semibold text-danger">{t('catalog.delete')}</Text>
            </Pressable>
          ) : null}
      </FormScreen>

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
