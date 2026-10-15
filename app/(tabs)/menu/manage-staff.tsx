import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { StaffFormModal } from '../../../src/components/StaffFormModal';
import { useAuth } from '../../../src/context/AuthContext';
import { useTheme } from '../../../src/theme/theme-context';
import type { User } from '../../../src/domain/models/auth';
import { useManageStaff } from '../../../src/domain/usecases/ManageStaffUseCase';

type EditorState = { mode: 'create' } | { mode: 'edit'; staff: User } | null;

export default function ManageStaffScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const { currentUser, isReady } = useAuth();
  const { staff, isLoading, error, forbidden, createStaff, updateStaff, setStaffActive } = useManageStaff();
  const [editor, setEditor] = useState<EditorState>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<User | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isReady) {
    return null;
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  if (currentUser.role !== 'ADMIN' || forbidden) {
    return <Redirect href="/home" />;
  }

  const activeStaff = staff.filter((member) => member.isActive);
  const inactiveStaff = staff.filter((member) => !member.isActive);

  const onSubmit = async (values: { name: string; mobileNumber: string; mpin: string }) => {
    setSaving(true);
    setFormError(null);
    try {
      if (!editor || editor.mode === 'create') {
        await createStaff(values);
      } else {
        await updateStaff({
          id: editor.staff.id,
          name: values.name,
          mobileNumber: values.mobileNumber,
          mpin: values.mpin,
          isActive: editor.staff.isActive,
        });
      }
      setEditor(null);
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : t('staff.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const changeAccess = (member: User, isActive: boolean) => {
    const run = () => {
      void setStaffActive(member.id, isActive).catch((changeError: unknown) => {
        setFormError(changeError instanceof Error ? changeError.message : t('staff.updateError'));
      });
    };

    if (isActive) {
      run();
      return;
    }

    setPendingDeactivate(member);
  };

  return (
    <ScreenWrapper showBackButton padded={false}>
      <View className="relative flex-1">
        <FlatList
          data={[...activeStaff, ...inactiveStaff]}
          keyExtractor={(item) => item.id}
          className="flex-1"
          contentContainerClassName="p-4 pb-10"
          ListHeaderComponent={
            <View className="pb-4">
              <Text className="text-display font-semibold text-ink">{t('staff.title')}</Text>
              <Text className="mt-2 text-body text-muted">{t('staff.body')}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFormError(null);
                  setEditor({ mode: 'create' });
                }}
                className="mt-5 h-14 items-center justify-center rounded-lg bg-accent"
              >
                <Text className="text-body font-semibold text-accent-ink">{t('staff.add')}</Text>
              </Pressable>
              {error ? <Text className="mt-4 text-sm text-danger">{error}</Text> : null}
              {formError ? <Text className="mt-4 text-sm text-danger">{formError}</Text> : null}
              {isLoading ? <ActivityIndicator className="mt-6" color={palette.accent} /> : null}
            </View>
          }
          renderItem={({ item, index }) => (
            <View>
              {index === 0 && activeStaff.length > 0 ? <SectionLabel label={t('staff.active')} /> : null}
              {index === activeStaff.length && inactiveStaff.length > 0 ? (
                <SectionLabel label={t('staff.inactive')} />
              ) : null}
              <View className="mb-3 rounded-3xl border border-line bg-surface p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-ink">{item.name}</Text>
                    <Text className="mt-1 text-sm text-muted">{formatMobile(item.mobileNumber)}</Text>
                  </View>
                  <Text className={item.isActive ? 'text-sm font-semibold text-success' : 'text-sm text-muted'}>
                    {item.isActive ? t('staff.active') : t('staff.inactive')}
                  </Text>
                </View>
                <View className="mt-4 flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setFormError(null);
                      setEditor({ mode: 'edit', staff: item });
                    }}
                    className="h-12 flex-1 items-center justify-center rounded-lg border border-line bg-canvas"
                  >
                    <Text className="text-base font-semibold text-ink">{t('staff.edit')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => changeAccess(item, !item.isActive)}
                    className="h-12 flex-1 items-center justify-center rounded-lg border border-line bg-canvas"
                  >
                    <Text className="text-base font-semibold text-ink">
                      {item.isActive ? t('staff.deactivate') : t('staff.activate')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            isLoading ? null : <Text className="text-center text-body text-muted">{t('staff.empty')}</Text>
          }
        />

        <StaffFormModal
          visible={editor !== null}
          title={editor?.mode === 'edit' ? t('staff.editTitle') : t('staff.createTitle')}
          submitLabel={editor?.mode === 'edit' ? t('staff.saveSubmit') : t('staff.createSubmit')}
          requireMpin={editor?.mode !== 'edit'}
          initialValues={{
            name: editor?.mode === 'edit' ? editor.staff.name : '',
            mobileNumber: editor?.mode === 'edit' ? editor.staff.mobileNumber : '',
            mpin: '',
          }}
          error={formError}
          saving={saving}
          onClose={() => {
            if (!saving) {
              setEditor(null);
              setFormError(null);
            }
          }}
          onSubmit={(values) => {
            void onSubmit(values);
          }}
        />

        {pendingDeactivate ? (
          <View className="absolute inset-0 items-center justify-center bg-black/70 px-5">
            <View className="w-full max-w-md rounded-3xl border border-line bg-surface p-5">
              <Text className="text-title font-semibold text-ink">
                {t('staff.deactivateTitle', { name: pendingDeactivate.name })}
              </Text>
              <Text className="mt-2 text-body text-muted">{t('staff.deactivateBody')}</Text>
              <View className="mt-6 flex-row gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPendingDeactivate(null)}
                  className="h-14 flex-1 items-center justify-center rounded-lg border border-line bg-canvas"
                >
                  <Text className="text-base font-semibold text-ink">{t('staff.cancel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const member = pendingDeactivate;
                    setPendingDeactivate(null);
                    void setStaffActive(member.id, false).catch((changeError: unknown) => {
                      setFormError(changeError instanceof Error ? changeError.message : t('staff.updateError'));
                    });
                  }}
                  className="h-14 flex-1 items-center justify-center rounded-lg bg-danger"
                >
                  <Text className="text-base font-semibold text-accent-ink">{t('staff.deactivate')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </ScreenWrapper>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text className="mb-3 mt-2 text-sm font-semibold text-muted">{label}</Text>;
}

function formatMobile(value: string): string {
  return value.replace(/(\d{5})(\d{5})/, '$1 $2');
}
