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
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { ActionRow } from '../../../src/components/FormActions';
import { FormSheet } from '../../../src/components/FormScreen';
import { useAuth } from '../../../src/context/AuthContext';
import { inventoryErrorCode, type InventoryErrorCode } from '../../../src/domain/errors';
import { knownTermLabel, type CatalogTerm } from '../../../src/domain/models/inventory';
import { type CatalogTermKind } from '../../../src/data/repositories/inventoryRepository';
import { useCatalog } from '../../../src/hooks/useCatalog';
import { leaveScreen } from '../../../src/navigation/leave';
import { useTheme } from '../../../src/theme/theme-context';

type EditorState = { mode: 'create' } | { mode: 'edit'; term: CatalogTerm } | null;

export default function ManageTermsScreen() {
  const { t } = useTranslation();
  const { palette, themeStyle } = useTheme();
  const { currentUser, isReady } = useAuth();
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  const kindParam = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const kind: CatalogTermKind = kindParam === 'strength' ? 'strength' : 'type';
  const { itemTypes, itemStrengths, isLoading, errorCode, isAdmin, saveTerm, removeTerm } = useCatalog();
  const terms = kind === 'strength' ? itemStrengths : itemTypes;
  const labelKind = kind === 'strength' ? 'subTypes' : 'types';
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<InventoryErrorCode | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return terms;
    }
    return terms.filter((term) => term.name.toLowerCase().includes(needle));
  }, [query, terms]);

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
    setFormError(null);
    setConfirmDelete(false);
    setEditor({ mode: 'create' });
  };

  const openEdit = (term: CatalogTerm) => {
    setName(term.name);
    setFormError(null);
    setConfirmDelete(false);
    setEditor({ mode: 'edit', term });
  };

  const onSave = async () => {
    if (!editor || saving) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveTerm(kind, editor.mode === 'edit' ? editor.term.id : null, name);
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
      await removeTerm(kind, editor.term.id);
      setEditor(null);
    } catch (error) {
      setFormError(inventoryErrorCode(error));
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  const title = kind === 'strength' ? t('terms.strengthTitle') : t('terms.typeTitle');
  const body = kind === 'strength' ? t('terms.strengthBody') : t('terms.typeBody');
  const addLabel = kind === 'strength' ? t('terms.addStrength') : t('terms.addType');
  const emptyLabel = kind === 'strength' ? t('terms.emptyStrength') : t('terms.emptyType');
  const editorTitle =
    editor?.mode === 'edit'
      ? kind === 'strength'
        ? t('terms.editStrength')
        : t('terms.editType')
      : kind === 'strength'
        ? t('terms.createStrength')
        : t('terms.createType');

  return (
    <ScreenWrapper padded={false}>
      <View className="flex-1">
        <View className="px-4 pb-3 pt-4">
          <Text className="text-title font-semibold text-ink">{title}</Text>
          <Text className="mt-1 text-sm text-muted">{body}</Text>
          <View className="mt-3 h-11 flex-row items-center rounded-lg border border-line bg-surface px-3">
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('terms.search')}
              placeholderTextColor={palette.muted}
              autoCorrect={false}
              className="h-11 min-w-0 flex-1 py-0 text-base text-ink"
            />
          </View>
          {errorCode ? <Text className="mt-3 text-sm text-danger">{t(`terms.errors.${errorCode}`)}</Text> : null}
        </View>

        {isLoading ? (
          <ActivityIndicator className="mt-6" color={palette.accent} />
        ) : (
          <ScrollView className="flex-1" contentContainerClassName="pb-8" keyboardShouldPersistTaps="handled">
            {visible.length === 0 ? (
              <Text className="px-6 pt-8 text-center text-base text-muted">
                {query.trim() ? t('terms.emptySearch') : emptyLabel}
              </Text>
            ) : (
              visible.map((term) => (
                <Pressable
                  key={term.id}
                  accessibilityRole="button"
                  onPress={() => openEdit(term)}
                  className="min-h-14 justify-center border-b border-line px-4 py-3"
                >
                  <Text className="text-base font-medium text-ink">{knownTermLabel(labelKind, term.name, t)}</Text>
                  {knownTermLabel(labelKind, term.name, t) !== term.name ? (
                    <Text className="mt-0.5 text-[13px] text-muted">{term.name}</Text>
                  ) : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        )}
      </View>
      <ActionRow
        pinned
        leading={{ label: t('common.cancel'), onPress: () => leaveScreen('/menu') }}
        trailing={{ label: addLabel, onPress: openCreate, tone: 'accent' }}
      />

      <Modal visible={editor !== null} transparent animationType="slide" onRequestClose={() => !saving && setEditor(null)}>
        <View style={themeStyle} className="flex-1 justify-end bg-black/70">
          <Pressable accessibilityRole="button" className="flex-1" onPress={() => !saving && setEditor(null)} />
          <FormSheet>
            {confirmDelete && editor?.mode === 'edit' ? (
              <>
                <Text className="text-title font-semibold text-ink">{t('terms.deleteTitle', { name: editor.term.name })}</Text>
                <Text className="mt-2 text-body text-muted">{t('terms.deleteBody')}</Text>
                <View className="mt-6 flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => setConfirmDelete(false)}
                    className="h-12 flex-1 items-center justify-center rounded-lg border border-line bg-canvas"
                  >
                    <Text className="text-base font-semibold text-ink">{t('terms.cancel')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => {
                      void onDelete();
                    }}
                    className="h-12 flex-1 items-center justify-center rounded-lg bg-danger"
                  >
                    <Text className="text-base font-semibold text-accent-ink">{t('terms.delete')}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text className="text-title font-semibold text-ink">{editorTitle}</Text>
                <Text className="mb-2 mt-4 text-sm font-semibold text-ink">{t('terms.name')}</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={kind === 'strength' ? t('terms.strengthPlaceholder') : t('terms.typePlaceholder')}
                  placeholderTextColor={palette.muted}
                  autoCorrect={false}
                  className="h-12 rounded-lg border border-line bg-canvas px-4 text-base text-ink"
                />
                {formError ? <Text className="mt-3 text-sm text-danger">{t(`terms.errors.${formError}`)}</Text> : null}
                <View className="mt-6 flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => setEditor(null)}
                    className="h-12 flex-1 items-center justify-center rounded-lg border border-line bg-canvas disabled:opacity-50"
                  >
                    <Text className="text-base font-semibold text-ink">{t('terms.cancel')}</Text>
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
                      <Text className="text-base font-semibold text-accent-ink">{t('terms.save')}</Text>
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
                    <Text className="text-base font-semibold text-danger">{t('terms.delete')}</Text>
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
