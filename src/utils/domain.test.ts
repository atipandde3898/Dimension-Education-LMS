import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdminPaymentDecisionPayload,
  buildBatchCreatePayload,
  buildBatchesReportRows,
  buildCandidateCreatePayload,
  buildCandidateDocUpsertPayload,
  buildCandidatePaymentInsertPayload,
  buildCandidateUpdatePayload,
  buildConsentAcceptancePayloads,
  buildDocumentApprovePayload,
  buildDocumentRejectPayload,
  buildFeePlanUpsertPayload,
  buildFeesReportRows,
  buildInstallmentPayload,
  buildPlacementHandoverPayload,
  buildPlacementReportRows,
  buildReportFilename,
  buildSessionPayload,
  buildTicketCreatePayload,
  buildTicketMessagePayload,
  buildTimetableSlotPayload,
  computeCounsellorPortfolioMetrics,
  computeInstallmentMismatch,
  computeOnboardingProgress,
  formatConsentStatusLabel,
  formatPhotoStatusLabel,
  getInitials,
  isCandidatePortalBlocked,
  isMandatoryOnboardingIncomplete,
  computeTotalSessionHours,
  filterAndSortRows,
  formatTicketDateTime,
  getTicketCategoryLabel,
  getTicketStatusLabel,
  validateAndBuildTicketAttachmentUpload,
  filterBatchesByModule,
  findNextDueInstallment,
  formatAmount,
  formatDate,
  formatDateDdMmmYyyy,
  formatDbError,
  formatDurationMinutes,
  formatHandoverStatusText,
  formatInr,
  formatTime12h,
  formatTimeRange12h,
  getIndiaTodayIso,
  getInstallmentDueRelativeText,
  groupTimetableSlotsByDay,
  hasCandidateFeePlan,
  isCandidateBatchModuleLocked,
  maskPan,
  normalizeAndValidatePan,
  normalizeDashboardStats,
  normalizeTimetableStatus,
  resolvePortalArea,
  sortSessionsNewestFirst,
  validateAndBuildDocUpload,
  validateAndBuildPaymentProofUpload,
  validatePasswordRules,
  validateSupabaseEnv,
} from './domain';
import { createReportWorkbook } from './excel';
import * as XLSX from 'xlsx';
import type {
  Batch,
  CandidateOverview,
  InstallmentStatus,
  TimetableSlot,
} from '../types/database';

function makeJwtWithRole(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return `${header}.${payload}.sig`;
}

test('validateSupabaseEnv detects missing env vars and rejects service_role keys', () => {
  const missingBoth = validateSupabaseEnv('', '');
  assert.equal(missingBoth.valid, false);
  assert.deepEqual(missingBoth.missingVars, [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ]);

  const serviceRoleJwt = makeJwtWithRole('service_role');
  const rejected = validateSupabaseEnv('https://example.supabase.co', serviceRoleJwt);
  assert.equal(rejected.valid, false);
  assert.match(rejected.reason ?? '', /service_role/);

  const anonJwt = makeJwtWithRole('anon');
  const accepted = validateSupabaseEnv('https://example.supabase.co', anonJwt);
  assert.equal(accepted.valid, true);
});

test('formatDbError translates database error codes into readable human messages', () => {
  assert.equal(
    formatDbError({ code: '23505', details: 'Key (email)=(a@b.com) already exists.' }),
    'A record with this email address already exists.',
  );
  assert.equal(
    formatDbError({ code: '42501', message: 'new row violates row-level security policy' }),
    'You do not have permission to perform this action.',
  );
  assert.equal(
    formatDbError({ message: 'Invalid login credentials' }),
    'Incorrect email or password. Please check your credentials and try again.',
  );
  assert.equal(
    formatDbError('insert or update on table "candidates" violates foreign key constraint "fk_prog"'),
    'This record is linked to other data and cannot be updated or removed in that state.',
  );
  assert.equal(
    formatDbError({
      code: '23503',
      details: 'Key (id)=(inst-1) is still referenced from table "payments".',
    }),
    'Cannot delete this installment because one or more payments are linked to it.',
  );
  assert.equal(
    formatDbError({
      code: '23505',
      details: 'Key (candidate_id, seq)=(cand-1, 1) already exists.',
    }),
    'An installment with this sequence number already exists for this candidate.',
  );
});

test('buildBatchCreatePayload omits batch_code and strips location for online batches', () => {
  const onlineRes = buildBatchCreatePayload({
    module_id: 'mod-1',
    mode: 'online',
    start_date: '2026-11-10',
    end_date: '',
    location: 'Room 302',
  });
  assert.equal(onlineRes.ok, true);
  if (onlineRes.ok) {
    assert.equal(onlineRes.payload.location, null);
    assert.equal(onlineRes.payload.end_date, null);
    assert.equal('batch_code' in onlineRes.payload, false);
  }

  const offlineRes = buildBatchCreatePayload({
    module_id: 'mod-1',
    mode: 'offline',
    start_date: '2026-11-10',
    end_date: '2026-12-15',
    location: 'Bengaluru Campus, Lab 2',
  });
  assert.equal(offlineRes.ok, true);
  if (offlineRes.ok) {
    assert.equal(offlineRes.payload.location, 'Bengaluru Campus, Lab 2');
    assert.equal(offlineRes.payload.end_date, '2026-12-15');
  }

  const invalidDates = buildBatchCreatePayload({
    module_id: 'mod-1',
    mode: 'online',
    start_date: '2026-12-10',
    end_date: '2026-11-01',
  });
  assert.equal(invalidDates.ok, false);
});

