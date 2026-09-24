import { db } from './db';
import { CanonicalDocumentType, MediaGalleryItem } from '../src/types/ops';

const aliases: Record<string, CanonicalDocumentType> = {
  SERTIGAS_NAIK_JAGA: 'SERTIGAS_NAIK_JAGA',
  'SERTIGAS NAIK JAGA': 'SERTIGAS_NAIK_JAGA',
  SHIFT_START: 'SERTIGAS_NAIK_JAGA',
  NAIK_JAGA: 'SERTIGAS_NAIK_JAGA',
  SERTIGAS_TURUN_JAGA: 'SERTIGAS_TURUN_JAGA',
  'SERTIGAS TURUN JAGA': 'SERTIGAS_TURUN_JAGA',
  SHIFT_END: 'SERTIGAS_TURUN_JAGA',
  TURUN_JAGA: 'SERTIGAS_TURUN_JAGA',
  PATROLI: 'PATROLI_QR',
  PATROL: 'PATROLI_QR',
  PATROL_QR: 'PATROLI_QR',
  PATROLI_QR: 'PATROLI_QR',
  HANDOVER: 'SERAH_TERIMA_BARANG',
  SERAH_TERIMA: 'SERAH_TERIMA_BARANG',
  'SERAH TERIMA': 'SERAH_TERIMA_BARANG',
  'SERAH TERIMA BARANG': 'SERAH_TERIMA_BARANG',
  SERAH_TERIMA_BARANG: 'SERAH_TERIMA_BARANG',
  TARUNA: 'TARUNA',
  INCIDENT: 'INSIDEN',
  INCIDENT_REPORT: 'INSIDEN',
  KEJADIAN: 'INSIDEN',
  INSIDENTIL: 'INSIDEN',
  INSIDEN: 'INSIDEN',
};

export function normalizeDocumentType(item: Pick<MediaGalleryItem, 'category' | 'subcategory' | 'sourceModule'>): CanonicalDocumentType {
  const normalize = (value: unknown) => String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const category = normalize(item.category);
  const subcategory = normalize(item.subcategory);
  if (category === 'SERTIGAS') {
    if (subcategory === 'NAIK_JAGA' || subcategory === 'SHIFT_START') return 'SERTIGAS_NAIK_JAGA';
    if (subcategory === 'TURUN_JAGA' || subcategory === 'SHIFT_END') return 'SERTIGAS_TURUN_JAGA';
  }
  if (category && aliases[category]) return aliases[category];
  if (category) {
    console.warn(`[media] Unknown document type: ${item.category}/${item.subcategory || '-'} -> LAINNYA`);
    return 'LAINNYA';
  }
  if (subcategory && aliases[subcategory]) return aliases[subcategory];
  const sourceModule = normalize(item.sourceModule);
  if (aliases[sourceModule]) return aliases[sourceModule];
  console.warn(`[media] Unknown document type: ${item.category}/${item.subcategory || '-'} -> LAINNYA`);
  return 'LAINNYA';
}

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
