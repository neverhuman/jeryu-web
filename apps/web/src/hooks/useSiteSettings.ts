// useSiteSettings.ts — instance-wide settings (`GET /api/v1/site-settings`).
//
// The left navigation asks on every page, so the answer is cached for a
// minute and never retried: an older server without the route answers 404
// once, and the navigation then simply has no wiki link.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { SiteSettings } from '../api/types/wiki';

export const SITE_SETTINGS_KEY: readonly string[] = ['site-settings'];

export function useSiteSettings(): UseQueryResult<SiteSettings, Error> {
  return useQuery({
    queryKey: SITE_SETTINGS_KEY,
    queryFn: ({ signal }) => apiGet<SiteSettings>(endpoints.siteSettings(), { signal }),
    staleTime: 60_000,
    retry: false,
  });
}
