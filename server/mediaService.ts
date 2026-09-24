import type { CanonicalDocumentType, MediaGalleryItem, ShiftCode } from '../src/types/ops';
import { normalizeDocumentType } from './mediaTypes';
import { repositories } from './repositories';
import type { Page } from './repositories/contracts';

export { normalizeDocumentType } from './mediaTypes';

export interface OperationalMediaFilters {
  customerId?: string;
  siteId?: string;
  userId?: string;
  sessionId?: string;
  operationalDate?: string;
  shiftCode?: ShiftCode;
  documentType?: string;
  month?: number;
  year?: number;
  from?: string;
  to?: string;
}

function periodBounds(filters: OperationalMediaFilters) {
  if (filters.from || filters.to || filters.operationalDate) {
    return { from: filters.from, to: filters.to };
  }
  if (!filters.month || !filters.year) return { from: undefined, to: undefined };
  const month = Math.min(12, Math.max(1, Number(filters.month)));
  const year = Math.min(2100, Math.max(2020, Number(filters.year)));
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { from, to };
}

function repositoryFilters(filters: OperationalMediaFilters) {
  const { from, to } = periodBounds(filters);
  return {
    customerId: filters.customerId,
    siteId: filters.siteId,
    userId: filters.userId,
    sessionId: filters.sessionId,
    operationalDate: filters.operationalDate,
    shiftCode: filters.shiftCode,
    documentType: filters.documentType,
    from,
    to,
  };
}

export async function getOperationalMedia(
  filters: OperationalMediaFilters = {},
  page = { limit: 48, offset: 0 },
): Promise<Page<MediaGalleryItem & { documentType?: CanonicalDocumentType }>> {
  return repositories.media.list(repositoryFilters(filters), page);
}

export async function getOperationalMediaCounts(
  filters: OperationalMediaFilters = {},
): Promise<Record<string, number>> {
  const { documentType: _ignored, ...withoutDocumentType } = repositoryFilters(filters);
  return repositories.media.counts(withoutDocumentType);
}
