import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';

import { ScreenWrapper } from '../../../src/components/ScreenWrapper';
import { leaveScreen } from '../../../src/navigation/leave';
import {
  getPrintFontSize,
  PRINT_FONT_SIZES,
  savePrintFontSize,
  type PrintFontSize,
} from '../../../src/printing/printFontSize';
import {
  getPrintPaperWidth,
  PRINT_PAPER_WIDTHS,
  savePrintPaperWidth,
  type PrintPaperWidth,
} from '../../../src/printing/printPaperWidth';
import {
  clearRegisteredPrinter,
  getRegisteredPrinter,
  saveRegisteredPrinter,
  type RegisteredPrinter,
} from '../../../src/printing/printerStore';
import { thermalErrorCode } from '../../../src/printing/thermalErrors';
import {
  isThermalPrinterSupported,
  scanThermalPrinters,
  stopThermalPrinterScan,
  testThermalPrinter,
  type ThermalDevice,
} from '../../../src/printing/thermalPrint';
import { useTheme } from '../../../src/theme/theme-context';

type Notice =
  | 'saved'
  | 'tested'
  | 'cleared'
  | 'scanFailed'
  | 'permissionDenied'
  | 'bluetoothOff'
  | 'testFailed'
  | 'unsupported'
  | 'fontSaved'
  | 'paperSaved'
  | null;

const FONT_LABELS: Record<PrintFontSize, 'printer.fontSmall' | 'printer.fontMedium' | 'printer.fontLarge'> = {
  small: 'printer.fontSmall',
  medium: 'printer.fontMedium',
  large: 'printer.fontLarge',
};

const PAPER_LABELS: Record<PrintPaperWidth, 'printer.paper58' | 'printer.paper80'> = {
  58: 'printer.paper58',
  80: 'printer.paper80',
};

