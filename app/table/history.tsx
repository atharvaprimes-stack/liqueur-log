import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BillHistoryPane } from '../../src/components/BillHistoryPane';
import { ActionRow } from '../../src/components/FormActions';
import { ScreenWrapper } from '../../src/components/ScreenWrapper';
import { leaveScreen } from '../../src/navigation/leave';
import { useAuth } from '../../src/context/AuthContext';

export default function BillHistoryScreen() {
  const { t } = useTranslation();
  const { currentUser, isReady } = useAuth();

  if (!isReady) {
    return null;
  }
  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  return (
    <ScreenWrapper padded={false}>
      <View className="flex-1">
        <BillHistoryPane parent="/table/history" />
        <ActionRow
          pinned
          leading={{ label: t('common.cancel'), onPress: () => leaveScreen('/tables') }}
        />
      </View>
    </ScreenWrapper>
  );
}