test('candidate batch and module rules enforce module match and lock once batch is set', () => {
  const sampleBatches: Batch[] = [
    {
      id: 'batch-m1',
      batch_code: 'B-101',
      module_id: 'mod-1',
      mode: 'online',
      start_date: '2026-11-10',
      end_date: null,
      location: null,
      timetable_status: 'scheduled',
    },
    {
      id: 'batch-m2',
      batch_code: 'B-202',
      module_id: 'mod-2',
      mode: 'offline',
      start_date: '2026-11-15',
      end_date: null,
      location: 'Hall A',
      timetable_status: 'draft',
    },
  ];

  const mod1Batches = filterBatchesByModule(sampleBatches, 'mod-1');
  assert.equal(mod1Batches.length, 1);
  assert.equal(mod1Batches[0].id, 'batch-m1');

  // Create rejects mismatched batch module
  const badCreate = buildCandidateCreatePayload(
    {
      full_name: 'Aarav Rao',
      email: 'aarav@example.com',
      phone: '9876543210',
      program_id: 'prog-1',
      module_id: 'mod-1',
      counsellor_id: 'coun-1',
      batch_id: 'batch-m2',
    },
    sampleBatches,
  );
  assert.equal(badCreate.ok, false);

  // Create succeeds with matching batch and omits candidate_code
  const goodCreate = buildCandidateCreatePayload(
    {
      full_name: 'Aarav Rao',
      email: 'Aarav@Example.com',
      phone: '9876543210',
      program_id: 'prog-1',
      module_id: 'mod-1',
      counsellor_id: 'coun-1',
      batch_id: 'batch-m1',
    },
    sampleBatches,
  );
  assert.equal(goodCreate.ok, true);
  if (goodCreate.ok) {
    assert.equal('candidate_code' in goodCreate.payload, false);
    assert.equal(goodCreate.payload.email, 'aarav@example.com');
  }

  // Locking check
  assert.equal(isCandidateBatchModuleLocked({ batch_id: null }), false);
  assert.equal(isCandidateBatchModuleLocked({ batch_id: 'batch-m1' }), true);

  // Update rejects changing module_id or batch_id once batch_id is set
  const rejectedLockedUpdate = buildCandidateUpdatePayload(
    { module_id: 'mod-1', batch_id: 'batch-m1' },
    {
      full_name: 'Aarav Rao',
      email: 'aarav@example.com',
      phone: '9876543210',
      program_id: 'prog-1',
      module_id: 'mod-2',
      batch_id: 'batch-m2',
      counsellor_id: 'coun-1',
      status: 'active',
    },
    sampleBatches,
  );
  assert.equal(rejectedLockedUpdate.ok, false);

  // Update succeeds on other fields when locked, and omits module_id/batch_id from mutation payload
  const allowedLockedUpdate = buildCandidateUpdatePayload(
    { module_id: 'mod-1', batch_id: 'batch-m1' },
    {
      full_name: 'Aarav K. Rao',
      email: 'aarav@example.com',
      phone: '9876543210',
      program_id: 'prog-2',
      module_id: 'mod-1',
      batch_id: 'batch-m1',
      counsellor_id: 'coun-1',
      status: 'active',
    },
    sampleBatches,
  );
  assert.equal(allowedLockedUpdate.ok, true);
  if (allowedLockedUpdate.ok) {
    assert.equal('module_id' in allowedLockedUpdate.payload, false);
    assert.equal('batch_id' in allowedLockedUpdate.payload, false);
    assert.equal(allowedLockedUpdate.payload.status, 'active');
  }
});

test('resolvePortalArea, normalizeDashboardStats, formatAmount, formatInr, and filterAndSortRows work accurately', () => {
  assert.equal(resolvePortalArea({ role: 'admin', active: true }), 'admin');
  assert.equal(resolvePortalArea({ role: 'sme', active: true }), 'sme');
  assert.equal(resolvePortalArea({ role: 'counsellor', active: true }), 'counsellor');
  assert.equal(resolvePortalArea({ role: 'candidate', active: true }), 'candidate');
  assert.equal(resolvePortalArea({ role: 'admin', active: false }), 'inactive');

  const stats = normalizeDashboardStats(null);
  assert.equal(stats.total_candidates, 0);
  assert.equal(formatAmount(48500), '48,500');
  assert.equal(formatAmount(125000), '1,25,000');

  // Indian rupee formatting
  assert.equal(formatInr(null), '₹0');
  assert.equal(formatInr(0), '₹0');
  assert.equal(formatInr(950), '₹950');
  assert.equal(formatInr(48500), '₹48,500');
  assert.equal(formatInr(125000), '₹1,25,000');
  assert.equal(formatInr(10000000), '₹1,00,00,000');
  assert.equal(formatInr(12500.5), '₹12,500.50');

  const items = [
    { code: 'C-002', name: 'Zoya', pending: 5000 },
    { code: 'C-010', name: 'Meera', pending: 15000 },
    { code: 'C-001', name: 'Kabir', pending: 0 },
  ];

  const sortedDesc = filterAndSortRows(
    items,
    '',
    (r) => [r.code, r.name],
    (r) => r.pending,
    'desc',
  );
  assert.deepEqual(
    sortedDesc.map((i) => i.code),
    ['C-010', 'C-002', 'C-001'],
  );

  const searched = filterAndSortRows(
    items,
    'meera',
    (r) => [r.code, r.name],
    (r) => r.code,
    'asc',
  );
  assert.equal(searched.length, 1);
  assert.equal(searched[0].code, 'C-010');
});

test('PAN validation converts to uppercase, enforces regex, and masks as ABCDE****F', () => {
  const valid = normalizeAndValidatePan(' abcde1234f ');
  assert.deepEqual(valid, { ok: true, pan: 'ABCDE1234F' });
  assert.equal(maskPan('abcde1234f'), 'ABCDE****F');
  assert.equal(maskPan(null), null);
  assert.equal(maskPan('SHORT'), '**********');

  const invalid1 = normalizeAndValidatePan('ABCD12345F');
  assert.equal(invalid1.ok, false);

  const invalid2 = normalizeAndValidatePan('ABCDE12345');
  assert.equal(invalid2.ok, false);
});

