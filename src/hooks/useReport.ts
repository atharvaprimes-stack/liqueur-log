import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '../context/auth-context';
import { loadReportSource } from '../data/repositories/reportRepository';
import {
  buildBusinessReport,
  resolveReportBounds,
  type BusinessReport,
  type ReportPreset,
} from '../domain/reports';

export function useReport(preset: ReportPreset, fromKey: string, toKey: string): {
  report: BusinessReport | null;
  isLoading: boolean;
  failed: boolean;
  invalidRange: boolean;
  reload: () => Promise<void>;
} {
  const { currentUser, currentTenant } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;
  const [report, setReport] = useState<BusinessReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [invalidRange, setInvalidRange] = useState(false);
  const request = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const ticket = ++request.current;
    if (!tenantId || !currentTenant) {
      setReport(null);
      setFailed(false);
      setInvalidRange(false);
      setIsLoading(false);
      return;
    }

    const bounds = resolveReportBounds(preset, fromKey, toKey);
    if (!bounds) {
      setReport(null);
      setFailed(false);
      setInvalidRange(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const source = await loadReportSource(tenantId, bounds);
      if (ticket !== request.current) {
        return;
      }
      setReport(
        buildBusinessReport(
          source,
          {
            businessName: currentTenant.businessName,
            licenseNumber: currentTenant.licenseNumber,
            address: currentTenant.address,
          },
          bounds,
        ),
      );
      setFailed(false);
      setInvalidRange(false);
      setIsLoading(false);
    } catch {
      if (ticket !== request.current) {
        return;
      }
      setFailed(true);
      setIsLoading(false);
    }
  }, [currentTenant, fromKey, preset, tenantId, toKey]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { report, isLoading, failed, invalidRange, reload: load };
}
