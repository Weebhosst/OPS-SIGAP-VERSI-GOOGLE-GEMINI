/**
 * OPS SIGAP — Security Operations System
 * Core Types, Interfaces, & Mathematical Utilities
 */

export type Role = 'ANGGOTA' | 'ADMIN' | 'CHIEF' | 'SUPER_ADMIN';

export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface User {
  id: string;            // e.g. "USR-BB92-001"
  name: string;          // e.g. "Ahmad Sopyan"
  npk: string;           // e.g. "234378"
  email: string;
  role: Role;
  customerId?: string | null;
  siteId: string | null; // e.g. "BB92" or null for global Super Admin
  position?: string;
  assignmentHistory?: Array<{
    customerId: string | null;
    siteId: string | null;
    effectiveAt: string;
    changedBy?: string | null;
  }>;
  status: UserStatus;
  passwordHash: string;
  mustChangePassword?: boolean;
  passwordChangedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface Site {
  id: string;            // e.g. "BB92"
  name: string;          // "BARANG BUKTI KM 92"
  code?: string;
  customerId: string;
  personnelCapacity: number;
  targetRoundsPerShift?: number;
  timezone: string;      // "Asia/Jakarta"
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface Checkpoint {
  id: string;            // e.g. "BB92-CP01"
  siteId: string;        // "BB92"
  code: string;          // "CP01"
  name: string;          // "LOKASI UJUNG BB92"
  latitude: number;      // -6.480722
  longitude: number;     // 107.631389
  radiusMeters: number;  // 15
  coordinateMethod?: 'MANUAL' | 'GPS';
  gpsAccuracyM?: number | null;
  gpsCapturedAt?: string | null;
  qrToken: string;       // "BB92-TT72OQD30E3PSOKN"
  status: 'ACTIVE' | 'INACTIVE';
  qrStatus: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export type ShiftCode = 'SHIFT_1' | 'SHIFT_2' | 'SHIFT_3';

export interface ShiftInfo {
  code: ShiftCode;
  name: string;
  timeRange: string;
  operationalDate: string; // YYYY-MM-DD
}

export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'FORCE_CLOSED' | 'CANCELLED';

export interface PatrolSession {
  id: string;            // UUID
  userId: string;
  npk?: string;
  customerId?: string | null;
  siteId: string;
  shiftCode: ShiftCode;
  shiftDate: string;     // YYYY-MM-DD
  startedAt: string;
  endedAt?: string | null;
  startLatitude?: number | null;
  startLongitude?: number | null;
  endLatitude?: number | null;
  endLongitude?: number | null;
  status: SessionStatus;
  forceClosed?: boolean;
  forceCloseBy?: string | null;
  forceCloseRole?: Role | null;
  forceCloseReason?: string | null;
  forceCloseAt?: string | null;
  startDocumentationCompleted?: boolean;
  startDocumentationAt?: string | null;
  endDocumentationCompleted?: boolean;
  endDocumentationAt?: string | null;
  totalRequired: number; // e.g. 5
  totalValid: number;    // e.g. 3
  completionPct: number; // e.g. 60
  roundNumber?: number;
  createdAt: string;
  updatedAt: string;
}

export type ValidationStatus = 'VALID' | 'REVIEW' | 'REJECTED';

export type ObservationStatus = 'AMAN' | 'TEMUAN' | 'INSIDEN';

export type SyncSource = 'ONLINE' | 'OFFLINE_QUEUE';

export interface PatrolLog {
  id: string;            // UUID
  sessionId: string;
  checkpointId: string;
  userId: string;
  siteId: string;
  validationStatus: ValidationStatus;
  rejectionReason?: string | null;
  rejectionMessage?: string | null;
  latitude: number;
  longitude: number;
  gpsAccuracyM?: number | null;
  calculatedDistanceM: number;
  photoUrl?: string | null;
  observationStatus: ObservationStatus;
  notes?: string | null;
  clientCapturedAt: string;
  serverReceivedAt: string;
  syncSource: SyncSource;
  isLowGpsAccuracy?: boolean;
  createdAt: string;
  roundNumber?: number;
}

export type ValidationAlertStatus = 'OPEN' | 'UNDER_REVIEW' | 'CLOSED';

export interface ValidationAlert {
  id: string;
  alertType: string;
  status: ValidationAlertStatus;
  patrolLogId: string;
  userId: string;
  sessionId: string;
  siteId: string;
  checkpointId?: string | null;
  message: string;
  createdAt: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  closedBy?: string | null;
  closedAt?: string | null;
  closeNote?: string | null;
  reopenedBy?: string | null;
  reopenedAt?: string | null;
}

export type HandoverType = 'NAIK_JAGA' | 'TURUN_JAGA' | 'SERAH_TERIMA';
export type ConditionStatus = 'BAIK' | 'PERLU_PERHATIAN' | 'BERMASALAH';

export interface ShiftHandover {
  id: string;
  sessionId?: string | null;
  siteId: string;
  shiftDate: string;
  shiftCode: ShiftCode;
  handoverType: HandoverType;
  fromUserId: string;
  toUserId?: string | null;
  eventAt: string;
  latitude?: number | null;
  longitude?: number | null;
  photoUrl?: string | null;
  photoUrls?: string[];
  itemName?: string | null;
  itemQuantity?: string | null;
  itemCondition?: string | null;
  handedFrom?: string | null;
  handedTo?: string | null;
  isTaruna?: boolean;
  conditionStatus: ConditionStatus;
  personnelStatus: string;
  equipmentStatus: string;
  keysStatus: string;
  vehicleStatus: string;
  outstandingIssues?: string | null;
  handoverNotes?: string | null;
  ackFrom: boolean;
  ackTo: boolean;
  status: 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type IncidentCategory =
  | 'INSIDENTIL'
  | 'MENONJOL'
  | 'KEAMANAN'
  | 'K3'
  | 'KECELAKAAN'
  | 'KERUSAKAN'
  | 'KEHILANGAN'
  | 'LAINNYA';

export type IncidentSeverity = 'RENDAH' | 'SEDANG' | 'TINGGI' | 'KRITIS';
export type IncidentStatus = 'OPEN' | 'FOLLOW_UP' | 'CLOSED';

export interface IncidentReport {
  id: string;
  sessionId?: string | null;
  customerId?: string | null;
  siteId: string;
  userId: string;
  incidentAt: string;
  shiftCode: ShiftCode;
  shiftDate: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  title: string;
  locationText: string;
  latitude?: number | null;
  longitude?: number | null;
  photoUrl?: string | null;
  photoUrls?: string[];
  notes?: string | null;
  chronology: string;
  initialAction: string;
  followUp?: string | null;
  personInvolved?: string | null;
  witness?: string | null;
  vehicleInvolved?: string | null;
  assetInvolved?: string | null;
  policeReportNo?: string | null;
  externalParty?: string | null;
  status: IncidentStatus;
  escalated: boolean;
  escalatedTo?: string | null;
  closedAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaGalleryItem {
  id: string;
  sourceModule: 'PATROL' | 'HANDOVER' | 'INCIDENT';
  sourceTable: string;
  sourceId: string;
  siteId: string;
  userId: string;
  shiftDate: string;
  shiftCode: ShiftCode;
  category: string;
  subcategory?: string | null;
  photoUrl: string;
  caption: string;
  eventAt: string;
  latitude?: number | null;
  longitude?: number | null;
  checkpointId?: string | null;
  incidentId?: string | null;
  handoverId?: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  createdBy: string;
  documentType?: CanonicalDocumentType;
}

export type CanonicalDocumentType =
  | 'SERTIGAS_NAIK_JAGA'
  | 'SERTIGAS_TURUN_JAGA'
  | 'PATROLI_QR'
  | 'SERAH_TERIMA_BARANG'
  | 'TARUNA'
  | 'INSIDEN'
  | 'LAINNYA';

export interface RadiusCalibration {
  id: string;
  siteId: string;
  checkpointId: string;
  testedByUserId: string;
  testedAt: string;
  latitude: number;
  longitude: number;
  gpsAccuracyM?: number | null;
  calculatedDistanceM: number;
  configuredRadiusM: number;
  verdict: 'VALID' | 'REJECTED';
  deviceModel?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: any;
  newValue?: any;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface AdminFilterState {
  id: string;
  userId: string;
  siteId?: string | null;
  shiftCode?: ShiftCode | null;
  memberUserId?: string | null;
  updatedAt: string;
}

export interface AdminKpis {
  patroliAktif: number;
  kejadianOpen: number;
  rejectedHariIni: number;
  serahTerimaHariIni: number;
}

// -------------------------------------------------------------
// DOMAIN UTILITIES
// -------------------------------------------------------------

/**
 * Haversine formula to compute great-circle distance between two GPS coordinates in meters.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100;
}

export type FeatureKey =
  | 'view_dashboard'
  | 'view_monitoring'
  | 'view_patrol'
  | 'view_documentation'
  | 'view_profile'
  | 'customer_master_view'
  | 'customer_master_edit'
  | 'site_master_view'
  | 'site_master_edit'
  | 'personnel_master_view'
  | 'personnel_master_edit'
  | 'checkpoint_master_edit'
  | 'generate_token'
  | 'generate_qr'
  | 'force_close_shift'
  | 'view_active_session'
  | 'view_patrol_monitoring';

const ROLE_FEATURE_MATRIX: Record<Role, FeatureKey[]> = {
  ANGGOTA: [
    'view_dashboard',
    'view_patrol',
    'view_documentation',
    'view_profile',
  ],
  ADMIN: [
    'view_dashboard',
    'view_monitoring',
    'view_patrol',
    'view_documentation',
    'view_profile',
    'view_active_session',
    'view_patrol_monitoring',
    'customer_master_view',
    'customer_master_edit',
    'site_master_view',
    'site_master_edit',
    'personnel_master_view',
    'personnel_master_edit',
    'checkpoint_master_edit',
    'generate_token',
    'generate_qr',
    'force_close_shift',
  ],
  CHIEF: [
    'view_dashboard',
    'view_monitoring',
    'view_patrol',
    'view_documentation',
    'view_profile',
    'view_active_session',
    'view_patrol_monitoring',
  ],
  SUPER_ADMIN: [
    'view_dashboard',
    'view_monitoring',
    'view_patrol',
    'view_documentation',
    'view_profile',
    'view_active_session',
    'view_patrol_monitoring',
    'customer_master_view',
    'customer_master_edit',
    'site_master_view',
    'site_master_edit',
    'personnel_master_view',
    'personnel_master_edit',
    'checkpoint_master_edit',
    'generate_token',
    'generate_qr',
    'force_close_shift',
  ],
};

export function isAdministrator(role: Role | undefined | null): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function hasAccessToFeature(role: Role | undefined | null, feature: FeatureKey): boolean {
  if (!role) return false;
  return ROLE_FEATURE_MATRIX[role]?.includes(feature) ?? false;
}

export function getVisibleShiftCodes(date = new Date()): ShiftCode[] {
  const currentShift = resolveShift(date);

  if (currentShift.code === 'SHIFT_1') return ['SHIFT_1'];
  if (currentShift.code === 'SHIFT_2') return ['SHIFT_2', 'SHIFT_1'];
  return ['SHIFT_3', 'SHIFT_2', 'SHIFT_1'];
}

export type ShiftStartDecision =
  | { allowed: true }
  | { allowed: false; reason: 'USER_ALREADY_HAS_ACTIVE_SESSION' | 'SITE_CAPACITY_FULL' };

export function evaluateShiftStart(hasUserActiveSession: boolean, activeSiteSessions: number, personnelCapacity: number): ShiftStartDecision {
  if (hasUserActiveSession) return { allowed: false, reason: 'USER_ALREADY_HAS_ACTIVE_SESSION' };
  if (activeSiteSessions >= personnelCapacity) return { allowed: false, reason: 'SITE_CAPACITY_FULL' };
  return { allowed: true };
}

/**
 * Get current date & time representation in Asia/Jakarta (UTC+7).
 */
export function getJakartaDateParts(date = new Date()): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  dateString: string; // YYYY-MM-DD
  timeString: string; // HH:mm
} {
  // Format into Asia/Jakarta
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat('en-CA', options);
  const parts = formatter.formatToParts(date);
  const findPart = (t: string) => parts.find((p) => p.type === t)?.value || '00';

  const year = parseInt(findPart('year'), 10);
  const month = parseInt(findPart('month'), 10);
  const day = parseInt(findPart('day'), 10);
  const hours = parseInt(findPart('hour'), 10);
  const minutes = parseInt(findPart('minute'), 10);
  const seconds = parseInt(findPart('second'), 10);

  const pad = (n: number) => String(n).padStart(2, '0');
  const dateString = `${year}-${pad(month)}-${pad(day)}`;
  const timeString = `${pad(hours)}:${pad(minutes)}`;

  return { year, month, day, hours, minutes, seconds, dateString, timeString };
}

/**
 * Resolve active shift and operational date based on Jakarta time.
 * Rules:
 * SHIFT_1: 07:00 - 15:00
 * SHIFT_2: 15:00 - 23:00
 * SHIFT_3: 23:00 - 07:00 (Cross-midnight!)
 * If time is before 07:00 and in Shift 3, operational date is the PREVIOUS calendar day!
 */
export function resolveShift(date = new Date()): ShiftInfo {
  const { year, month, day, hours, minutes, dateString } = getJakartaDateParts(date);
  const totalMinutes = hours * 60 + minutes;

  let code: ShiftCode = 'SHIFT_1';
  let name = 'Shift 1 (Pagi)';
  let timeRange = '07:00 - 15:00';
  let operationalDate = dateString;

  if (totalMinutes >= 7 * 60 && totalMinutes < 15 * 60) {
    // 07:00 to 14:59
    code = 'SHIFT_1';
    name = 'Shift 1 (Pagi)';
    timeRange = '07:00 - 15:00';
    operationalDate = dateString;
  } else if (totalMinutes >= 15 * 60 && totalMinutes < 23 * 60) {
    // 15:00 to 22:59
    code = 'SHIFT_2';
    name = 'Shift 2 (Sore)';
    timeRange = '15:00 - 23:00';
    operationalDate = dateString;
  } else {
    // 23:00 to 06:59 (SHIFT_3)
    code = 'SHIFT_3';
    name = 'Shift 3 (Malam)';
    timeRange = '23:00 - 07:00';

    if (hours < 7) {
      // It's after midnight (00:00 - 06:59), so operational date is the previous day!
      const prevDate = new Date(Date.UTC(year, month - 1, day - 1));
      const pYear = prevDate.getUTCFullYear();
      const pMonth = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
      const pDay = String(prevDate.getUTCDate()).padStart(2, '0');
      operationalDate = `${pYear}-${pMonth}-${pDay}`;
    } else {
      // 23:00 - 23:59, operational date is today
      operationalDate = dateString;
    }
  }

  return {
    code,
    name,
    timeRange,
    operationalDate,
  };
}