test('document upload validation, storage path format, progress, and review payloads', () => {
  const pdfCheck = validateAndBuildDocUpload('cand-42', 'enrollment_form', {
    name: 'Signed Form.PDF',
    size: 1024 * 500,
    type: 'application/pdf',
  });
  assert.deepEqual(pdfCheck, {
    ok: true,
    ext: 'pdf',
    storagePath: 'cand-42/enrollment_form/enrollment_form.pdf',
  });

  const jpegCheck = validateAndBuildDocUpload('cand-42', 'photo_id', {
    name: 'passport.jpeg',
    size: 2048,
    type: 'image/jpeg',
  });
  assert.deepEqual(jpegCheck, {
    ok: true,
    ext: 'jpg',
    storagePath: 'cand-42/photo_id/photo_id.jpg',
  });

  const oversize = validateAndBuildDocUpload('cand-42', 'pan', {
    name: 'pan.png',
    size: 5 * 1024 * 1024 + 1,
    type: 'image/png',
  });
  assert.equal(oversize.ok, false);

  const badExt = validateAndBuildDocUpload('cand-42', 'pan', {
    name: 'pan.docx',
    size: 2048,
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  assert.equal(badExt.ok, false);

  const upsertPayload = buildCandidateDocUpsertPayload(
    'cand-42',
    'pan',
    'cand-42/pan/pan.png',
    '2026-11-03T08:00:00.000Z',
  );
  assert.equal(upsertPayload.status, 'pending');
  assert.equal(upsertPayload.storage_path, 'cand-42/pan/pan.png');

  // Progress bar math (4 required documents now)
  assert.deepEqual(
    computeOnboardingProgress([
      { doc_type: 'pan', status: 'approved' },
      { doc_type: 'photo_id', status: 'pending' },
    ]),
    { approvedCount: 1, totalCount: 4, isComplete: false },
  );
  assert.deepEqual(
    computeOnboardingProgress([
      { doc_type: 'profile_photo', status: 'approved' },
      { doc_type: 'pan', status: 'approved' },
      { doc_type: 'photo_id', status: 'approved' },
      { doc_type: 'enrollment_form', status: 'approved' },
    ]),
    { approvedCount: 4, totalCount: 4, isComplete: true },
  );

  // Admin review payloads
  const approvePayload = buildDocumentApprovePayload(
    'admin-1',
    '2026-11-03T09:00:00.000Z',
  );
  assert.equal(approvePayload.status, 'approved');
  assert.equal(approvePayload.reviewed_by, 'admin-1');

  const emptyReject = buildDocumentRejectPayload('admin-1', '   ');
  assert.equal(emptyReject.ok, false);

  const validReject = buildDocumentRejectPayload(
    'admin-1',
    ' Image is blurry, please upload a clear scan. ',
    '2026-11-03T09:05:00.000Z',
  );
  assert.equal(validReject.ok, true);
  if (validReject.ok) {
    assert.equal(validReject.payload.status, 'rejected');
    assert.equal(
      validReject.payload.review_note,
      'Image is blurry, please upload a clear scan.',
    );
  }
});

test('fee plan validation, installment mismatch calculation, and next due installment finder', () => {
  const validPlan = buildFeePlanUpsertPayload('cand-42', {
    total_fee: '150000',
    discount: '25000',
    note: ' Early bird scholarship ',
  });
  assert.equal(validPlan.ok, true);
  if (validPlan.ok) {
    assert.equal(validPlan.netFee, 125000);
    assert.deepEqual(validPlan.payload, {
      candidate_id: 'cand-42',
      total_fee: 150000,
      discount: 25000,
      note: 'Early bird scholarship',
    });
  }

  const badPlan = buildFeePlanUpsertPayload('cand-42', {
    total_fee: '50000',
    discount: '60000',
    note: '',
  });
  assert.equal(badPlan.ok, false);

  assert.equal(hasCandidateFeePlan(null, null), false);
  assert.equal(
    hasCandidateFeePlan(null, {
      candidate_id: 'cand-42',
      total_fee: null,
      discount: null,
      net_fee: null,
      paid: 0,
      pending: 0,
    }),
    false,
  );
  assert.equal(
    hasCandidateFeePlan(null, {
      candidate_id: 'cand-42',
      total_fee: 150000,
      discount: 25000,
      net_fee: 125000,
      paid: 50000,
      pending: 75000,
    }),
    true,
  );

  // Installment validation & duplicate seq check
  const instOk = buildInstallmentPayload(
    'cand-42',
    { seq: '2', due_date: '2026-12-01', amount: '62500' },
    [1],
  );
  assert.equal(instOk.ok, true);

  const instDup = buildInstallmentPayload(
    'cand-42',
    { seq: '1', due_date: '2026-12-01', amount: '62500' },
    [1],
  );
  assert.equal(instDup.ok, false);

  // Installment mismatch calculation (non-blocking warning check)
  const matched = computeInstallmentMismatch(125000, [
    { amount: 50000 },
    { amount: 75000 },
  ]);
  assert.equal(matched.hasMismatch, false);
  assert.equal(matched.installmentsTotal, 125000);

  const mismatched = computeInstallmentMismatch(125000, [
    { amount: 50000 },
    { amount: 50000 },
  ]);
  assert.equal(mismatched.hasMismatch, true);
  assert.equal(mismatched.difference, -25000);

  // Next due installment picks earliest due_date where state !== 'paid'
  const schedule: InstallmentStatus[] = [
    {
      id: 'i-1',
      candidate_id: 'cand-42',
      seq: 1,
      due_date: '2026-10-01',
      amount: 50000,
      paid: 50000,
      state: 'paid',
    },
    {
      id: 'i-3',
      candidate_id: 'cand-42',
      seq: 3,
      due_date: '2026-12-15',
      amount: 40000,
      paid: 0,
      state: 'upcoming',
    },
    {
      id: 'i-2',
      candidate_id: 'cand-42',
      seq: 2,
      due_date: '2026-11-01',
      amount: 35000,
      paid: 0,
      state: 'overdue',
    },
  ];
  const nextDue = findNextDueInstallment(schedule);
  assert.equal(nextDue?.id, 'i-2');
  assert.equal(nextDue?.seq, 2);

  assert.equal(findNextDueInstallment([schedule[0]]), null);
});

test('payment proof upload path and payment insert/confirm/reject payloads enforce strict rules', () => {
  const proofRes = validateAndBuildPaymentProofUpload(
    'cand-42',
    { name: 'UTR Receipt #99.JPG', size: 1024 * 300, type: 'image/jpeg' },
    1762162000000,
  );
  assert.deepEqual(proofRes, {
    ok: true,
    ext: 'jpg',
    storagePath: 'cand-42/payments/1762162000000-UTR_Receipt_99.jpg',
  });

  const missingProof = validateAndBuildPaymentProofUpload('cand-42', null);
  assert.equal(missingProof.ok, false);

  const insertRes = buildCandidatePaymentInsertPayload({
    candidate_id: 'cand-42',
    installment_id: 'inst-2',
    amount: '35000',
    paid_on: '2026-11-03',
    reference: ' UTR88392011 ',
    proof_path: 'cand-42/payments/1762162000000-UTR_Receipt_99.jpg',
  });
  assert.equal(insertRes.ok, true);
  if (insertRes.ok) {
    assert.equal(insertRes.payload.status, 'pending');
    assert.equal(insertRes.payload.reference, 'UTR88392011');
    assert.equal('confirmed_by' in insertRes.payload, false);
    assert.equal('confirmed_at' in insertRes.payload, false);
  }

  const confirmPayload = buildAdminPaymentDecisionPayload(
    'admin-99',
    'confirmed',
    '2026-11-03T10:00:00.000Z',
  );
  assert.deepEqual(confirmPayload, {
    status: 'confirmed',
    confirmed_by: 'admin-99',
    confirmed_at: '2026-11-03T10:00:00.000Z',
  });

  const rejectPayload = buildAdminPaymentDecisionPayload(
    'admin-99',
    'rejected',
    '2026-11-03T10:05:00.000Z',
  );
  assert.deepEqual(rejectPayload, {
    status: 'rejected',
    confirmed_by: 'admin-99',
    confirmed_at: '2026-11-03T10:05:00.000Z',
  });
});

test('12-hour AM/PM time formatting, duration formatting, and session total hours calculation', () => {
  assert.equal(formatTime12h('00:00:00'), '12:00 AM');
  assert.equal(formatTime12h('09:05:00'), '9:05 AM');
  assert.equal(formatTime12h('12:00'), '12:00 PM');
  assert.equal(formatTime12h('18:30:00'), '6:30 PM');
  assert.equal(formatTime12h('23:45'), '11:45 PM');
  assert.equal(formatTimeRange12h('18:30:00', '20:00:00'), '6:30 PM – 8:00 PM');

  assert.equal(formatDurationMinutes(90), '1 h 30 min');
  assert.equal(formatDurationMinutes(60), '1 h');
  assert.equal(formatDurationMinutes(45), '45 min');
  assert.equal(formatDurationMinutes(135), '2 h 15 min');
  assert.equal(formatDurationMinutes(0), '0 min');

  const totals = computeTotalSessionHours([
    { duration_minutes: 90 },
    { duration_minutes: 120 },
  ]);
  assert.equal(totals.totalMinutes, 210);
  assert.equal(totals.totalHoursFormatted, '3.5');

  const emptyTotals = computeTotalSessionHours([]);
  assert.equal(emptyTotals.totalHoursFormatted, '0.0');

  assert.equal(normalizeTimetableStatus('published'), 'published');
  assert.equal(normalizeTimetableStatus('opted_out'), 'opted_out');
  assert.equal(normalizeTimetableStatus(null), 'not_set');
  assert.equal(normalizeTimetableStatus('not_set'), 'not_set');
});

test('weekly timetable slot grouping, slot validation, and session validation', () => {
  const validSlot = buildTimetableSlotPayload('batch-1', 'sme-1', {
    day_of_week: 3,
    start_time: '18:30:00',
    end_time: '20:00:00',
    meeting_link: ' https://meet.google.com/abc-defg-hij ',
  });
  assert.equal(validSlot.ok, true);
  if (validSlot.ok) {
    assert.deepEqual(validSlot.payload, {
      batch_id: 'batch-1',
      sme_id: 'sme-1',
      day_of_week: 3,
      start_time: '18:30',
      end_time: '20:00',
      meeting_link: 'https://meet.google.com/abc-defg-hij',
    });
  }

  // End before or equal to start fails
  const reversedTimes = buildTimetableSlotPayload('batch-1', 'sme-1', {
    day_of_week: 1,
    start_time: '19:00',
    end_time: '19:00',
    meeting_link: 'https://meet.google.com/abc',
  });
  assert.equal(reversedTimes.ok, false);

  // Non-https link fails
  const httpLink = buildTimetableSlotPayload('batch-1', 'sme-1', {
    day_of_week: 1,
    start_time: '10:00',
    end_time: '11:30',
    meeting_link: 'http://zoom.us/j/123456',
  });
  assert.equal(httpLink.ok, false);

  const slots: TimetableSlot[] = [
    {
      id: 's2',
      batch_id: 'b1',
      sme_id: 'sme-1',
      day_of_week: 1,
      start_time: '19:00:00',
      end_time: '20:30:00',
      meeting_link: 'https://meet.google.com/late',
    },
    {
      id: 's1',
      batch_id: 'b1',
      sme_id: 'sme-1',
      day_of_week: 1,
      start_time: '09:30:00',
      end_time: '11:00:00',
      meeting_link: 'https://meet.google.com/early',
    },
    {
      id: 's3',
      batch_id: 'b1',
      sme_id: 'sme-1',
      day_of_week: 6,
      start_time: '10:00:00',
      end_time: '12:00:00',
      meeting_link: 'https://meet.google.com/sat',
    },
  ];
  const grouped = groupTimetableSlotsByDay(slots);
  assert.equal(grouped.length, 7);
  assert.equal(grouped[0].label, 'Monday');
  assert.deepEqual(
    grouped[0].slots.map((s) => s.id),
    ['s1', 's2'],
  );
  assert.equal(grouped[5].label, 'Saturday');
  assert.equal(grouped[5].slots.length, 1);
  assert.equal(grouped[6].label, 'Sunday');
  assert.equal(grouped[6].slots.length, 0);

  // Session validation & newest-first sorting
  const validSession = buildSessionPayload('batch-1', 'sme-1', {
    session_date: '2026-11-02',
    duration_minutes: '90',
    topic: ' Spark Catalyst Optimizer & Tungsten ',
  });
  assert.equal(validSession.ok, true);
  if (validSession.ok) {
    assert.equal(validSession.payload.duration_minutes, 90);
    assert.equal(validSession.payload.topic, 'Spark Catalyst Optimizer & Tungsten');
  }

  const badSession = buildSessionPayload('batch-1', 'sme-1', {
    session_date: '2026-11-02',
    duration_minutes: '0',
    topic: 'Intro',
  });
  assert.equal(badSession.ok, false);

  const orderedSessions = sortSessionsNewestFirst([
    { id: '1', session_date: '2026-10-15' },
    { id: '2', session_date: '2026-11-01' },
    { id: '3', session_date: '2026-10-22' },
  ]);
  assert.deepEqual(
    orderedSessions.map((s) => s.id),
    ['2', '3', '1'],
  );
});

test('placement handover payload validation, status display text, DD-MMM-YYYY formatting, and report filenames', () => {
  assert.equal(formatDateDdMmmYyyy('2026-04-06'), '06-Apr-2026');
  assert.equal(formatDateDdMmmYyyy('2026-11-04T15:30:00Z'), '04-Nov-2026');
  assert.equal(formatDateDdMmmYyyy(null), '');
  assert.equal(formatDateDdMmmYyyy(''), '');

  const fixedDate = new Date(2026, 3, 6, 12, 0, 0); // 6 Apr 2026 local
  assert.equal(
    buildReportFilename('fees-report', fixedDate),
    'fees-report-2026-04-06.xlsx',
  );
  assert.equal(
    buildReportFilename('batches-report', fixedDate),
    'batches-report-2026-04-06.xlsx',
  );
  assert.equal(
    buildReportFilename('placement-report', fixedDate),
    'placement-report-2026-04-06.xlsx',
  );

  const okHandover = buildPlacementHandoverPayload('cand-1', 'admin-7', {
    handover_date: '2026-04-06',
    placement_member_id: 'pm-3',
    notes: ' Strong SQL & Spark portfolio ',
  });
  assert.equal(okHandover.ok, true);
  if (okHandover.ok) {
    assert.deepEqual(okHandover.payload, {
      candidate_id: 'cand-1',
      handover_date: '2026-04-06',
      placement_member_id: 'pm-3',
      notes: 'Strong SQL & Spark portfolio',
      created_by: 'admin-7',
    });
  }

  const missingMember = buildPlacementHandoverPayload('cand-1', 'admin-7', {
    handover_date: '2026-04-06',
    placement_member_id: '  ',
    notes: '',
  });
  assert.equal(missingMember.ok, false);

  assert.equal(formatHandoverStatusText(null), 'Not handed over');
  assert.equal(
    formatHandoverStatusText({
      handed_over: false,
      handover_date: null,
      placement_member: null,
    }),
    'Not handed over',
  );
  assert.equal(
    formatHandoverStatusText({
      handed_over: true,
      handover_date: '2026-04-06',
      placement_member: 'Priya Menon',
    }),
    'Handed over on 06-Apr-2026 to Priya Menon',
  );
});

test('counsellor portfolio metrics and admin Excel reports (numeric money, DD-MMM-YYYY dates, zero sensitive columns)', () => {
  const candidates: CandidateOverview[] = [
    {
      candidate_id: 'c-1',
      candidate_code: 'CND-001',
      full_name: 'Ananya Verma',
      email: 'ananya@example.com',
      phone: '9876500001',
      status: 'active',
      program: 'Data Engineering PG',
      module: 'DE-101 — Spark & Kafka',
      batch_code: 'BAT-01',
      batch_mode: 'online',
      counsellor: 'Rohan Kulkarni',
      net_fee: 125000,
      paid: 50000,
      pending: 75000,
      handed_over: false,
      handover_date: null,
      placement_member: null,
    },
    {
      candidate_id: 'c-2',
      candidate_code: 'CND-002',
      full_name: 'Vikram Nair',
      email: 'vikram@example.com',
      phone: '9876500002',
      status: 'completed',
      program: 'Cloud Architecture',
      module: 'CA-201 — Kubernetes',
      batch_code: 'BAT-02',
      batch_mode: 'offline',
      counsellor: 'Rohan Kulkarni',
      net_fee: 100000,
      paid: 100000,
      pending: 0,
      handed_over: true,
      handover_date: '2026-04-06',
      placement_member: 'Priya Menon',
    },
  ];

  const installments: Array<Pick<InstallmentStatus, 'candidate_id' | 'state'>> = [
    { candidate_id: 'c-1', state: 'paid' },
    { candidate_id: 'c-1', state: 'overdue' },
    { candidate_id: 'c-1', state: 'overdue' },
    { candidate_id: 'c-2', state: 'paid' },
    { candidate_id: 'other-cand', state: 'overdue' }, // ignored for counsellor portfolio
  ];

  const metrics = computeCounsellorPortfolioMetrics(candidates, installments);
  assert.equal(metrics.totalCandidates, 2);
  assert.equal(metrics.totalPendingFees, 75000);
  assert.equal(metrics.overdueInstallmentsCount, 2);
  assert.equal(metrics.handedOverCount, 1);
  assert.equal(metrics.overdueCandidateIds.has('c-1'), true);
  assert.equal(metrics.overdueCandidateIds.has('c-2'), false);

  // Report 1: Fees report with pending > 0 filter
  const feesAll = buildFeesReportRows(candidates, installments, {
    batchFilter: 'all',
    programFilter: 'all',
    counsellorFilter: 'all',
    onlyPendingPositive: false,
  });
  assert.equal(feesAll.excelRows.length, 2);
  assert.equal(feesAll.excelRows[0]['Net fee (INR)'], 125000);
  assert.equal(typeof feesAll.excelRows[0]['Net fee (INR)'], 'number');
  assert.equal(typeof feesAll.excelRows[0]['Paid (INR)'], 'number');
  assert.equal(typeof feesAll.excelRows[0]['Pending (INR)'], 'number');
  assert.equal(feesAll.excelRows[0]['Overdue Installments'], 2);

  // Verify SheetJS binary workbook preserves numeric cells and omits PAN/proofs
  const feesWb = createReportWorkbook(feesAll.excelRows, 'Fees Report');
  const buf = XLSX.write(feesWb, { type: 'buffer', bookType: 'xlsx' });
  const parsedWb = XLSX.read(buf, { type: 'buffer' });
  const sheet = parsedWb.Sheets['Fees Report'];
  // G2, H2, I2 correspond to Net fee (INR), Paid (INR), Pending (INR) on row 2
  assert.equal(sheet['G1'].v, 'Net fee (INR)');
  assert.equal(sheet['G2'].t, 'n');
  assert.equal(sheet['G2'].v, 125000);
  assert.equal(sheet['H2'].t, 'n');
  assert.equal(sheet['H2'].v, 50000);
  assert.equal(sheet['I2'].t, 'n');
  assert.equal(sheet['I2'].v, 75000);
  for (const key of Object.keys(feesAll.excelRows[0])) {
    assert.equal(/pan|proof|storage/i.test(key), false);
  }

  const feesPendingOnly = buildFeesReportRows(candidates, installments, {
    batchFilter: 'all',
    programFilter: 'all',
    counsellorFilter: 'all',
    onlyPendingPositive: true,
  });
  assert.equal(feesPendingOnly.excelRows.length, 1);
  assert.equal(feesPendingOnly.excelRows[0]['Candidate Code'], 'CND-001');

  // Report 2: Batches report
  const batchesReport = buildBatchesReportRows(
    [
      {
        id: 'b-1',
        batch_code: 'BAT-01',
        module_id: 'm-1',
        mode: 'online',
        start_date: '2026-04-06',
        end_date: null,
        location: null,
        timetable_status: 'published',
      },
      {
        id: 'b-2',
        batch_code: 'BAT-02',
        module_id: 'm-2',
        mode: 'offline',
        start_date: '2026-05-12',
        end_date: null,
        location: 'Room 101',
        timetable_status: 'not_set',
      },
    ],
    [
      { id: 'm-1', code: 'DE-101', name: 'Spark & Kafka' },
      { id: 'm-2', code: 'CA-201', name: 'Kubernetes' },
    ],
    [{ batch_id: 'b-1' }, { batch_id: 'b-1' }, { batch_id: 'b-2' }],
    [
      { batch_id: 'b-1', sme_id: 'sme-1' },
      { batch_id: 'b-1', sme_id: 'sme-2' },
    ],
    { moduleFilter: 'all', modeFilter: 'online' },
  );
  assert.equal(batchesReport.excelRows.length, 1);
  assert.deepEqual(batchesReport.excelRows[0], {
    'Batch Code': 'BAT-01',
    Module: 'DE-101 - Spark & Kafka',
    Mode: 'Online',
    'Start Date': '06-Apr-2026',
    'Candidates Count': 2,
    'SMEs Count': 2,
    'Timetable Status': 'Published',
  });

  // Report 3: Placement report
  const placementYes = buildPlacementReportRows(candidates, {
    handedOverFilter: 'yes',
    batchFilter: 'all',
    counsellorFilter: 'all',
  });
  assert.equal(placementYes.excelRows.length, 1);
  assert.deepEqual(placementYes.excelRows[0], {
    'Candidate Code': 'CND-002',
    'Full Name': 'Vikram Nair',
    'Batch Code': 'BAT-02',
    Counsellor: 'Rohan Kulkarni',
    'Handed Over': 'Yes',
    'Handover Date': '06-Apr-2026',
    'Placement Team Member': 'Priya Menon',
  });
});

test('validatePasswordRules enforces length, letter, number, and matching confirmation', () => {
  assert.equal(validatePasswordRules('', '').ok, false);
  assert.equal(validatePasswordRules('short1', 'short1').ok, false);
  assert.equal(validatePasswordRules('nouppernumber', 'nouppernumber').ok, false);
  assert.equal(validatePasswordRules('12345678', '12345678').ok, false);
  assert.equal(validatePasswordRules('ValidPass1', 'ValidPass2').ok, false);
  assert.equal(validatePasswordRules('ValidPass1', 'ValidPass1').ok, true);
  assert.equal(validatePasswordRules('pass1234', 'pass1234').ok, true);
});

test('formatDate formats all dates as DD-MMM-YYYY strictly', () => {
  assert.equal(formatDate('2026-11-06'), '06-Nov-2026');
  assert.equal(formatDate('2026-04-15'), '15-Apr-2026');
  assert.equal(formatDate('2026-01-01'), '01-Jan-2026');
  assert.equal(formatDate(null), '—');
});

test('getIndiaTodayIso returns valid YYYY-MM-DD date string', () => {
  const today = getIndiaTodayIso();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
});

test('findNextDueInstallment ignores paid and submitted installments', () => {
  const schedule: InstallmentStatus[] = [
    {
      id: 'i-1',
      candidate_id: 'cand-1',
      seq: 1,
      due_date: '2026-10-01',
      amount: 20000,
      paid: 20000,
      state: 'paid',
      pending_amount: 0,
    },
    {
      id: 'i-2',
      candidate_id: 'cand-1',
      seq: 2,
      due_date: '2026-10-15',
      amount: 20000,
      paid: 0,
      state: 'submitted',
      pending_amount: 20000,
    },
    {
      id: 'i-3',
      candidate_id: 'cand-1',
      seq: 3,
      due_date: '2026-11-10',
      amount: 20000,
      paid: 0,
      state: 'due_soon',
      pending_amount: 0,
    },
    {
      id: 'i-4',
      candidate_id: 'cand-1',
      seq: 4,
      due_date: '2026-12-10',
      amount: 20000,
      paid: 0,
      state: 'upcoming',
      pending_amount: 0,
    },
  ];

  // i-1 is paid, i-2 is submitted -> earliest non-paid, non-submitted is i-3
  const next = findNextDueInstallment(schedule);
  assert.equal(next?.id, 'i-3');
  assert.equal(next?.state, 'due_soon');

  // If only paid and submitted remain, returns null
  assert.equal(findNextDueInstallment([schedule[0], schedule[1]]), null);
});

test('getInstallmentDueRelativeText returns exact expected relative phrases', () => {
  const fakeToday = '2026-11-06';

  assert.equal(getInstallmentDueRelativeText('2026-11-06', 'due_today', fakeToday), 'Due today');
  assert.equal(getInstallmentDueRelativeText('2026-11-06', 'due_soon', fakeToday), 'Due today');
  assert.equal(getInstallmentDueRelativeText('2026-11-09', 'due_soon', fakeToday), 'Due in 3 days');
  assert.equal(getInstallmentDueRelativeText('2026-11-07', 'due_soon', fakeToday), 'Due tomorrow');
  assert.equal(getInstallmentDueRelativeText('2026-11-04', 'overdue', fakeToday), 'Overdue by 2 days');
  assert.equal(getInstallmentDueRelativeText('2026-11-05', 'overdue', fakeToday), 'Overdue by 1 day');
  assert.equal(getInstallmentDueRelativeText('2026-11-01', 'paid', fakeToday), 'Paid');
  assert.equal(getInstallmentDueRelativeText('2026-11-06', 'submitted', fakeToday), 'Payment submitted');
});

test('ticket payload building strictly validates inputs and never emits forbidden fields', () => {
  // Missing ID or candidate ID
  const missingId = buildTicketCreatePayload({
    id: '',
    candidate_id: 'cand-1',
    category: 'fees_payments',
    subject: 'Fee receipt clarification',
    description: 'Please confirm whether installment 2 was received.',
  });
  assert.equal(missingId.ok, false);

  const missingCandidate = buildTicketCreatePayload({
    id: 't-1',
    candidate_id: '',
    category: 'fees_payments',
    subject: 'Fee receipt clarification',
    description: 'Please confirm whether installment 2 was received.',
  });
  assert.equal(missingCandidate.ok, false);

  // Subject length rules (3 - 150)
  const shortSubject = buildTicketCreatePayload({
    id: 't-1',
    candidate_id: 'cand-1',
    category: 'fees_payments',
    subject: 'Hi',
    description: 'Valid description here',
  });
  assert.equal(shortSubject.ok, false);

  const longSubject = buildTicketCreatePayload({
    id: 't-1',
    candidate_id: 'cand-1',
    category: 'fees_payments',
    subject: 'A'.repeat(151),
    description: 'Valid description here',
  });
  assert.equal(longSubject.ok, false);

  // Description length rules (3 - 4000)
  const shortDesc = buildTicketCreatePayload({
    id: 't-1',
    candidate_id: 'cand-1',
    category: 'fees_payments',
    subject: 'Fee query',
    description: 'Ok',
  });
  assert.equal(shortDesc.ok, false);

  const longDesc = buildTicketCreatePayload({
    id: 't-1',
    candidate_id: 'cand-1',
    category: 'fees_payments',
    subject: 'Fee query',
    description: 'X'.repeat(4001),
  });
  assert.equal(longDesc.ok, false);

  // Valid ticket creation
  const validTicket = buildTicketCreatePayload({
    id: 't-100',
    candidate_id: 'cand-42',
    category: 'technical',
    subject: ' Unable to access meeting link for Batch BAT-01 ',
    description: ' The link throws a 404 error when clicking from the portal. ',
    attachment_path: 'cand-42/tickets/t-100/1762162000000-screenshot.png',
  });
  assert.equal(validTicket.ok, true);
  if (validTicket.ok) {
    assert.equal(validTicket.payload.id, 't-100');
    assert.equal(validTicket.payload.candidate_id, 'cand-42');
    assert.equal(validTicket.payload.category, 'technical');
    assert.equal(
      validTicket.payload.subject,
      'Unable to access meeting link for Batch BAT-01',
    );
    assert.equal(
      validTicket.payload.description,
      'The link throws a 404 error when clicking from the portal.',
    );
    assert.equal(
      validTicket.payload.attachment_path,
      'cand-42/tickets/t-100/1762162000000-screenshot.png',
    );
    // CRITICAL: NEVER send status or ticket_code to Supabase on creation!
    assert.equal('status' in validTicket.payload, false);
    assert.equal('ticket_code' in validTicket.payload, false);
  }

  // Reply message validation
  const emptyReply = buildTicketMessagePayload({
    ticket_id: 't-100',
    body: '   ',
  });
  assert.equal(emptyReply.ok, false);

  const validReply = buildTicketMessagePayload({
    ticket_id: 't-100',
    body: ' We checked the meeting link and updated permissions. ',
    attachment_path: null,
  });
  assert.equal(validReply.ok, true);
  if (validReply.ok) {
    assert.equal(validReply.payload.ticket_id, 't-100');
    assert.equal(
      validReply.payload.body,
      'We checked the meeting link and updated permissions.',
    );
    assert.equal(validReply.payload.attachment_path, null);
    // CRITICAL: NEVER send author_id or author_role (set by server trigger)
    assert.equal('author_id' in validReply.payload, false);
    assert.equal('author_role' in validReply.payload, false);
  }
});

test('ticket attachment path builder enforces bucket path format, max 5 MB, and allowed extensions', () => {
  const upload = validateAndBuildTicketAttachmentUpload(
    'cand-42',
    'tick-999',
    { name: 'Error Log #1.pdf', size: 1024 * 200, type: 'application/pdf' },
    1762162000000,
  );
  assert.equal(upload.ok, true);
  if (upload.ok) {
    assert.equal(
      upload.storagePath,
      'cand-42/tickets/tick-999/1762162000000-Error_Log_1.pdf',
    );
    assert.equal(upload.ext, 'pdf');
  }

  const pngUpload = validateAndBuildTicketAttachmentUpload(
    'cand-42',
    'tick-999',
    { name: 'screen.png', size: 1024 * 50, type: 'image/png' },
    1762162000000,
  );
  assert.equal(pngUpload.ok, true);

  // Oversize > 5 MB
  const oversize = validateAndBuildTicketAttachmentUpload(
    'cand-42',
    'tick-999',
    { name: 'huge.png', size: 5 * 1024 * 1024 + 10, type: 'image/png' },
  );
  assert.equal(oversize.ok, false);

  // Unsupported extension
  const badExt = validateAndBuildTicketAttachmentUpload(
    'cand-42',
    'tick-999',
    { name: 'file.exe', size: 1024, type: 'application/octet-stream' },
  );
  assert.equal(badExt.ok, false);
});

test('formatTicketDateTime formats in Asia/Kolkata 12-hour AM/PM format and handles nulls', () => {
  assert.equal(formatTicketDateTime(null), '—');
  assert.equal(formatTicketDateTime(undefined), '—');

  // Specific ISO timestamp formatted in Kolkata (UTC+5:30)
  // 2026-11-06T10:00:00.000Z is 15:30 IST (03:30 PM)
  const formatted = formatTicketDateTime('2026-11-06T10:00:00.000Z');
  assert.match(formatted, /^06-Nov-2026, 0?3:30 PM$/);

  // Labels
  assert.equal(getTicketCategoryLabel('fees_payments'), 'Fees & payments');
  assert.equal(getTicketCategoryLabel('technical'), 'Technical problem');
  assert.equal(getTicketStatusLabel('open'), 'Open');
  assert.equal(getTicketStatusLabel('in_progress'), 'In progress');
  assert.equal(getTicketStatusLabel('resolved'), 'Resolved');
  assert.equal(getTicketStatusLabel('closed'), 'Closed');
});

test('profile photo upload validation enforces jpg/png only and exact bucket path', () => {
  // Profile photo: accepts JPG
  const jpgCheck = validateAndBuildDocUpload('cand-99', 'profile_photo', {
    name: 'passport_photo.JPG',
    size: 1024 * 500,
    type: 'image/jpeg',
  });
  assert.equal(jpgCheck.ok, true);
  if (jpgCheck.ok) {
    assert.equal(jpgCheck.storagePath, 'cand-99/profile_photo/profile_photo.jpg');
    assert.equal(jpgCheck.ext, 'jpg');
  }

  // Profile photo: accepts PNG
  const pngCheck = validateAndBuildDocUpload('cand-99', 'profile_photo', {
    name: 'photo.png',
    size: 1024 * 200,
    type: 'image/png',
  });
  assert.equal(pngCheck.ok, true);
  if (pngCheck.ok) {
    assert.equal(pngCheck.storagePath, 'cand-99/profile_photo/profile_photo.png');
    assert.equal(pngCheck.ext, 'png');
  }

  // Profile photo: rejects PDF
  const pdfCheck = validateAndBuildDocUpload('cand-99', 'profile_photo', {
    name: 'photo.pdf',
    size: 1024 * 300,
    type: 'application/pdf',
  });
  assert.equal(pdfCheck.ok, false);
});

test('consent acceptance payloads building enforces signature rules and omits accepted_at', () => {
  // Empty candidate ID
  const noCand = buildConsentAcceptancePayloads('', ['clause-1'], 'Rohan Kulkarni');
  assert.equal(noCand.ok, false);

  // Short typed signature name
  const shortSig = buildConsentAcceptancePayloads('cand-1', ['clause-1'], 'R');
  assert.equal(shortSig.ok, false);

  // Valid signature across multiple clauses
  const valid = buildConsentAcceptancePayloads(
    'cand-1',
    ['clause-1', 'clause-2'],
    ' Rohan Kulkarni ',
  );
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.payloads.length, 2);
    assert.deepEqual(valid.payloads[0], {
      candidate_id: 'cand-1',
      clause_id: 'clause-1',
      typed_name: 'Rohan Kulkarni',
    });
    // CRITICAL: NEVER send accepted_at!
    assert.equal('accepted_at' in valid.payloads[0], false);
    assert.equal('accepted_at' in valid.payloads[1], false);
  }
});

