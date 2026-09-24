import type { CanonicalDocumentType, MediaGalleryItem } from '../src/types/ops';

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
  if (category) return 'LAINNYA';
  if (subcategory && aliases[subcategory]) return aliases[subcategory];
  return aliases[normalize(item.sourceModule)] || 'LAINNYA';
}
