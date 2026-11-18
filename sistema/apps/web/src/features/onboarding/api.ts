import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OnboardingConfirmInput,
  OnboardingDocument,
  OnboardingHistoryResponse,
  OnboardingLinkCreated,
  OnboardingLinkInput,
  OnboardingOverridesInput,
  OnboardingOverridesResponse,
  OnboardingTemplateInput,
  OnboardingTemplateResponse,
  PublicOnboardingConfirmResponse,
  PublicOnboardingResponse,
} from '@effinance/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

// Client onboarding (docs/api.md, "Onboarding do cliente"): the office's template, a client's
// adjustment, the preview, the links and the public page.

export function useOnboardingTemplate(enabled = true) {
  return useQuery({
    queryKey: qk.onboardingTemplate,
    queryFn: () => api<OnboardingTemplateResponse>('/onboarding/template'),
    enabled,
  });
}

export function useSaveOnboardingTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OnboardingTemplateInput) =>
      api<OnboardingTemplateResponse>('/onboarding/template', { method: 'PUT', body: input }),
    onSuccess: (data) => {
      qc.setQueryData(qk.onboardingTemplate, data);
      // Every client's preview depends on the template.
      return qc.invalidateQueries({ queryKey: ['clients', 'onboarding'] });
    },
  });
}

export function useOnboardingOverrides(clientId: string, enabled = true) {
  return useQuery({
    queryKey: qk.onboardingOverrides(clientId),
    queryFn: () => api<OnboardingOverridesResponse>(`/clients/${clientId}/onboarding/overrides`),
    enabled,
  });
}

export function useSaveOnboardingOverrides(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OnboardingOverridesInput) =>
      api<OnboardingOverridesResponse>(`/clients/${clientId}/onboarding/overrides`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: (data) => {
      qc.setQueryData(qk.onboardingOverrides(clientId), data);
      return qc.invalidateQueries({ queryKey: qk.onboardingDocument(clientId) });
    },
  });
}

/** "Ver onboarding": the current document (does not record an access). */
export function useOnboardingDocument(clientId: string, enabled = true) {
  return useQuery({
    queryKey: qk.onboardingDocument(clientId),
    queryFn: () => api<OnboardingDocument>(`/clients/${clientId}/onboarding/document`),
    enabled,
  });
}

export function useOnboardingHistory(clientId: string) {
  return useQuery({
    queryKey: qk.onboardingHistory(clientId),
    queryFn: () => api<OnboardingHistoryResponse>(`/clients/${clientId}/onboarding`),
  });
}

export function useCreateOnboardingLink(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OnboardingLinkInput) =>
      api<OnboardingLinkCreated>(`/clients/${clientId}/onboarding/links`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.onboardingHistory(clientId) }),
  });
}

export function useRevokeOnboardingLink(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      api<void>(`/clients/${clientId}/onboarding/links/${linkId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.onboardingHistory(clientId) }),
  });
}

/** The public page (no session): records an access on the server, so it never refetches by itself. */
export function usePublicOnboarding(token: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.publicOnboarding(token),
    queryFn: () => api<PublicOnboardingResponse>(`/public/onboarding/${token}`),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

export function useConfirmOnboarding(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OnboardingConfirmInput) =>
      api<PublicOnboardingConfirmResponse>(`/public/onboarding/${token}/confirm`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (data) =>
      qc.setQueryData<PublicOnboardingResponse>(qk.publicOnboarding(token), (prev) =>
        prev ? { ...prev, confirmedAt: data.confirmedAt } : prev,
      ),
  });
}
