import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchPortalSettings, syncPortalExtraColumnsFn, updatePortalSettings } from '@/features/list-management/api/server';
import { DEFAULT_PORTAL_SETTINGS } from '@/features/list-management/api/types';
import type { PortalSettings } from '@/features/list-management/api/types';

export function usePortalSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['portal-settings'],
    queryFn: () => fetchPortalSettings(),
    staleTime: 5 * 60_000
  });

  // Once per Settings visit: pull Extra columns from record attrs into portal_settings.
  React.useEffect(() => {
    if (!query.isSuccess) return;
    let cancelled = false;
    void syncPortalExtraColumnsFn()
      .then((synced) => {
        if (cancelled) return;
        queryClient.setQueryData(['portal-settings'], synced);
        queryClient.setQueryData(['list-upload-meta'], (old: unknown) => {
          if (!old || typeof old !== 'object') return old;
          return { ...(old as Record<string, unknown>), settings: synced };
        });
      })
      .catch(() => {
        /* keep fast settings if sync fails */
      });
    return () => {
      cancelled = true;
    };
  }, [query.isSuccess, queryClient]);

  return query;
}

export function useSavePortalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PortalSettings) => updatePortalSettings({ data }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['portal-settings'], saved);
      void queryClient.invalidateQueries({ queryKey: ['list-upload-meta'] });
      void queryClient.invalidateQueries({ queryKey: ['records-list'] });
      toast.success('Settings saved');
    },
    onError: (err: Error) => toast.error(err.message)
  });
}

export function settingsOrDefault(data: PortalSettings | undefined): PortalSettings {
  return data ?? { ...DEFAULT_PORTAL_SETTINGS };
}
