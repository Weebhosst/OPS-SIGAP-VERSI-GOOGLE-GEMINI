/**
 * OPS SIGAP — Frontend API Client
 */

import {
  User,
  PatrolSession,
  PatrolLog,
  ShiftHandover,
  IncidentReport,
  MediaGalleryItem,
  RadiusCalibration,
  AuditLog,
  AdminFilterState,
  AdminKpis,
  ShiftInfo,
  Customer,
  Site,
  ValidationAlert,
} from '../types/ops';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    throw new ApiError(data.error || 'Terjadi kesalahan sistem', res.status);
  }

  return data;
}

export const api = {
  // Auth
  login: (npk: string, password: string) =>
    request<{ success: boolean; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ npk, password }),
    }),

  getMe: () => request<{ success: boolean; user: User }>('/auth/me'),

  logout: () =>
    request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean; user: User }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  resetPasswordToNpk: (userId: string) =>
    request<{ success: boolean; message: string }>('/auth/reset-password-npk', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  // Patrol
  getShiftProgress: () =>
    request<{
      success: boolean;
      shift: ShiftInfo;
      targetRounds: number;
      completedRounds: number;
      activeSession?: PatrolSession;
      isTargetAchieved: boolean;
    }>('/patrol/shift-progress'),

  getCurrentSession: () =>
    request<{
      success: boolean;
      hasOpenSession: boolean;
      session: PatrolSession | null;
      checkpoints: any[];
      logs?: PatrolLog[];
      targetRounds?: number;
      currentRound?: number;
      rounds?: Array<{ roundNumber: number; completed: number; required: number; checkpointIds: string[] }>;
    }>('/patrol/current'),

  startPatrolSession: () =>
    request<{ success: boolean; session: PatrolSession }>('/patrol/session/start', {
      method: 'POST',
    }),

  submitStartDocumentation: (sessionId: string, photoUrl: string) =>
    request<{ success: boolean; session: PatrolSession }>(`/patrol/session/${sessionId}/start-documentation`, { method: 'POST', body: JSON.stringify({ photoUrl }) }),

  closePatrolSession: (sessionId: string, payload: { endPhotoUrl: string; hasSpecialHandover: boolean; specialNotes?: string; specialPhotoUrls?: string[] }) =>
    request<{ success: boolean; session: PatrolSession; progress?: { completed: number; target: number }; missingCheckpoints?: Array<{ code: string; name: string }> }>(`/patrol/session/${sessionId}/close`, { method: 'POST', body: JSON.stringify(payload) }),

  submitPatrolScan: (payload: {
    sessionId: string;
    qrToken: string;
    latitude: number;
    longitude: number;
    gpsAccuracyM?: number;
    photoUrl?: string;
    observationStatus?: 'AMAN' | 'TEMUAN' | 'INSIDEN';
    notes?: string;
    clientCapturedAt?: string;
    syncSource?: 'ONLINE' | 'OFFLINE_QUEUE';
    idempotencyId?: string;
  }) =>
    request<{
      success: boolean;
      status: 'VALID' | 'REVIEW' | 'REJECTED';
      rejectionReason?: string;
      rejectionMessage?: string;
      calculatedDistanceM: number;
      checkpointId?: string;
      checkpointCode?: string;
      checkpointName?: string;
      sessionCompleted: boolean;
      totalValid: number;
      totalRequired: number;
      completionPct: number;
      log: PatrolLog;
      session?: PatrolSession;
    }>('/patrol/scan', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPatrolSessions: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ success: boolean; sessions: PatrolSession[] }>(`/patrol/sessions${qs}`);
  },

  // Handover
  getHandovers: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ success: boolean; handovers: ShiftHandover[] }>(`/handover${qs}`);
  },

  createHandover: (payload: Partial<ShiftHandover>) =>
    request<{ success: boolean; handover: ShiftHandover }>('/handover', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  ackHandover: (id: string) =>
    request<{ success: boolean; handover: ShiftHandover }>(`/handover/${id}/ack`, {
      method: 'POST',
    }),

  // Incidents
  getIncidents: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ success: boolean; incidents: IncidentReport[] }>(`/incidents${qs}`);
  },

  createIncident: (payload: Partial<IncidentReport>) =>
    request<{ success: boolean; incident: IncidentReport }>('/incidents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateIncidentStatus: (id: string, status: string, followUp?: string) =>
    request<{ success: boolean; incident: IncidentReport }>(`/incidents/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, followUp }),
    }),

  // Gallery
  getGallery: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ success: boolean; media: MediaGalleryItem[]; counts: Record<string, number>; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>(`/gallery${qs}`);
  },

  getActiveSessions: () => request<{ success: boolean; sites: Array<Site & { activeCount: number; capacityStatus: 'FULL' | 'AVAILABLE'; sessions: Array<PatrolSession & { memberName: string; npk: string }> }> }>('/monitoring/active-sessions'),

  forceCloseSession: (id: string, reason: string) =>
    request<{ success: boolean; session: PatrolSession }>(`/admin/sessions/${id}/force-close`, { method: 'POST', body: JSON.stringify({ reason }) }),

  getMasters: () => request<{ success: boolean; customers: Customer[]; sites: Array<Site & { activeCount: number }>; personnel: User[]; checkpoints: any[] }>('/admin/masters'),
  createCustomer: (payload: { code: string; name: string }) => request<{ success: boolean; customer: Customer }>('/admin/customers', { method: 'POST', body: JSON.stringify(payload) }),
  updateCustomer: (id: string, payload: Partial<Customer>) => request<{ success: boolean; customer: Customer }>(`/admin/customers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  createSite: (payload: { code: string; name: string; customerId: string; personnelCapacity: number; targetRoundsPerShift?: number }) => request<{ success: boolean; site: Site }>('/admin/sites', { method: 'POST', body: JSON.stringify(payload) }),
  updateSite: (id: string, payload: Partial<Site>) => request<{ success: boolean; site: Site }>(`/admin/sites/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  generateCheckpointToken: (id: string) => request<{ success: boolean; token: string }>(`/admin/checkpoints/${id}/generate-token`, { method: 'POST' }),
  generateCheckpointQr: (id: string) => request<{ success: boolean; qrPayload: string }>(`/admin/checkpoints/${id}/generate-qr`, { method: 'POST' }),

  // Admin Command Center
  getCommandCenter: () =>
    request<{
      success: boolean;
      filterState: AdminFilterState;
      kpis: AdminKpis;
      panels: {
        activePatrols: PatrolSession[];
        validationAlerts: ValidationAlert[];
        recentHandovers: ShiftHandover[];
        criticalIncidents: IncidentReport[];
        recentMedia: MediaGalleryItem[];
      };
      options: {
        sites: any[];
        users: any[];
        shifts: { code: string; name: string }[];
      };
    }>('/admin/command-center'),

  updateValidationAlert: (id: string, action: 'REVIEW' | 'CLOSE' | 'REOPEN', closeNote?: string) =>
    request<{ success: boolean; alert: ValidationAlert }>(`/admin/validation-alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ action, closeNote }) }),

  deleteValidationAlert: (id: string) =>
    request<{ success: boolean; deletedId: string }>(`/admin/validation-alerts/${id}`, { method: 'DELETE' }),

  setAdminFilter: (filter: Partial<AdminFilterState>) =>
    request<{ success: boolean; filterState: AdminFilterState }>('/admin/filter-state', {
      method: 'POST',
      body: JSON.stringify(filter),
    }),

  resetAdminFilter: () =>
    request<{ success: boolean; filterState: AdminFilterState }>('/admin/filter-state/reset', {
      method: 'POST',
    }),

  // Admin Users
  getAdminUsers: () => request<{ success: boolean; users: User[] }>('/admin/users'),

  createAdminUser: (payload: Partial<User>) =>
    request<{ success: boolean; user: User }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAdminUser: (id: string, payload: Partial<User>) =>
    request<{ success: boolean; user: User }>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Admin Checkpoints
  getAdminCheckpoints: () => request<{ success: boolean; checkpoints: any[] }>('/admin/checkpoints'),

  createAdminCheckpoint: (payload: any) =>
    request<{ success: boolean; checkpoint: any }>('/admin/checkpoints', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAdminCheckpoint: (id: string, payload: any) =>
    request<{ success: boolean; checkpoint: any }>(`/admin/checkpoints/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  regenerateCheckpointQr: (id: string) =>
    request<{ success: boolean; message: string; newToken: string }>(
      `/admin/checkpoints/${id}/regenerate-qr`,
      {
        method: 'POST',
      }
    ),

  // Admin Radius Calibration
  getRadiusCalibrations: () =>
    request<{ success: boolean; calibrations: RadiusCalibration[] }>('/admin/radius-calibrations'),

  createRadiusCalibration: (payload: Partial<RadiusCalibration>) =>
    request<{ success: boolean; calibration: RadiusCalibration }>('/admin/radius-calibrations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Admin Audit Logs
  getAuditLogs: () => request<{ success: boolean; logs: AuditLog[] }>('/admin/audit-logs'),

  overrideValidation: (logId: string, newStatus: string, reason: string) =>
    request<{ success: boolean; log: PatrolLog }>('/admin/override-validation', {
      method: 'POST',
      body: JSON.stringify({ logId, newStatus, reason }),
    }),

  // Sync offline queue
  syncQueue: (items: any[]) =>
    request<{ success: boolean; processed: number; results: any[] }>('/sync', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  // Health
  getHealth: () => request<any>('/health'),
};
