import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { ActionRow } from '../../../src/components/FormActions';
import { useAuth } from '../../../src/context/AuthContext';
import {
  compactVolume,
  filterStock,
  groupStock,
  itemNames,
  knownTermLabel,
  type StockItem,
} from '../../../src/domain/models/inventory';
import { useCatalog } from '../../../src/hooks/useCatalog';
import { leaveScreen } from '../../../src/navigation/leave';
import { useTheme } from '../../../src/theme/theme-context';

export default function ManageItemsScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, isReady } = useAuth();
  const { items, itemTypes, isLoading, errorCode, isAdmin } = useCatalog();
  const [search, setSearch] = useState('');
  const sections = useMemo(
    () => groupStock(filterStock(items, search), itemTypes.map((term) => term.name)),
    [itemTypes, items, search],
  );

  if (!isReady) {
    return null;
  }
  if (!currentUser) {
    return <Redirect href="/login" />;
  }
  if (!isAdmin || currentUser.role !== 'ADMIN') {
    return <Redirect href="/menu" />;
  }

  return (
    <ScreenWrapper padded={false}>
      <View className="flex-1">
        <View className="px-4 pb-3 pt-4">
          <Text className="text-title font-semibold text-ink">{t('catalog.title')}</Text>
          <Text className="mt-1 text-sm text-muted">{t('catalog.body')}</Text>
          <View className="mt-3 h-11 flex-row items-center rounded-lg border border-line bg-surface px-3">
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('catalog.search')}
              placeholderTextColor={palette.muted}
              autoCorrect={false}
              autoCapitalize="none"
              className="h-11 min-w-0 flex-1 py-0 text-base text-ink"
            />
          </View>
          {errorCode ? <Text className="mt-3 text-sm text-danger">{t(`catalog.errors.${errorCode}`)}</Text> : null}
        </View>

        {isLoading ? (
          <ActivityIndicator className="mt-6" color={palette.accent} />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            className="flex-1"
            contentContainerStyle={{ flexGrow: sections.length === 0 ? 1 : undefined, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            renderSectionHeader={({ section }) => (
              <Text className="bg-canvas px-4 pb-1 pt-3 text-[13px] font-medium text-muted">
                {knownTermLabel('types', section.liquorType, t)}
              </Text>
            )}
            renderItem={({ item }) => <ItemRow item={item} language={i18n.language} />}
            ListEmptyComponent={
              <Text className="px-6 pt-8 text-center text-base text-muted">
                {search.trim() ? t('catalog.emptySearch') : t('catalog.empty')}
              </Text>
            }
          />
        )}
      </View>
      <ActionRow
        pinned
        leading={{ label: t('common.cancel'), onPress: () => leaveScreen('/menu') }}
        trailing={{ label: t('catalog.add'), onPress: () => router.push('/menu/item'), tone: 'accent' }}
      />
    </ScreenWrapper>
  );
}

function ItemRow({ item, language }: { item: StockItem; language: string }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const name = itemNames(item, language).primary;
  const volume = compactVolume(item);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/menu/item', params: { id: item.id } })}
      className="min-h-16 flex-row items-center gap-3 border-b border-line px-4 py-2"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-base font-medium text-ink" numberOfLines={1}>
          {name}
        </Text>
        <Text className="mt-0.5 text-[13px] text-muted" numberOfLines={1}>
          {item.itemCode} · {t(volume.key, volume.values)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.muted} />
    </Pressable>
  );
}
