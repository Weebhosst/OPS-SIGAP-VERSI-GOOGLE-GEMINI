import { calculateDistanceMeters, resolveShift } from './ops';

/**
 * Verification test suite for business logic rules
 */
export function runDomainTests() {
  const results: { test: string; passed: boolean; message?: string }[] = [];

  // 1. Shift calculation tests
  // Shift 1: 08:00 Jakarta (UTC 01:00)
  const d1 = new Date('2026-09-24T01:00:00.000Z');
  const s1 = resolveShift(d1);
  results.push({
    test: 'Shift 1: 08:00 WIB resolves to SHIFT_1 today',
    passed: s1.code === 'SHIFT_1' && s1.operationalDate === '2026-09-24',
    message: `Got ${s1.code}, date: ${s1.operationalDate}`,
  });

  // Shift 2: 16:00 Jakarta (UTC 09:00)
  const d2 = new Date('2026-09-24T09:00:00.000Z');
  const s2 = resolveShift(d2);
  results.push({
    test: 'Shift 2: 16:00 WIB resolves to SHIFT_2 today',
    passed: s2.code === 'SHIFT_2' && s2.operationalDate === '2026-09-24',
    message: `Got ${s2.code}, date: ${s2.operationalDate}`,
  });

  // Shift 3 before midnight: 23:30 Jakarta (UTC 16:30)
  const d3a = new Date('2026-09-24T16:30:00.000Z');
  const s3a = resolveShift(d3a);
  results.push({
    test: 'Shift 3 (23:30 WIB) resolves to SHIFT_3 today',
    passed: s3a.code === 'SHIFT_3' && s3a.operationalDate === '2026-09-24',
    message: `Got ${s3a.code}, date: ${s3a.operationalDate}`,
  });

  // Shift 3 after midnight: 02:00 Jakarta on 25th (UTC 19:00 on 24th)
  const d3b = new Date('2026-09-24T19:00:00.000Z'); // 19:00 UTC = 02:00 WIB next day (Sept 25)
  const s3b = resolveShift(d3b);
  results.push({
    test: 'Shift 3 (02:00 WIB) resolves to SHIFT_3 with operational date of previous day',
    passed: s3b.code === 'SHIFT_3' && s3b.operationalDate === '2026-09-24',
    message: `Got ${s3b.code}, date: ${s3b.operationalDate}`,
  });

  // 2. Haversine distance tests
  // CP02 reference: -6.481250, 107.631806
  const cp2Lat = -6.48125;
  const cp2Lng = 107.631806;

  // Exact point should be 0m
  const distZero = calculateDistanceMeters(cp2Lat, cp2Lng, cp2Lat, cp2Lng);
  results.push({
    test: 'Zero distance for identical coordinates',
    passed: distZero === 0,
    message: `Got ${distZero}m`,
  });

  // Small offset ~14.86m (approx 0.00013 degrees latitude)
  const dist14m = calculateDistanceMeters(cp2Lat, cp2Lng, cp2Lat + 0.00013, cp2Lng);
  results.push({
    test: 'Distance test approx 14-15m',
    passed: dist14m > 12 && dist14m < 16,
    message: `Got ${dist14m}m`,
  });

  return results;
}
