import { db } from './db';
import { CanonicalDocumentType, MediaGalleryItem } from '../src/types/ops';
import { normalizeDocumentType } from './mediaTypes';

export { normalizeDocumentType } from './mediaTypes';

export interface OperationalMediaFilters {
  customerId?: string;
  siteId?: string;
  userId?: string;
  sessionId?: string;
  operationalDate?: string;
  shiftCode?: string;
  documentType?: string;
  month?: number;
  year?: number;
}

export function getOperationalMedia(filters: OperationalMediaFilters = {}): Array<MediaGalleryItem & { documentType: CanonicalDocumentType }> {
  const sites = new Map(db.getSites().map((site) => [site.id, site]));
  return db.getMedia().map((item) => ({ ...item, documentType: normalizeDocumentType(item) })).filter((item) => {
    if (filters.customerId && sites.get(item.siteId)?.customerId !== filters.customerId) return false;
    if (filters.siteId && item.siteId !== filters.siteId) return false;
    if (filters.userId && item.userId !== filters.userId) return false;
    if (filters.sessionId) {
      const linked = item.sourceModule === 'PATROL'
        ? db.findPatrolLogById(item.sourceId)?.sessionId
        : item.sourceModule === 'HANDOVER'
          ? db.findHandoverById(item.handoverId || item.sourceId)?.sessionId
          : db.findIncidentById(item.incidentId || item.sourceId)?.sessionId;
      if (linked !== filters.sessionId) return false;
    }
    if (filters.operationalDate && item.shiftDate !== filters.operationalDate) return false;
    if (filters.shiftCode && item.shiftCode !== filters.shiftCode) return false;
    if (filters.documentType && item.documentType !== filters.documentType && !(filters.documentType === 'SERTIGAS' && item.documentType.startsWith('SERTIGAS_'))) return false;
    if (filters.month && Number(item.shiftDate.slice(5, 7)) !== filters.month) return false;
    if (filters.year && Number(item.shiftDate.slice(0, 4)) !== filters.year) return false;
    return true;
  });
}