export default function PrinterScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const supported = isThermalPrinterSupported();
  const [registered, setRegistered] = useState<RegisteredPrinter | null>(null);
  const [devices, setDevices] = useState<ThermalDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busyAddress, setBusyAddress] = useState<string | null>(null);
  const [printFontSize, setPrintFontSize] = useState<PrintFontSize>('small');
  const [printPaperWidth, setPrintPaperWidth] = useState<PrintPaperWidth>(58);
  const [notice, setNotice] = useState<Notice>(supported ? null : 'unsupported');

  useEffect(() => {
    void getRegisteredPrinter().then(setRegistered);
    void getPrintFontSize().then(setPrintFontSize);
    void getPrintPaperWidth().then(setPrintPaperWidth);
    return () => {
      void stopThermalPrinterScan();
    };
  }, []);

  const scan = useCallback(async () => {
    if (!supported || scanning) {
      return;
    }
    setScanning(true);
    setNotice(null);
    try {
      const result = await scanThermalPrinters();
      const merged = uniqueDevices([...result.paired, ...result.found]);
      setDevices(merged);
      if (merged.length === 0) {
        setNotice('scanFailed');
      }
    } catch (error) {
      const code = thermalErrorCode(error);
      if (code === 'permission') {
        setNotice('permissionDenied');
      } else if (code === 'bluetooth-off') {
        setNotice('bluetoothOff');
      } else if (code === 'unsupported') {
        setNotice('unsupported');
      } else {
        setNotice('scanFailed');
      }
    } finally {
      setScanning(false);
      void stopThermalPrinterScan();
    }
  }, [scanning, supported]);

  const register = useCallback(async (device: ThermalDevice) => {
    const printer: RegisteredPrinter = {
      name: device.name?.trim() || t('printer.unnamed'),
      address: device.address,
    };
    setBusyAddress(device.address);
    setNotice(null);
    try {
      await saveRegisteredPrinter(printer);
      setRegistered(printer);
      setNotice('saved');
    } finally {
      setBusyAddress(null);
    }
  }, [t]);

  const runTest = useCallback(async () => {
    if (!registered) {
      return;
    }
    setBusyAddress(registered.address);
    setNotice(null);
    try {
      await testThermalPrinter(registered);
      setNotice('tested');
    } catch (error) {
      const code = thermalErrorCode(error);
      if (code === 'permission') {
        setNotice('permissionDenied');
      } else if (code === 'bluetooth-off') {
        setNotice('bluetoothOff');
      } else {
        setNotice('testFailed');
      }
    } finally {
      setBusyAddress(null);
    }
  }, [registered]);

  const forget = useCallback(async () => {
    await clearRegisteredPrinter();
    setRegistered(null);
    setNotice('cleared');
  }, []);

  const setFontSize = useCallback(async (size: PrintFontSize) => {
    if (size === printFontSize) {
      return;
    }
    setPrintFontSize(size);
    setNotice(null);
    await savePrintFontSize(size);
    setNotice('fontSaved');
  }, [printFontSize]);

  const setPaperWidth = useCallback(async (width: PrintPaperWidth) => {
    if (width === printPaperWidth) {
      return;
    }
    setPrintPaperWidth(width);
    setNotice(null);
    await savePrintPaperWidth(width);
    setNotice('paperSaved');
  }, [printPaperWidth]);

  const noticeText = useMemo(() => {
    switch (notice) {
      case 'saved':
        return t('printer.saved');
      case 'tested':
        return t('printer.tested');
      case 'cleared':
        return t('printer.cleared');
      case 'scanFailed':
        return t('printer.scanFailed');
      case 'permissionDenied':
        return t('printer.permissionDenied');
      case 'bluetoothOff':
        return t('printer.bluetoothOff');
      case 'testFailed':
        return t('printer.testFailed');
      case 'unsupported':
        return t('printer.unsupported');
      case 'fontSaved':
        return t('printer.fontSaved');
      case 'paperSaved':
        return t('printer.paperSaved');
      default:
        return null;
    }
  }, [notice, t]);

  return (
    <ScreenWrapper padded={false}>
      <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4 pb-10">
        <View>
          <Text className="text-title font-semibold text-ink">{t('printer.title')}</Text>
          <Text className="mt-1 text-sm text-muted">{t('printer.body')}</Text>
        </View>

        <View className="overflow-hidden rounded-lg border border-line bg-surface px-4 py-3">
          <Text className="text-sm font-semibold text-muted">{t('printer.registered')}</Text>
          {registered ? (
            <>
              <Text className="mt-2 text-base font-semibold text-ink">{registered.name}</Text>
              <Text className="mt-0.5 text-sm text-muted">{registered.address}</Text>
              <Text className="mt-2 text-sm text-muted">
                {t('printer.paperActive', { mm: printPaperWidth })}
              </Text>
              <View className="mt-3 flex-row gap-2">
                <ActionChip
                  label={t('printer.test')}
                  icon="print-outline"
                  disabled={busyAddress !== null}
                  busy={busyAddress === registered.address}
                  onPress={() => void runTest()}
                />
                <ActionChip
                  label={t('printer.forget')}
                  icon="trash-outline"
                  disabled={busyAddress !== null}
                  danger
                  onPress={() => void forget()}
                />
              </View>
            </>
          ) : (
            <Text className="mt-2 text-sm text-muted">{t('printer.none')}</Text>
          )}
        </View>

        <View className="overflow-hidden rounded-lg border border-line bg-surface px-4 py-3">
          <Text className="text-sm font-semibold text-muted">{t('printer.paperSize')}</Text>
          <Text className="mt-1 text-sm text-muted">{t('printer.paperSizeHint')}</Text>
          <View className="mt-3 flex-row gap-1 rounded-lg bg-canvas p-1">
            {PRINT_PAPER_WIDTHS.map((width) => {
              const selected = printPaperWidth === width;
              return (
                <Pressable
                  key={width}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(PAPER_LABELS[width])}
                  onPress={() => void setPaperWidth(width)}
                  className={`h-10 min-w-0 flex-1 items-center justify-center rounded-lg px-1 ${
                    selected ? 'bg-accent' : ''
                  }`}
                >
                  <Text
                    numberOfLines={1}
                    className={`text-[13px] font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}
                  >
                    {t(PAPER_LABELS[width])}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="overflow-hidden rounded-lg border border-line bg-surface px-4 py-3">
          <Text className="text-sm font-semibold text-muted">{t('printer.fontSize')}</Text>
          <Text className="mt-1 text-sm text-muted">{t('printer.fontSizeHint')}</Text>
          <View className="mt-3 flex-row gap-1 rounded-lg bg-canvas p-1">
            {PRINT_FONT_SIZES.map((size) => {
              const selected = printFontSize === size;
              return (
                <Pressable
                  key={size}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(FONT_LABELS[size])}
                  onPress={() => void setFontSize(size)}
                  className={`h-10 min-w-0 flex-1 items-center justify-center rounded-lg px-1 ${
                    selected ? 'bg-accent' : ''
                  }`}
                >
                  <Text
                    numberOfLines={1}
                    className={`text-[13px] font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}
                  >
                    {t(FONT_LABELS[size])}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {supported ? (
          <View className="overflow-hidden rounded-lg border border-line bg-surface">
            <View className="flex-row items-center justify-between gap-3 border-b border-line px-4 py-3">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold text-muted">{t('printer.nearby')}</Text>
                <Text className="mt-0.5 text-sm text-muted">{t('printer.nearbyHint')}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('printer.scan')}
                disabled={scanning}
                onPress={() => void scan()}
                className="h-10 flex-row items-center gap-1.5 rounded-lg bg-accent px-3"
              >
                {scanning ? (
                  <ActivityIndicator color={palette.accentInk} />
                ) : (
                  <Ionicons name="bluetooth-outline" size={16} color={palette.accentInk} />
                )}
                <Text className="text-sm font-semibold text-accent-ink">
                  {scanning ? t('printer.scanning') : t('printer.scan')}
                </Text>
              </Pressable>
            </View>
            {devices.length === 0 ? (
              <Text className="px-4 py-4 text-sm text-muted">{t('printer.emptyScan')}</Text>
            ) : (
              devices.map((device, index) => {
                const selected = registered?.address === device.address;
                const last = index === devices.length - 1;
                return (
                  <Pressable
                    key={`${device.address}-${device.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={busyAddress !== null}
                    onPress={() => void register(device)}
                    className={`min-h-14 flex-row items-center gap-3 px-4 py-3 ${last ? '' : 'border-b border-line'}`}
                  >
                    <View className="h-9 w-9 items-center justify-center rounded-lg bg-canvas">
                      {busyAddress === device.address ? (
                        <ActivityIndicator color={palette.accent} />
                      ) : (
                        <Ionicons
                          name={selected ? 'checkmark-circle' : 'print-outline'}
                          size={18}
                          color={selected ? palette.accent : palette.ink}
                        />
                      )}
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="text-base font-semibold text-ink">
                        {device.name?.trim() || t('printer.unnamed')}
                      </Text>
                      <Text className="mt-0.5 text-sm text-muted" numberOfLines={1}>
                        {device.address}
                      </Text>
                    </View>
                    <Text className="text-xs font-semibold uppercase text-muted">
                      {device.deviceType === 'ble' ? 'BLE' : 'BT'}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        ) : null}

        {noticeText ? (
          <Text
            className={`text-center text-sm ${
              notice === 'scanFailed' ||
              notice === 'permissionDenied' ||
              notice === 'bluetoothOff' ||
              notice === 'testFailed' ||
              notice === 'unsupported'
                ? 'text-danger'
                : 'text-muted'
            }`}
          >
            {noticeText}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => leaveScreen('/menu')}
          className="h-12 flex-row items-center justify-center gap-2 rounded-lg border border-line bg-surface"
        >
          <Ionicons name="arrow-back" size={18} color={palette.ink} />
          <Text className="text-base font-semibold text-ink">{t('common.back')}</Text>
        </Pressable>

        {Platform.OS === 'android' ? (
          <Text className="text-center text-xs text-muted">{t('printer.pairHint')}</Text>
        ) : null}
      </ScrollView>
    </ScreenWrapper>
  );
}

function uniqueDevices(devices: ThermalDevice[]): ThermalDevice[] {
  const seen = new Set<string>();
  const list: ThermalDevice[] = [];
  for (const device of devices) {
    const key = device.address.trim().toUpperCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    list.push(device);
  }
  return list.sort((a, b) => (a.name || a.address).localeCompare(b.name || b.address));
}

function ActionChip({
  label,
  icon,
  onPress,
  disabled = false,
  busy = false,
  danger = false,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
}) {
  const { palette } = useTheme();
  const color = danger ? palette.danger : palette.ink;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-line px-2 ${
        danger ? 'bg-canvas' : 'bg-canvas'
      }`}
    >
      {busy ? <ActivityIndicator color={color} /> : <Ionicons name={icon} size={16} color={color} />}
      <Text className={`text-sm font-semibold ${danger ? 'text-danger' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}
