import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { ActionRow } from '../../../src/components/FormActions';
import { FormSheet } from '../../../src/components/FormScreen';
import { useAuth } from '../../../src/context/AuthContext';
import { inventoryErrorCode } from '../../../src/domain/errors';
import { type Vendor } from '../../../src/domain/models/inventory';
import { useCatalog } from '../../../src/hooks/useCatalog';
import { leaveScreen } from '../../../src/navigation/leave';
import { useTheme } from '../../../src/theme/theme-context';

type EditorState = { mode: 'create' } | { mode: 'edit'; vendor: Vendor } | null;

export default function ManageVendorsScreen() {
  const { t } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const { currentUser, isReady } = useAuth();
  const { vendors, isLoading, errorCode, isAdmin, saveVendor, removeVendor } = useCatalog();
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return vendors;
    }
    return vendors.filter((vendor) => vendor.name.toLowerCase().includes(needle) || vendor.phone.includes(needle));
  }, [query, vendors]);

  if (!isReady) {
    return null;
  }
  if (!currentUser) {
    return <Redirect href="/login" />;
  }
  if (!isAdmin || currentUser.role !== 'ADMIN') {
    return <Redirect href="/menu" />;
  }

  const openCreate = () => {
    setName('');
    setPhone('');
    setFormError(null);
    setConfirmDelete(false);
    setEditor({ mode: 'create' });
  };

  const openEdit = (vendor: Vendor) => {
    setName(vendor.name);
    setPhone(vendor.phone);
    setFormError(null);
    setConfirmDelete(false);
    setEditor({ mode: 'edit', vendor });
  };

  const onSave = async () => {
    if (!editor || saving) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveVendor(editor.mode === 'edit' ? editor.vendor.id : null, { name, phone });
      setEditor(null);
    } catch (error) {
      setFormError(inventoryErrorCode(error));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!editor || editor.mode !== 'edit' || saving) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await removeVendor(editor.vendor.id);
      setEditor(null);
    } catch (error) {
      setFormError(inventoryErrorCode(error));
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  return (
    <ScreenWrapper padded={false}>
      <View className="flex-1">
        <View className="px-4 pb-3 pt-4">
          <Text className="text-title font-semibold text-ink">{t('vendors.title')}</Text>
          <Text className="mt-1 text-sm text-muted">{t('vendors.body')}</Text>
          <View className="mt-3 h-11 flex-row items-center rounded-lg border border-line bg-surface px-3">
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('vendors.search')}
              placeholderTextColor={palette.muted}
              autoCorrect={false}
              className="h-11 min-w-0 flex-1 py-0 text-base text-ink"
            />
          </View>
          {errorCode ? <Text className="mt-3 text-sm text-danger">{t(`vendors.errors.${errorCode}`)}</Text> : null}
        </View>

        {isLoading ? (
          <ActivityIndicator className="mt-6" color={palette.accent} />
        ) : (
          <ScrollView className="flex-1" contentContainerClassName="pb-8" keyboardShouldPersistTaps="handled">
            {visible.length === 0 ? (
              <Text className="px-6 pt-8 text-center text-base text-muted">
                {query.trim() ? t('vendors.emptySearch') : t('vendors.empty')}
              </Text>
            ) : (
              visible.map((vendor) => (
                <Pressable
                  key={vendor.id}
                  accessibilityRole="button"
                  onPress={() => openEdit(vendor)}
                  className="min-h-16 justify-center border-b border-line px-4 py-3"
                >
                  <Text className="text-base font-medium text-ink">{vendor.name}</Text>
                  {vendor.phone ? <Text className="mt-0.5 text-[13px] text-muted">{vendor.phone}</Text> : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        )}
      </View>
      <ActionRow
        pinned
        leading={{ label: t('common.cancel'), onPress: () => leaveScreen('/menu') }}
        trailing={{ label: t('vendors.add'), onPress: openCreate, tone: 'accent' }}
      />

      <Modal visible={editor !== null} transparent animationType="slide" onRequestClose={() => !saving && setEditor(null)}>
        <View style={themeStyle} className="flex-1 justify-end bg-black/70">
          <Pressable accessibilityRole="button" className="flex-1" onPress={() => !saving && setEditor(null)} />
          <FormSheet>
            {confirmDelete && editor?.mode === 'edit' ? (
              <>
                <Text className="text-title font-semibold text-ink">
                  {t('vendors.deleteTitle', { name: editor.vendor.name })}
                </Text>
                <Text className="mt-2 text-body text-muted">{t('vendors.deleteBody')}</Text>
                <View className="mt-6 flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => setConfirmDelete(false)}
                    className="h-12 flex-1 items-center justify-center rounded-lg border border-line bg-canvas"
                  >
                    <Text className="text-base font-semibold text-ink">{t('vendors.cancel')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => {
                      void onDelete();
                    }}
                    className="h-12 flex-1 items-center justify-center rounded-lg bg-danger"
                  >
                    <Text className="text-base font-semibold text-accent-ink">{t('vendors.delete')}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text className="text-title font-semibold text-ink">
                  {editor?.mode === 'edit' ? t('vendors.edit') : t('vendors.create')}
                </Text>
                <Text className="mb-2 mt-4 text-sm font-semibold text-ink">{t('vendors.name')}</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={t('vendors.namePlaceholder')}
                  placeholderTextColor={palette.muted}
                  autoCapitalize="words"
                  className="h-12 rounded-lg border border-line bg-canvas px-4 text-base text-ink"
                />
                <Text className="mb-2 mt-4 text-sm font-semibold text-ink">{t('vendors.phone')}</Text>
                <TextInput
                  value={phone}
                  onChangeText={(value) => setPhone(value.replace(/\D/g, '').slice(0, 15))}
                  placeholder={t('vendors.phonePlaceholder')}
                  placeholderTextColor={palette.muted}
                  keyboardType="phone-pad"
                  className="h-12 rounded-lg border border-line bg-canvas px-4 text-base text-ink"
                />
                {formError ? <Text className="mt-3 text-sm text-danger">{t(`vendors.errors.${formError}`)}</Text> : null}
                <View className="mt-5 flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => setEditor(null)}
                    className="h-12 flex-1 items-center justify-center rounded-lg border border-line bg-canvas disabled:opacity-50"
                  >
                    <Text className="text-base font-semibold text-ink">{t('vendors.cancel')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => {
                      void onSave();
                    }}
                    className="h-12 flex-1 items-center justify-center rounded-lg bg-accent disabled:opacity-50"
                  >
                    {saving ? (
                      <ActivityIndicator color={palette.accentInk} />
                    ) : (
                      <Text className="text-base font-semibold text-accent-ink">{t('vendors.save')}</Text>
                    )}
                  </Pressable>
                </View>
                {editor?.mode === 'edit' ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => setConfirmDelete(true)}
                    className="mt-2 h-12 items-center justify-center"
                  >
                    <Text className="text-base font-semibold text-danger">{t('vendors.delete')}</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </FormSheet>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}
