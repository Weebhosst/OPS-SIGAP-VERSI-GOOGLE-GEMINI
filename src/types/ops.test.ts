import {
  calculateDistanceMeters,
  resolveShift,
  getVisibleShiftCodes,
  hasAccessToFeature,
  isAdministrator,
  evaluateShiftStart,
} from './ops';

/**
 * Verification test suite for business logic rules.
 * Includes a 20-case acceptance set covering the operational rules that are enforced in code.
 */
export function runDomainTests() {
  const results: { test: string; passed: boolean; message?: string }[] = [];

  const d1 = new Date('2026-09-24T01:00:00.000Z');
  const s1 = resolveShift(d1);
  results.push({
    test: 'TEST 01: Shift 1 at 08:00 WIB resolves to SHIFT_1 today',
    passed: s1.code === 'SHIFT_1' && s1.operationalDate === '2026-09-24',
    message: `Got ${s1.code}, date: ${s1.operationalDate}`,
  });

  const d2 = new Date('2026-09-24T09:00:00.000Z');
  const s2 = resolveShift(d2);
  results.push({
    test: 'TEST 02: Shift 2 at 16:00 WIB resolves to SHIFT_2 today',
    passed: s2.code === 'SHIFT_2' && s2.operationalDate === '2026-09-24',
    message: `Got ${s2.code}, date: ${s2.operationalDate}`,
  });

  const d3a = new Date('2026-09-24T16:30:00.000Z');
  const s3a = resolveShift(d3a);
  results.push({
    test: 'TEST 03: Shift 3 before midnight resolves to SHIFT_3 today',
    passed: s3a.code === 'SHIFT_3' && s3a.operationalDate === '2026-09-24',
    message: `Got ${s3a.code}, date: ${s3a.operationalDate}`,
  });

  const d3b = new Date('2026-09-24T19:00:00.000Z');
  const s3b = resolveShift(d3b);
  results.push({
    test: 'TEST 04: Shift 3 after midnight resolves to SHIFT_3 with the previous operational date',
    passed: s3b.code === 'SHIFT_3' && s3b.operationalDate === '2026-09-24',
    message: `Got ${s3b.code}, date: ${s3b.operationalDate}`,
  });

  const dayShift = getVisibleShiftCodes(new Date('2026-09-24T03:00:00.000Z'));
  results.push({
    test: 'TEST 05: At 10:00 WIB only SHIFT_1 is visible',
    passed: JSON.stringify(dayShift) === JSON.stringify(['SHIFT_1']),
    message: `Got ${JSON.stringify(dayShift)}`,
  });

  const afternoonShift = getVisibleShiftCodes(new Date('2026-09-24T09:00:00.000Z'));
  results.push({
    test: 'TEST 06: At 16:00 WIB the visible order is SHIFT_2 then SHIFT_1',
    passed: JSON.stringify(afternoonShift) === JSON.stringify(['SHIFT_2', 'SHIFT_1']),
    message: `Got ${JSON.stringify(afternoonShift)}`,
  });

  const midnightShift = getVisibleShiftCodes(new Date('2026-09-24T19:00:00.000Z'));
  results.push({
    test: 'TEST 07: At 02:00 WIB the visible order is SHIFT_3 then SHIFT_2 then SHIFT_1',
    passed: JSON.stringify(midnightShift) === JSON.stringify(['SHIFT_3', 'SHIFT_2', 'SHIFT_1']),
    message: `Got ${JSON.stringify(midnightShift)}`,
  });

  results.push({
    test: 'TEST 08: Chief can view dashboard and monitoring',
    passed: hasAccessToFeature('CHIEF', 'view_dashboard') && hasAccessToFeature('CHIEF', 'view_monitoring'),
    message: 'Chief should see monitoring screens but not mutating controls.',
  });

  results.push({
    test: 'TEST 09: Chief cannot force-close a shift',
    passed: !hasAccessToFeature('CHIEF', 'force_close_shift'),
    message: 'Chief must remain read-only for force close actions.',
  });

  results.push({
    test: 'TEST 10: Chief cannot edit master data',
    passed: !hasAccessToFeature('CHIEF', 'customer_master_edit') && !hasAccessToFeature('CHIEF', 'site_master_edit'),
    message: 'Chief should not modify customer or site masters.',
  });

  results.push({
    test: 'TEST 11: Admin is recognized as an administrator',
    passed: isAdministrator('ADMIN'),
    message: 'ADMIN should be accepted by the centralized administrator helper.',
  });

  results.push({
    test: 'TEST 12: Super admin is recognized as an administrator',
    passed: isAdministrator('SUPER_ADMIN'),
    message: 'SUPER_ADMIN should be accepted by the centralized administrator helper.',
  });

  results.push({
    test: 'TEST 13: Chief is not recognized as an administrator',
    passed: !isAdministrator('CHIEF'),
    message: 'CHIEF should remain outside admin write privileges.',
  });

  results.push({
    test: 'TEST 14: Member is not recognized as an administrator',
    passed: !isAdministrator('ANGGOTA'),
    message: 'ANGGOTA should not receive admin-level permissions.',
  });

  results.push({
    test: 'TEST 15: Admin may force-close a shift',
    passed: hasAccessToFeature('ADMIN', 'force_close_shift'),
    message: 'Admin should retain the force close privilege.',
  });

  results.push({
    test: 'TEST 16: Super admin may edit customer master data',
    passed: hasAccessToFeature('SUPER_ADMIN', 'customer_master_edit') && hasAccessToFeature('SUPER_ADMIN', 'site_master_edit'),
    message: 'Super admin must retain complete master-data edit capability.',
  });

  results.push({
    test: 'TEST 17: Member can view dashboard and patrol features',
    passed: hasAccessToFeature('ANGGOTA', 'view_dashboard') && hasAccessToFeature('ANGGOTA', 'view_patrol'),
    message: 'Staff access should remain operationally usable.',
  });

  const cp2Lat = -6.48125;
  const cp2Lng = 107.631806;
  const distZero = calculateDistanceMeters(cp2Lat, cp2Lng, cp2Lat, cp2Lng);
  results.push({
    test: 'TEST 18: Zero distance for identical coordinates',
    passed: distZero === 0,
    message: `Got ${distZero}m`,
  });

  const dist14m = calculateDistanceMeters(cp2Lat, cp2Lng, cp2Lat + 0.00013, cp2Lng);
  results.push({
    test: 'TEST 19: GPS tolerance is approximately 14-15 meters',
    passed: dist14m > 12 && dist14m < 16,
    message: `Got ${dist14m}m`,
  });

  results.push({
    test: 'TEST 20: Chief can still view patrol monitoring, but not force close or master edits',
    passed:
      hasAccessToFeature('CHIEF', 'view_patrol_monitoring') &&
      !hasAccessToFeature('CHIEF', 'force_close_shift') &&
      !hasAccessToFeature('CHIEF', 'site_master_edit') &&
      !hasAccessToFeature('CHIEF', 'customer_master_edit'),
    message: 'Chief monitoring must remain read-only.',
  });

  results.push({
    test: 'TEST 21: BB92 capacity 1 blocks a second active session',
    passed: evaluateShiftStart(false, 1, 1).allowed === false,
  });

  results.push({
    test: 'TEST 22: MO Subang capacity 3 allows the third session',
    passed: evaluateShiftStart(false, 2, 3).allowed === true,
  });

  results.push({
    test: 'TEST 23: MO Subang capacity 3 blocks the fourth session',
    passed: evaluateShiftStart(false, 3, 3).allowed === false,
  });

  results.push({
    test: 'TEST 24: A user cannot hold two active sessions across sites',
    passed: evaluateShiftStart(true, 0, 3).allowed === false,
  });

  results.push({
    test: 'TEST 25: Admin and Super Admin share master configuration permissions',
    passed:
      hasAccessToFeature('ADMIN', 'customer_master_edit') &&
      hasAccessToFeature('ADMIN', 'site_master_edit') &&
      hasAccessToFeature('ADMIN', 'personnel_master_edit') &&
      hasAccessToFeature('ADMIN', 'checkpoint_master_edit') &&
      hasAccessToFeature('ADMIN', 'generate_token') &&
      hasAccessToFeature('ADMIN', 'generate_qr'),
    message: 'ADMIN must match SUPER_ADMIN for master configuration.',
  });

  return results;
}