test('isMandatoryOnboardingIncomplete accurately checks profile photo and consent progress', () => {
  // Missing photo and missing consent
  assert.equal(
    isMandatoryOnboardingIncomplete({
      photo_status: 'missing',
      consents_accepted: 0,
      consents_required: 2,
    }),
    true,
  );

  // Photo uploaded (pending) but consent not accepted yet
  assert.equal(
    isMandatoryOnboardingIncomplete(
      { photo_status: 'pending', consents_accepted: 1, consents_required: 2 },
      [{ id: '1', candidate_id: 'c1', doc_type: 'profile_photo', storage_path: '', status: 'pending', review_note: null, reviewed_by: null, reviewed_at: null, uploaded_at: null }],
    ),
    true,
  );

  // Both photo uploaded (any status) and all consents accepted
  assert.equal(
    isMandatoryOnboardingIncomplete(
      { photo_status: 'pending', consents_accepted: 2, consents_required: 2 },
      [{ id: '1', candidate_id: 'c1', doc_type: 'profile_photo', storage_path: '', status: 'pending', review_note: null, reviewed_by: null, reviewed_at: null, uploaded_at: null }],
    ),
    false,
  );

  // Status helpers & initials
  assert.equal(getInitials('Priya Menon'), 'PM');
  assert.equal(getInitials('Aarav'), 'AA');
  assert.equal(getInitials(''), 'CD');
  assert.equal(formatPhotoStatusLabel('missing'), 'Missing');
  assert.equal(formatPhotoStatusLabel('pending'), 'Pending');
  assert.equal(formatPhotoStatusLabel('approved'), 'Approved');
  assert.equal(formatPhotoStatusLabel('rejected'), 'Rejected');
  assert.equal(formatConsentStatusLabel(2, 2), 'Accepted');
  assert.equal(formatConsentStatusLabel(1, 2), 'Pending');
});

test('isCandidatePortalBlocked allows onboarding, active, and completed while blocking inactive profiles and dropped candidates', () => {
  // Allowed candidate statuses when profile.active is true
  assert.equal(isCandidatePortalBlocked(true, 'onboarding'), false);
  assert.equal(isCandidatePortalBlocked(true, 'active'), false);
  assert.equal(isCandidatePortalBlocked(true, 'completed'), false);
  assert.equal(isCandidatePortalBlocked(true, null), false);

  // Blocked when candidate status is dropped
  assert.equal(isCandidatePortalBlocked(true, 'dropped'), true);

  // Blocked when profile.active is false regardless of candidate status
  assert.equal(isCandidatePortalBlocked(false, 'onboarding'), true);
  assert.equal(isCandidatePortalBlocked(false, 'active'), true);
  assert.equal(isCandidatePortalBlocked(false, 'completed'), true);
  assert.equal(isCandidatePortalBlocked(false, 'dropped'), true);
});
