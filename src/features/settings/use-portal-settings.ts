import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchPortalSettings, updatePortalSettings } from '@/features/list-management/api/server';
import { DEFAULT_PORTAL_SETTINGS } from '@/features/list-management/api/types';
import type { PortalSettings } from '@/features/list-management/api/types';

export function usePortalSettings() {
  return useQuery({
    queryKey: ['portal-settings'],
    queryFn: () => fetchPortalSettings()
  });
}

export function useSavePortalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PortalSettings) => updatePortalSettings({ data }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['portal-settings'], saved);
      void queryClient.invalidateQueries({ queryKey: ['list-upload-options'] });
      toast.success('Settings saved');
    },
    onError: (err: Error) => toast.error(err.message)
  });
}

export function settingsOrDefault(data: PortalSettings | undefined): PortalSettings {
  return data ?? { ...DEFAULT_PORTAL_SETTINGS };
}
