import type { CanonicalDocumentType, MediaGalleryItem, MediaSourceContext, ShiftCode } from '../src/types/ops';
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



export async function enrichOperationalMedia(
  items: Array<MediaGalleryItem & { documentType?: CanonicalDocumentType }>,
): Promise<Array<MediaGalleryItem & { documentType?: CanonicalDocumentType; sourceContext?: MediaSourceContext }>> {
  const userCache = new Map<string, Promise<any>>();
  const siteCache = new Map<string, Promise<any>>();
  const checkpointCache = new Map<string, Promise<any>>();
  const patrolCache = new Map<string, Promise<any>>();
  const handoverCache = new Map<string, Promise<any>>();
  const incidentCache = new Map<string, Promise<any>>();

  const cached = <T>(
    cache: Map<string, Promise<T>>,
    key: string | null | undefined,
    loader: () => Promise<T>,
  ): Promise<T | null> => {
    if (!key) return Promise.resolve(null);
    if (!cache.has(key)) cache.set(key, loader());
    return cache.get(key)!;
  };

  return Promise.all(items.map(async (item) => {
    const [member, site] = await Promise.all([
      cached(userCache, item.userId, () => repositories.users.findById(item.userId)),
      cached(siteCache, item.siteId, () => repositories.sites.findById(item.siteId)),
    ]);

    const base: MediaSourceContext = {
      memberName: member?.name || null,
      npk: member?.npk || null,
      siteName: site?.name || null,
    };

    if (item.sourceModule === 'PATROL') {
      const log = await cached(patrolCache, item.sourceId, () => repositories.patrol.findById(item.sourceId));
      const checkpointId = item.checkpointId || log?.checkpointId || null;
      const checkpoint = await cached(
        checkpointCache,
        checkpointId,
        () => repositories.checkpoints.findById(checkpointId!),
      );

      return {
        ...item,
        sourceContext: {
          ...base,
          checkpointCode: checkpoint?.code || null,
          checkpointName: checkpoint?.name || null,
          roundNumber: log?.roundNumber || null,
          validationStatus: log?.validationStatus || null,
          calculatedDistanceM: log?.calculatedDistanceM ?? null,
          observationStatus: log?.observationStatus || null,
          syncSource: log?.syncSource || null,
        },
      };
    }

    if (item.sourceModule === 'HANDOVER') {
      const handoverId = item.handoverId || item.sourceId;
      const handover = await cached(
        handoverCache,
        handoverId,
        () => repositories.handovers.findById(handoverId),
      );

      return {
        ...item,
        sourceContext: {
          ...base,
          handoverType: handover?.handoverType || null,
          handoverStatus: handover?.status || null,
          handedFrom: handover?.handedFrom || null,
          handedTo: handover?.handedTo || null,
          itemName: handover?.itemName || null,
          itemQuantity: handover?.itemQuantity || null,
          itemCondition: handover?.itemCondition || null,
        },
      };
    }

    if (item.sourceModule === 'INCIDENT') {
      const incidentId = item.incidentId || item.sourceId;
      const incident = await cached(
        incidentCache,
        incidentId,
        () => repositories.incidents.findById(incidentId),
      );

      return {
        ...item,
        sourceContext: {
          ...base,
          incidentTitle: incident?.title || null,
          incidentCategory: incident?.category || null,
          incidentSeverity: incident?.severity || null,
          incidentStatus: incident?.status || null,
          incidentLocation: incident?.locationText || null,
        },
      };
    }

    return { ...item, sourceContext: base };
  }));
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
