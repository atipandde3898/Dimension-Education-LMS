import type {
  Batch,
  BatchSme,
  Candidate,
  CandidateDocument,
  CandidateFeesSummary,
  CandidateOverview,
  ClassSession,
  DashboardStats,
  DocTypeValue,
  FeePlan,
  InstallmentStateValue,
  InstallmentStatus,
  Module,
  PendingDocumentWithCandidate,
  PendingPaymentWithCandidate,
  PlacementHandover,
  Profile,
  SortDirection,
  TimetableSlot,
  TimetableStatusValue,
  Ticket,
  TicketCategory,
  TicketMessage,
  TicketOverview,
  TicketStatus,
} from '../types/database';

export interface EnvValidationResult {
  valid: boolean;
  missingVars: string[];
  reason?: string;
}

/**
 * Decodes a JWT payload segment safely without throwing to check if a service_role key
 * was mistakenly supplied instead of the public anon key.
 */
function inspectJwtRole(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf-8');
    const parsed = JSON.parse(json) as { role?: unknown };
    return typeof parsed.role === 'string' ? parsed.role : null;
  } catch {
    return null;
  }
}

export function validateSupabaseEnv(
  rawUrl?: string,
  rawAnonKey?: string,
): EnvValidationResult {
  const url = (rawUrl ?? '').trim();
  const anonKey = (rawAnonKey ?? '').trim();
  const missingVars: string[] = [];

  if (!url) missingVars.push('VITE_SUPABASE_URL');
  if (!anonKey) missingVars.push('VITE_SUPABASE_ANON_KEY');

  if (missingVars.length > 0) {
    return {
      valid: false,
      missingVars,
      reason: `Missing required environment variable${missingVars.length > 1 ? 's' : ''}: ${missingVars.join(' and ')}.`,
    };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        missingVars: [],
        reason: 'VITE_SUPABASE_URL must start with https:// or http://.',
      };
    }
  } catch {
    return {
      valid: false,
      missingVars: [],
      reason: 'VITE_SUPABASE_URL is not a valid URL.',
    };
  }

  const jwtRole = inspectJwtRole(anonKey);
  if (jwtRole === 'service_role') {
    return {
      valid: false,
      missingVars: [],
      reason:
        'A service_role key was detected in VITE_SUPABASE_ANON_KEY. Use only the public anon key in the browser.',
    };
  }

  return { valid: true, missingVars: [] };
}

/**
 * Converts Supabase PostgREST, Auth, and PostgreSQL errors into readable prose.
 * Never exposes raw SQL dumps, internal constraint identifiers, or stack traces.
 */
export function formatDbError(error: unknown): string {
  if (!error) {
    return 'An unexpected error occurred. Please try again.';
  }

  if (typeof error === 'string') {
    return sanitizeErrorText(error);
  }

  if (typeof error === 'object') {
    const errObj = error as {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
      status?: number;
    };

    const code = errObj.code ?? '';
    const message = (errObj.message ?? '').toLowerCase();
    const details = (errObj.details ?? '').toLowerCase();

    // Auth errors
    if (
      message.includes('invalid login credentials') ||
      code === 'invalid_credentials'
    ) {
      return 'Incorrect email or password. Please check your credentials and try again.';
    }
    if (message.includes('email not confirmed')) {
      return 'This email address has not been confirmed yet. Please check with an administrator.';
    }
    if (message.includes('jwt expired') || code === 'PGRST301') {
      return 'Your session has expired. Please sign in again.';
    }
    if (message.includes('rate limit') || errObj.status === 429) {
      return 'Too many requests in a short period. Please wait a moment and try again.';
    }
    if (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('load failed')
    ) {
      return 'Unable to reach the server. Check your internet connection and try again.';
    }
    if (message.includes('bucket not found')) {
      return 'Storage bucket "candidate-docs" was not found. Please verify Supabase Storage configuration.';
    }
    if (message.includes('object not found')) {
      return 'The document file could not be found in storage. Please upload the document again.';
    }
    if (
      message.includes('payload too large') ||
      message.includes('exceeded the maximum allowed size') ||
      errObj.status === 413
    ) {
      return 'The selected file exceeds the maximum allowed upload size (5 MB).';
    }
    if (message.includes('mime type') && message.includes('not supported')) {
      return 'This file format is not accepted by storage. Please upload a PDF, JPG, or PNG file.';
    }

    // PostgreSQL / PostgREST error codes
    if (code === '23505') {
      if (details.includes('email') || message.includes('email')) {
        return 'A record with this email address already exists.';
      }
      if (details.includes('code') || message.includes('code')) {
        return 'This code is already in use. Please enter a unique code.';
      }
      if (details.includes('name') || message.includes('name')) {
        return 'A record with this name already exists.';
      }
      if (details.includes('batch_smes') || details.includes('sme_id')) {
        return 'This SME is already assigned to the batch.';
      }
      if (
        details.includes('installments') ||
        details.includes('seq') ||
        message.includes('installments')
      ) {
        return 'An installment with this sequence number already exists for this candidate.';
      }
      return 'A duplicate record already exists with these details.';
    }

    if (code === '23503') {
      if (
        details.includes('payments') ||
        details.includes('installment') ||
        message.includes('payments') ||
        message.includes('installment')
      ) {
        return 'Cannot delete this installment because one or more payments are linked to it.';
      }
      return 'This action references a related record that does not exist or cannot be removed while linked records depend on it.';
    }

    if (code === '23502') {
      return 'One or more required fields are missing. Please fill in all required inputs.';
    }

    if (code === '23514') {
      if (message.includes('module') || message.includes('batch')) {
        return 'The selected batch does not match the candidate module, or locked fields cannot be modified.';
      }
      if (message.includes('time') || details.includes('time')) {
        return 'End time must be after start time.';
      }
      if (message.includes('meeting_link') || details.includes('meeting_link')) {
        return 'Meeting link must start with https://.';
      }
      if (message.includes('date')) {
        return 'Please verify the start and end dates are in a valid order.';
      }
      return 'The submitted values do not satisfy the validation rules for this record.';
    }

    if (code === '42501' || errObj.status === 403) {
      return 'You do not have permission to perform this action.';
    }

    if (code === 'PGRST116') {
      return 'The requested record could not be found or you do not have access to view it.';
    }

    if (code === '22P02') {
      return 'One of the provided fields has an invalid format.';
    }

    if (code.startsWith('P0001') && errObj.message) {
      // Custom database RAISE EXCEPTION message written for users
      return sanitizeErrorText(errObj.message);
    }

    if (errObj.message) {
      return sanitizeErrorText(errObj.message);
    }
  }

  return 'Could not complete the database operation. Please review your input and try again.';
}

function sanitizeErrorText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'An unexpected database error occurred.';
  }
  // Hide raw SQL / relation / constraint syntax if surfaced without a code
  if (
    /violates (unique|foreign key|check|not-null) constraint/i.test(trimmed)
  ) {
    if (/unique/i.test(trimmed)) {
      return 'A record with these details already exists.';
    }
    if (/foreign key/i.test(trimmed)) {
      if (/payments|installment/i.test(trimmed)) {
        return 'Cannot delete this installment because one or more payments are linked to it.';
      }
      return 'This record is linked to other data and cannot be updated or removed in that state.';
    }
    if (/not-null/i.test(trimmed)) {
      return 'A required field was left blank.';
    }
    return 'The submitted data did not pass database validation rules.';
  }
  if (/row-level security policy/i.test(trimmed)) {
    return 'You do not have permission to modify or view this record.';
  }
  if (/relation ".*" does not exist/i.test(trimmed)) {
    return 'A required database table or view could not be accessed. Please verify the Supabase schema setup.';
  }
  // Capitalize first character cleanly
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Resolves which area a user should see after authentication.
 */
export function resolvePortalArea(
  profile: Pick<Profile, 'role' | 'active'> | null,
):
  | 'admin'
  | 'candidate'
  | 'sme'
  | 'counsellor'
  | 'coming_soon'
  | 'inactive'
  | 'missing_profile' {
  if (!profile) return 'missing_profile';
  if (!profile.active) return 'inactive';
  if (profile.role === 'admin') return 'admin';
  if (profile.role === 'candidate') return 'candidate';
  if (profile.role === 'sme') return 'sme';
  if (profile.role === 'counsellor') return 'counsellor';
  return 'coming_soon';
}

/**
 * Rule: A candidate's batch and module cannot be changed once a batch is assigned.
 */
export function isCandidateBatchModuleLocked(
  candidate: Pick<Candidate, 'batch_id'> | null | undefined,
): boolean {
  return Boolean(candidate && candidate.batch_id);
}

/**
 * Rule: A candidate must be assigned to a batch of the same module.
 */
export function filterBatchesByModule(
  batches: Batch[],
  moduleId: string,
): Batch[] {
  if (!moduleId) return [];
  return batches.filter((b) => b.module_id === moduleId);
}

export interface BatchCreateInput {
  module_id: string;
  mode: 'online' | 'offline';
  start_date: string;
  end_date?: string | null;
  location?: string | null;
}

export interface BatchInsertPayload {
  module_id: string;
  mode: 'online' | 'offline';
  start_date: string;
  end_date: string | null;
  location: string | null;
}

/**
 * Builds insert payload for `batches`. Never includes `batch_code` (DB generated).
 * Clears `location` when `mode` is `'online'`.
 */
export function buildBatchCreatePayload(
  input: BatchCreateInput,
): { ok: true; payload: BatchInsertPayload } | { ok: false; error: string } {
  const moduleId = input.module_id.trim();
  const startDate = input.start_date.trim();
  const endDate = (input.end_date ?? '').trim() || null;
  const rawLocation = (input.location ?? '').trim() || null;

  if (!moduleId) {
    return { ok: false, error: 'Please select a module for this batch.' };
  }
  if (input.mode !== 'online' && input.mode !== 'offline') {
    return { ok: false, error: 'Batch mode must be online or offline.' };
  }
  if (!startDate) {
    return { ok: false, error: 'Please select a start date.' };
  }
  if (endDate && endDate < startDate) {
    return {
      ok: false,
      error: 'End date cannot be earlier than the start date.',
    };
  }

  return {
    ok: true,
    payload: {
      module_id: moduleId,
      mode: input.mode,
      start_date: startDate,
      end_date: endDate,
      location: input.mode === 'offline' ? rawLocation : null,
    },
  };
}

export interface CandidateCreateInput {
  full_name: string;
  email: string;
  phone: string;
  program_id: string;
  module_id: string;
  counsellor_id: string;
  batch_id?: string | null;
}

export interface CandidateInsertPayload {
  full_name: string;
  email: string;
  phone: string;
  program_id: string;
  module_id: string;
  counsellor_id: string;
  batch_id: string | null;
  status: 'onboarding';
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Builds insert payload for `candidates`. Never includes `candidate_code` (DB generated).
 * Validates that any optional `batch_id` belongs to the selected `module_id`.
 */
export function buildCandidateCreatePayload(
  input: CandidateCreateInput,
  batches: Pick<Batch, 'id' | 'module_id'>[],
): { ok: true; payload: CandidateInsertPayload } | { ok: false; error: string } {
  const fullName = input.full_name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const programId = input.program_id.trim();
  const moduleId = input.module_id.trim();
  const counsellorId = input.counsellor_id.trim();
  const batchId = (input.batch_id ?? '').trim() || null;

  if (!fullName) {
    return { ok: false, error: 'Full name is required.' };
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!phone) {
    return { ok: false, error: 'Phone number is required.' };
  }
  if (!programId) {
    return { ok: false, error: 'Please select a program.' };
  }
  if (!moduleId) {
    return { ok: false, error: 'Please select a module.' };
  }
  if (!counsellorId) {
    return { ok: false, error: 'Please select an assigned counsellor.' };
  }

  if (batchId) {
    const matchedBatch = batches.find((b) => b.id === batchId);
    if (!matchedBatch) {
      return { ok: false, error: 'The selected batch could not be found.' };
    }
    if (matchedBatch.module_id !== moduleId) {
      return {
        ok: false,
        error: 'The selected batch must belong to the same module as the candidate.',
      };
    }
  }

  return {
    ok: true,
    payload: {
      full_name: fullName,
      email,
      phone,
      program_id: programId,
      module_id: moduleId,
      counsellor_id: counsellorId,
      batch_id: batchId,
      status: 'onboarding',
    },
  };
}

export interface CandidateUpdateInput {
  full_name: string;
  email: string;
  phone: string;
  program_id: string;
  module_id: string;
  batch_id?: string | null;
  counsellor_id?: string | null;
  status: 'onboarding' | 'active' | 'completed' | 'dropped';
}

export interface CandidateUpdatePayload {
  full_name: string;
  email: string;
  phone: string | null;
  program_id: string;
  counsellor_id: string | null;
  status: 'onboarding' | 'active' | 'completed' | 'dropped';
  module_id?: string;
  batch_id?: string | null;
}

/**
 * Builds update payload for `candidates`.
 * Enforces: once `existing.batch_id` is set, `module_id` and `batch_id` are locked
 * and omitted from mutations (and any attempt to alter them is rejected).
 */
export function buildCandidateUpdatePayload(
  existing: Pick<Candidate, 'module_id' | 'batch_id'>,
  input: CandidateUpdateInput,
  batches: Pick<Batch, 'id' | 'module_id'>[],
): { ok: true; payload: CandidateUpdatePayload } | { ok: false; error: string } {
  const fullName = input.full_name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim() || null;
  const programId = input.program_id.trim();
  const counsellorId = (input.counsellor_id ?? '').trim() || null;

  if (!fullName) {
    return { ok: false, error: 'Full name is required.' };
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!programId) {
    return { ok: false, error: 'Please select a program.' };
  }

  const locked = isCandidateBatchModuleLocked(existing);
  if (locked) {
    if (
      input.module_id !== existing.module_id ||
      (input.batch_id ?? null) !== existing.batch_id
    ) {
      return {
        ok: false,
        error:
          'Batch and module cannot be changed once a batch has been assigned to the candidate.',
      };
    }

    return {
      ok: true,
      payload: {
        full_name: fullName,
        email,
        phone,
        program_id: programId,
        counsellor_id: counsellorId,
        status: input.status,
      },
    };
  }

  const moduleId = input.module_id.trim();
  const batchId = (input.batch_id ?? '').trim() || null;

  if (!moduleId) {
    return { ok: false, error: 'Please select a module.' };
  }

  if (batchId) {
    const matchedBatch = batches.find((b) => b.id === batchId);
    if (!matchedBatch) {
      return { ok: false, error: 'The selected batch could not be found.' };
    }
    if (matchedBatch.module_id !== moduleId) {
      return {
        ok: false,
        error: 'The selected batch must belong to the same module as the candidate.',
      };
    }
  }

  return {
    ok: true,
    payload: {
      full_name: fullName,
      email,
      phone,
      program_id: programId,
      counsellor_id: counsellorId,
      status: input.status,
      module_id: moduleId,
      batch_id: batchId,
    },
  };
}

/**
 * Normalizes `v_dashboard` view row safely even if database has 0 records (null aggregates).
 */
export function normalizeDashboardStats(
  row: Partial<DashboardStats> | null | undefined,
): DashboardStats {
  return {
    total_candidates: Number(row?.total_candidates ?? 0),
    onboarding: Number(row?.onboarding ?? 0),
    active: Number(row?.active ?? 0),
    total_pending_fees: Number(row?.total_pending_fees ?? 0),
    overdue_installments: Number(row?.overdue_installments ?? 0),
    handed_over: Number(row?.handed_over ?? 0),
    open_tickets: Number(row?.open_tickets ?? 0),
  };
}

function groupIndianDigits(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const lastThree = intPart.slice(-3);
  const leading = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${leading},${lastThree}`;
}

export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0';
  }
  const num = Number(value);
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const isWhole = Math.abs(abs - Math.round(abs)) < 1e-6;
  if (isWhole) {
    return `${sign}${groupIndianDigits(String(Math.round(abs)))}`;
  }
  const [intStr, decStr] = abs.toFixed(2).split('.');
  return `${sign}${groupIndianDigits(intStr)}.${decStr}`;
}

/**
 * Formats an amount in Indian Rupees with ₹ and Indian digit grouping (e.g. ₹1,25,000).
 */
export function formatInr(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '₹0';
  }
  const num = Number(value);
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const isWhole = Math.abs(abs - Math.round(abs)) < 1e-6;
  if (isWhole) {
    return `${sign}₹${groupIndianDigits(String(Math.round(abs)))}`;
  }
  const [intStr, decStr] = abs.toFixed(2).split('.');
  return `${sign}₹${groupIndianDigits(intStr)}.${decStr}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const monthIdx = Number(month) - 1;
  if (monthIdx < 0 || monthIdx > 11) return dateStr;
  return `${day}-${months[monthIdx]}-${year}`;
}

export type SortComparable = string | number | boolean | null | undefined;

export function filterAndSortRows<T>(
  rows: T[],
  searchQuery: string,
  getSearchableFields: (row: T) => Array<string | null | undefined>,
  getSortValue: (row: T) => SortComparable,
  sortDirection: SortDirection,
): T[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filtered = normalizedQuery
    ? rows.filter((row) =>
        getSearchableFields(row).some((val) =>
          (val ?? '').toLowerCase().includes(normalizedQuery),
        ),
      )
    : [...rows];

  filtered.sort((a, b) => {
    const valA = getSortValue(a);
    const valB = getSortValue(b);

    if (valA === valB) return 0;
    if (valA === null || valA === undefined || valA === '') return 1;
    if (valB === null || valB === undefined || valB === '') return -1;

    let comparison = 0;
    if (typeof valA === 'number' && typeof valB === 'number') {
      comparison = valA - valB;
    } else if (typeof valA === 'boolean' && typeof valB === 'boolean') {
      comparison = valA === valB ? 0 : valA ? -1 : 1;
    } else {
      comparison = String(valA).localeCompare(String(valB), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  return filtered;
}

export function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return formatDate(isoStr);
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }
  return `${partMap.day}-${partMap.month}-${partMap.year}, ${partMap.hour}:${partMap.minute}`;
}

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function normalizeAndValidatePan(
  rawInput: string,
): { ok: true; pan: string } | { ok: false; error: string } {
  const normalized = rawInput.trim().toUpperCase();
  if (!normalized) {
    return { ok: false, error: 'Please enter your 10-character PAN number.' };
  }
  if (!PAN_REGEX.test(normalized)) {
    return {
      ok: false,
      error:
        'Invalid PAN format. Use 5 letters, 4 digits, and 1 letter (e.g. ABCDE1234F).',
    };
  }
  return { ok: true, pan: normalized };
}

/**
 * Masks a PAN strictly as ABCDE****F. Never returns unmasked middle characters.
 */
export function maskPan(pan: string | null | undefined): string | null {
  const cleaned = (pan ?? '').trim().toUpperCase();
  if (!cleaned) return null;
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)}****${cleaned.slice(9)}`;
  }
  if (cleaned.length >= 6) {
    return `${cleaned.slice(0, 5)}****${cleaned.slice(-1)}`;
  }
  return '**********';
}

export const CANDIDATE_DOCS_BUCKET = 'candidate-docs';
export const SIGNED_URL_EXPIRY_SECONDS = 60;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const REQUIRED_DOC_TYPES: DocTypeValue[] = [
  'profile_photo',
  'pan',
  'photo_id',
  'enrollment_form',
];

export const DOC_TYPE_LABELS: Record<DocTypeValue, string> = {
  profile_photo: 'Profile Photo',
  pan: 'PAN Card',
  photo_id: 'Photo / ID Proof',
  enrollment_form: 'Enrollment Form',
};

export function resolveDocumentExtension(
  fileName: string,
  mimeType?: string,
): 'pdf' | 'jpg' | 'png' | null {
  const lowerName = fileName.trim().toLowerCase();
  const lowerMime = (mimeType ?? '').trim().toLowerCase();
  const extMatch = /\.([a-z0-9]+)$/.exec(lowerName);
  const rawExt = extMatch ? extMatch[1] : '';

  if (rawExt === 'pdf' || (!rawExt && lowerMime === 'application/pdf')) {
    return 'pdf';
  }
  if (
    rawExt === 'jpg' ||
    rawExt === 'jpeg' ||
    (!rawExt && (lowerMime === 'image/jpeg' || lowerMime === 'image/jpg'))
  ) {
    return 'jpg';
  }
  if (rawExt === 'png' || (!rawExt && lowerMime === 'image/png')) {
    return 'png';
  }
  return null;
}

/**
 * Validates file type (pdf, jpg, png; profile_photo: jpg, png only) and size (max 5 MB) and builds storage path:
 * `<candidate_id>/<doc_type>/<doc_type>.<ext>`
 */
export function validateAndBuildDocUpload(
  candidateId: string,
  docType: DocTypeValue,
  file: { name: string; size: number; type?: string },
):
  | { ok: true; storagePath: string; ext: 'pdf' | 'jpg' | 'png' }
  | { ok: false; error: string } {
  const trimmedCandidateId = candidateId.trim();
  if (!trimmedCandidateId) {
    return { ok: false, error: 'Candidate identifier is missing.' };
  }
  if (file.size <= 0) {
    return { ok: false, error: 'The selected file is empty.' };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: 'File is larger than 5 MB. Please choose a file up to 5 MB.',
    };
  }
  const ext = resolveDocumentExtension(file.name, file.type);
  if (!ext) {
    return {
      ok: false,
      error:
        docType === 'profile_photo'
          ? 'Profile photo must be a JPG or PNG image.'
          : 'Unsupported file format. Choose a PDF, JPG, or PNG file.',
    };
  }
  if (docType === 'profile_photo' && ext !== 'jpg' && ext !== 'png') {
    return {
      ok: false,
      error: 'Profile photo must be a JPG or PNG image (PDF is not accepted).',
    };
  }
  return {
    ok: true,
    ext,
    storagePath: `${trimmedCandidateId}/${docType}/${docType}.${ext}`,
  };
}

/**
 * Builds candidate `documents` upsert payload. Always sets status = 'pending'.
 */
export function buildCandidateDocUpsertPayload(
  candidateId: string,
  docType: DocTypeValue,
  storagePath: string,
  nowIso = new Date().toISOString(),
) {
  return {
    candidate_id: candidateId,
    doc_type: docType,
    storage_path: storagePath,
    status: 'pending' as const,
    uploaded_at: nowIso,
  };
}

export function buildDocumentApprovePayload(
  adminUserId: string,
  nowIso = new Date().toISOString(),
) {
  return {
    status: 'approved' as const,
    review_note: null,
    reviewed_by: adminUserId,
    reviewed_at: nowIso,
  };
}

export function buildDocumentRejectPayload(
  adminUserId: string,
  reviewNote: string,
  nowIso = new Date().toISOString(),
):
  | {
      ok: true;
      payload: {
        status: 'rejected';
        review_note: string;
        reviewed_by: string;
        reviewed_at: string;
      };
    }
  | { ok: false; error: string } {
  const trimmedNote = reviewNote.trim();
  if (!trimmedNote) {
    return {
      ok: false,
      error: 'Please enter a review note explaining why this document is rejected.',
    };
  }
  return {
    ok: true,
    payload: {
      status: 'rejected',
      review_note: trimmedNote,
      reviewed_by: adminUserId,
      reviewed_at: nowIso,
    },
  };
}

export function computeOnboardingProgress(
  docs: Array<Pick<CandidateDocument, 'doc_type' | 'status'>>,
): { approvedCount: number; totalCount: 4; isComplete: boolean } {
  const approvedSet = new Set<DocTypeValue>();
  for (const doc of docs) {
    if (
      REQUIRED_DOC_TYPES.includes(doc.doc_type) &&
      doc.status === 'approved'
    ) {
      approvedSet.add(doc.doc_type);
    }
  }
  const approvedCount = approvedSet.size;
  return {
    approvedCount,
    totalCount: 4,
    isComplete: approvedCount === 4,
  };
}

export function extractJoinedCandidate(
  row: Pick<PendingDocumentWithCandidate | PendingPaymentWithCandidate, 'candidates'>,
): { full_name: string; candidate_code: string } | null {
  if (!row.candidates) return null;
  if (Array.isArray(row.candidates)) {
    return row.candidates[0] ?? null;
  }
  return row.candidates;
}

export function inferPreviewKind(
  storagePath: string,
): 'pdf' | 'image' | 'other' {
  const lower = storagePath.trim().toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png')
  ) {
    return 'image';
  }
  return 'other';
}

export interface FeePlanInput {
  total_fee: string | number;
  discount: string | number;
  note?: string | null;
}

export interface FeePlanUpsertPayload {
  candidate_id: string;
  total_fee: number;
  discount: number;
  note: string | null;
}

export function buildFeePlanUpsertPayload(
  candidateId: string,
  input: FeePlanInput,
):
  | { ok: true; payload: FeePlanUpsertPayload; netFee: number }
  | { ok: false; error: string } {
  const trimmedCandidateId = candidateId.trim();
  if (!trimmedCandidateId) {
    return { ok: false, error: 'Candidate identifier is missing.' };
  }

  const rawTotal = String(input.total_fee ?? '').trim();
  if (rawTotal === '') {
    return { ok: false, error: 'Please enter the total fee amount.' };
  }
  const totalFee = Number(rawTotal);
  if (!Number.isFinite(totalFee) || totalFee < 0) {
    return { ok: false, error: 'Total fee must be zero or a positive amount.' };
  }

  const rawDiscount = String(input.discount ?? '').trim();
  const discount = rawDiscount === '' ? 0 : Number(rawDiscount);
  if (!Number.isFinite(discount) || discount < 0) {
    return { ok: false, error: 'Discount must be zero or a positive amount.' };
  }
  if (discount > totalFee) {
    return {
      ok: false,
      error: 'Discount cannot exceed the total fee.',
    };
  }

  const cleanTotal = Math.round(totalFee * 100) / 100;
  const cleanDiscount = Math.round(discount * 100) / 100;
  const netFee = Math.round((cleanTotal - cleanDiscount) * 100) / 100;
  const cleanNote = (input.note ?? '').trim() || null;

  return {
    ok: true,
    payload: {
      candidate_id: trimmedCandidateId,
      total_fee: cleanTotal,
      discount: cleanDiscount,
      note: cleanNote,
    },
    netFee,
  };
}

export function hasCandidateFeePlan(
  feePlan: FeePlan | null | undefined,
  feeSummary: CandidateFeesSummary | null | undefined,
): boolean {
  if (feePlan) return true;
  if (!feeSummary) return false;
  return feeSummary.total_fee !== null && feeSummary.total_fee !== undefined;
}

export interface InstallmentInput {
  seq: string | number;
  due_date: string;
  amount: string | number;
}

export function buildInstallmentPayload(
  candidateId: string,
  input: InstallmentInput,
  existingSeqs: number[] = [],
):
  | {
      ok: true;
      payload: {
        candidate_id: string;
        seq: number;
        due_date: string;
        amount: number;
      };
    }
  | { ok: false; error: string } {
  const trimmedCandidateId = candidateId.trim();
  if (!trimmedCandidateId) {
    return { ok: false, error: 'Candidate identifier is missing.' };
  }

  const seqNum = Number(String(input.seq ?? '').trim());
  if (!Number.isInteger(seqNum) || seqNum < 1) {
    return {
      ok: false,
      error: 'Installment sequence must be a whole number starting from 1.',
    };
  }
  if (existingSeqs.includes(seqNum)) {
    return {
      ok: false,
      error: `Installment #${seqNum} already exists for this candidate.`,
    };
  }

  const dueDate = (input.due_date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { ok: false, error: 'Please select a valid due date.' };
  }

  const amountNum = Number(String(input.amount ?? '').trim());
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return {
      ok: false,
      error: 'Installment amount must be greater than ₹0.',
    };
  }

  return {
    ok: true,
    payload: {
      candidate_id: trimmedCandidateId,
      seq: seqNum,
      due_date: dueDate,
      amount: Math.round(amountNum * 100) / 100,
    },
  };
}

export function computeInstallmentMismatch(
  netFee: number | null | undefined,
  installments: Array<{ amount: number }>,
): {
  hasMismatch: boolean;
  installmentsTotal: number;
  netFee: number;
  difference: number;
} {
  if (netFee === null || netFee === undefined || Number.isNaN(Number(netFee))) {
    const sumOnly =
      Math.round(
        installments.reduce((acc, item) => acc + Number(item.amount || 0), 0) *
          100,
      ) / 100;
    return {
      hasMismatch: false,
      installmentsTotal: sumOnly,
      netFee: 0,
      difference: 0,
    };
  }

  const netPaise = Math.round(Number(netFee) * 100);
  const instPaise = Math.round(
    installments.reduce((acc, item) => acc + Number(item.amount || 0), 0) * 100,
  );
  const diffPaise = instPaise - netPaise;

  return {
    hasMismatch: diffPaise !== 0,
    installmentsTotal: instPaise / 100,
    netFee: netPaise / 100,
    difference: diffPaise / 100,
  };
}

/**
 * Finds the earliest installment whose state is not 'paid' and not 'submitted' (ordered by due_date asc, then seq asc).
 */
export function findNextDueInstallment(
  installments: InstallmentStatus[],
): InstallmentStatus | null {
  const eligible = installments.filter(
    (inst) => inst.state !== 'paid' && inst.state !== 'submitted',
  );
  if (eligible.length === 0) return null;

  const sorted = [...eligible].sort((a, b) => {
    const dateCmp = (a.due_date ?? '').localeCompare(b.due_date ?? '');
    if (dateCmp !== 0) return dateCmp;
    return Number(a.seq) - Number(b.seq);
  });

  return sorted[0] ?? null;
}

/**
 * Computes human-friendly relative due text for an installment:
 * e.g. "Due today", "Due in 3 days", "Overdue by 2 days", etc.
 * Uses today's date in Asia/Kolkata timezone.
 */
export function getInstallmentDueRelativeText(
  dueDate: string,
  state?: InstallmentStateValue | null,
  todayIso?: string,
): string {
  if (state === 'paid') return 'Paid';
  if (state === 'submitted') return 'Payment submitted';
  if (state === 'due_today') return 'Due today';

  const refToday = todayIso || getIndiaTodayIso();
  const dueMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate);
  const todayMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(refToday);

  if (!dueMatch || !todayMatch) {
    if (state === 'overdue') return 'Overdue';
    if (state === 'due_soon') return 'Due soon';
    return 'Upcoming';
  }

  const [, dy, dm, dd] = dueMatch;
  const [, ty, tm, td] = todayMatch;

  const dueUtc = Date.UTC(Number(dy), Number(dm) - 1, Number(dd));
  const todayUtc = Date.UTC(Number(ty), Number(tm) - 1, Number(td));
  const diffDays = Math.round((dueUtc - todayUtc) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return 'Due today';
  }
  if (diffDays > 0) {
    return diffDays === 1 ? 'Due tomorrow' : `Due in ${diffDays} days`;
  }
  const absDays = Math.abs(diffDays);
  return absDays === 1 ? 'Overdue by 1 day' : `Overdue by ${absDays} days`;
}

export function sanitizePaymentFilename(
  rawName: string,
  ext: 'pdf' | 'jpg' | 'png',
): string {
  const withoutExt = rawName.trim().replace(/\.[a-z0-9]+$/i, '');
  const cleanedBase = withoutExt
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  const base = cleanedBase || 'payment_proof';
  return `${base}.${ext}`;
}

/**
 * Validates payment proof file (pdf, jpg, png, max 5 MB) and builds storage path:
 * `<candidate_id>/payments/<timestamp>-<filename>`
 */
export function validateAndBuildPaymentProofUpload(
  candidateId: string,
  file: { name: string; size: number; type?: string } | null | undefined,
  timestampMs = Date.now(),
):
  | { ok: true; storagePath: string; ext: 'pdf' | 'jpg' | 'png' }
  | { ok: false; error: string } {
  const trimmedCandidateId = candidateId.trim();
  if (!trimmedCandidateId) {
    return { ok: false, error: 'Candidate identifier is missing.' };
  }
  if (!file) {
    return {
      ok: false,
      error: 'Please choose a payment proof file (PDF, JPG, or PNG).',
    };
  }
  if (file.size <= 0) {
    return { ok: false, error: 'The selected proof file is empty.' };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: 'File is larger than 5 MB. Please choose a file up to 5 MB.',
    };
  }
  const ext = resolveDocumentExtension(file.name, file.type);
  if (!ext) {
    return {
      ok: false,
      error: 'Unsupported file format. Choose a PDF, JPG, or PNG file.',
    };
  }

  const safeFilename = sanitizePaymentFilename(file.name, ext);
  return {
    ok: true,
    ext,
    storagePath: `${trimmedCandidateId}/payments/${timestampMs}-${safeFilename}`,
  };
}

export interface CandidatePaymentCreateInput {
  candidate_id: string;
  installment_id?: string | null;
  amount: string | number;
  paid_on: string;
  reference: string;
  proof_path: string;
}

export interface CandidatePaymentInsertPayload {
  candidate_id: string;
  installment_id: string | null;
  amount: number;
  paid_on: string;
  reference: string;
  proof_path: string;
  status: 'pending';
}

/**
 * Builds insert payload for candidate payment submission.
 * Always sets status = 'pending' and never sends confirmed_by or confirmed_at.
 */
export function buildCandidatePaymentInsertPayload(
  input: CandidatePaymentCreateInput,
):
  | { ok: true; payload: CandidatePaymentInsertPayload }
  | { ok: false; error: string } {
  const candidateId = input.candidate_id.trim();
  if (!candidateId) {
    return { ok: false, error: 'Candidate identifier is missing.' };
  }

  const amountNum = Number(String(input.amount ?? '').trim());
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return { ok: false, error: 'Please enter a valid payment amount greater than ₹0.' };
  }

  const paidOn = (input.paid_on ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    return { ok: false, error: 'Please select the payment date.' };
  }

  const reference = (input.reference ?? '').trim();
  if (!reference) {
    return {
      ok: false,
      error: 'Please enter the transaction reference or UTR number.',
    };
  }

  const proofPath = (input.proof_path ?? '').trim();
  if (!proofPath) {
    return { ok: false, error: 'Payment proof file is required.' };
  }

  const installmentId = (input.installment_id ?? '').trim() || null;

  return {
    ok: true,
    payload: {
      candidate_id: candidateId,
      installment_id: installmentId,
      amount: Math.round(amountNum * 100) / 100,
      paid_on: paidOn,
      reference,
      proof_path: proofPath,
      status: 'pending',
    },
  };
}

export function buildAdminPaymentDecisionPayload(
  adminUserId: string,
  decision: 'confirmed' | 'rejected',
  nowIso = new Date().toISOString(),
): {
  status: 'confirmed' | 'rejected';
  confirmed_by: string;
  confirmed_at: string;
} {
  return {
    status: decision,
    confirmed_by: adminUserId,
    confirmed_at: nowIso,
  };
}

export const DAYS_OF_WEEK: ReadonlyArray<{
  day: number;
  label: string;
  shortLabel: string;
}> = [
  { day: 1, label: 'Monday', shortLabel: 'Mon' },
  { day: 2, label: 'Tuesday', shortLabel: 'Tue' },
  { day: 3, label: 'Wednesday', shortLabel: 'Wed' },
  { day: 4, label: 'Thursday', shortLabel: 'Thu' },
  { day: 5, label: 'Friday', shortLabel: 'Fri' },
  { day: 6, label: 'Saturday', shortLabel: 'Sat' },
  { day: 7, label: 'Sunday', shortLabel: 'Sun' },
];

export function getDayOfWeekLabel(dayOfWeek: number): string {
  const found = DAYS_OF_WEEK.find((d) => d.day === Number(dayOfWeek));
  return found ? found.label : `Day ${dayOfWeek}`;
}

export function normalizeTimetableStatus(
  raw: string | null | undefined,
): TimetableStatusValue {
  const cleaned = (raw ?? '').trim().toLowerCase();
  if (cleaned === 'published') return 'published';
  if (cleaned === 'opted_out') return 'opted_out';
  return 'not_set';
}

export function getTimetableStatusLabel(
  raw: string | null | undefined,
): string {
  const status = normalizeTimetableStatus(raw);
  if (status === 'published') return 'Published';
  if (status === 'opted_out') return 'Opted out';
  return 'Not set';
}

/**
 * Parses "HH:MM" or "HH:MM:SS" into total minutes from midnight (0..1439), or null if invalid.
 */
export function parseTimeMinutes(
  rawTime: string | null | undefined,
): number | null {
  const trimmed = (rawTime ?? '').trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * Normalizes a database time ("18:30:00" or "18:30") to "HH:MM" for <input type="time">.
 */
export function normalizeTimeInput(
  rawTime: string | null | undefined,
): string {
  const total = parseTimeMinutes(rawTime);
  if (total === null) return '';
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Formats a 24-hour time string ("HH:MM" or "HH:MM:SS") in 12-hour format with AM/PM (e.g. "6:30 PM").
 */
export function formatTime12h(rawTime: string | null | undefined): string {
  const total = parseTimeMinutes(rawTime);
  if (total === null) return rawTime ? String(rawTime) : '—';
  const hours24 = Math.floor(total / 60);
  const mins = total % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minStr = String(mins).padStart(2, '0');
  return `${hours12}:${minStr} ${period}`;
}

export function formatTimeRange12h(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  return `${formatTime12h(startTime)} – ${formatTime12h(endTime)}`;
}

/**
 * Formats duration in minutes like "1 h 30 min", "2 h", or "45 min".
 */
export function formatDurationMinutes(
  durationMinutes: number | null | undefined,
): string {
  if (
    durationMinutes === null ||
    durationMinutes === undefined ||
    Number.isNaN(Number(durationMinutes))
  ) {
    return '0 min';
  }
  const total = Math.max(0, Math.round(Number(durationMinutes)));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours > 0 && mins > 0) {
    return `${hours} h ${mins} min`;
  }
  if (hours > 0) {
    return `${hours} h`;
  }
  return `${mins} min`;
}

/**
 * Computes total hours across sessions (sum of duration_minutes / 60, formatted to one decimal).
 */
export function computeTotalSessionHours(
  sessions: Array<Pick<ClassSession, 'duration_minutes'>>,
): { totalMinutes: number; totalHoursFormatted: string } {
  const totalMinutes = sessions.reduce(
    (sum, s) => sum + Math.max(0, Number(s.duration_minutes) || 0),
    0,
  );
  const hours = totalMinutes / 60;
  return {
    totalMinutes,
    totalHoursFormatted: hours.toFixed(1),
  };
}

export interface DaySlotsGroup<TSlot extends TimetableSlot = TimetableSlot> {
  day: number;
  label: string;
  shortLabel: string;
  slots: TSlot[];
}

/**
 * Groups timetable slots into Monday (1) through Sunday (7), sorting slots within each day by start_time.
 */
export function groupTimetableSlotsByDay<
  TSlot extends TimetableSlot = TimetableSlot,
>(slots: TSlot[]): DaySlotsGroup<TSlot>[] {
  return DAYS_OF_WEEK.map(({ day, label, shortLabel }) => {
    const daySlots = slots
      .filter((s) => Number(s.day_of_week) === day)
      .sort((a, b) => {
        const startA = parseTimeMinutes(a.start_time) ?? 0;
        const startB = parseTimeMinutes(b.start_time) ?? 0;
        if (startA !== startB) return startA - startB;
        const endA = parseTimeMinutes(a.end_time) ?? 0;
        const endB = parseTimeMinutes(b.end_time) ?? 0;
        return endA - endB;
      });
    return { day, label, shortLabel, slots: daySlots };
  });
}

export interface TimetableSlotInput {
  day_of_week: number | string;
  start_time: string;
  end_time: string;
  meeting_link: string;
}

export interface TimetableSlotWritePayload {
  batch_id: string;
  sme_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  meeting_link: string;
}

/**
 * Validates a timetable slot and builds the insert/update payload.
 * Enforces day_of_week in 1..7, end_time > start_time, and meeting_link starting with https://.
 */
export function buildTimetableSlotPayload(
  batchId: string,
  smeId: string,
  input: TimetableSlotInput,
):
  | { ok: true; payload: TimetableSlotWritePayload }
  | { ok: false; error: string } {
  const trimmedBatchId = batchId.trim();
  const trimmedSmeId = smeId.trim();
  if (!trimmedBatchId) {
    return { ok: false, error: 'Batch identifier is missing.' };
  }
  if (!trimmedSmeId) {
    return { ok: false, error: 'SME user identifier is missing.' };
  }

  const dayNum = Number(String(input.day_of_week ?? '').trim());
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 7) {
    return {
      ok: false,
      error: 'Please select a valid day of the week (Monday to Sunday).',
    };
  }

  const startMins = parseTimeMinutes(input.start_time);
  if (startMins === null) {
    return { ok: false, error: 'Please enter a valid start time.' };
  }

  const endMins = parseTimeMinutes(input.end_time);
  if (endMins === null) {
    return { ok: false, error: 'Please enter a valid end time.' };
  }

  if (endMins <= startMins) {
    return {
      ok: false,
      error: 'End time must be after the start time.',
    };
  }

  const link = (input.meeting_link ?? '').trim();
  if (!link.startsWith('https://')) {
    return {
      ok: false,
      error:
        'Meeting link must start with https:// (for example, https://meet.google.com/...).',
    };
  }

  try {
    const parsedUrl = new URL(link);
    if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname) {
      return {
        ok: false,
        error: 'Please enter a valid https:// meeting URL.',
      };
    }
  } catch {
    return {
      ok: false,
      error: 'Please enter a valid https:// meeting URL.',
    };
  }

  return {
    ok: true,
    payload: {
      batch_id: trimmedBatchId,
      sme_id: trimmedSmeId,
      day_of_week: dayNum,
      start_time: normalizeTimeInput(input.start_time),
      end_time: normalizeTimeInput(input.end_time),
      meeting_link: link,
    },
  };
}

export interface SessionInput {
  session_date: string;
  duration_minutes: number | string;
  topic: string;
}

export interface SessionWritePayload {
  batch_id: string;
  sme_id: string;
  session_date: string;
  duration_minutes: number;
  topic: string;
}

export function buildSessionPayload(
  batchId: string,
  smeId: string,
  input: SessionInput,
): { ok: true; payload: SessionWritePayload } | { ok: false; error: string } {
  const trimmedBatchId = batchId.trim();
  const trimmedSmeId = smeId.trim();
  if (!trimmedBatchId) {
    return { ok: false, error: 'Batch identifier is missing.' };
  }
  if (!trimmedSmeId) {
    return { ok: false, error: 'SME user identifier is missing.' };
  }

  const sessionDate = (input.session_date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return { ok: false, error: 'Please select a valid session date.' };
  }

  const rawDuration = String(input.duration_minutes ?? '').trim();
  const durationNum = Number(rawDuration);
  if (!rawDuration || !Number.isInteger(durationNum) || durationNum <= 0) {
    return {
      ok: false,
      error: 'Duration must be a whole number of minutes greater than 0.',
    };
  }
  if (durationNum > 1440) {
    return {
      ok: false,
      error: 'Duration cannot exceed 1440 minutes (24 hours).',
    };
  }

  const topic = (input.topic ?? '').trim();
  if (!topic) {
    return { ok: false, error: 'Please enter the topic taught in this session.' };
  }

  return {
    ok: true,
    payload: {
      batch_id: trimmedBatchId,
      sme_id: trimmedSmeId,
      session_date: sessionDate,
      duration_minutes: durationNum,
      topic,
    },
  };
}

export function sortSessionsNewestFirst<
  TSession extends Pick<ClassSession, 'session_date' | 'id'>,
>(sessions: TSession[]): TSession[] {
  return [...sessions].sort((a, b) => {
    const dateCmp = (b.session_date ?? '').localeCompare(a.session_date ?? '');
    if (dateCmp !== 0) return dateCmp;
    return String(b.id ?? '').localeCompare(String(a.id ?? ''));
  });
}

/**
 * Formats an ISO date ("YYYY-MM-DD" or ISO timestamp) strictly as "DD-MMM-YYYY" (e.g. "06-Apr-2026").
 * Returns "" when empty/null so Excel cells stay clean, or caller can fall back to "—".
 */
export function formatDateDdMmmYyyy(
  dateStr: string | null | undefined,
): string {
  const trimmed = (dateStr ?? '').trim();
  if (!trimmed) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) return trimmed;
  const [, year, month, day] = match;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const monthIdx = Number(month) - 1;
  if (monthIdx < 0 || monthIdx > 11) return trimmed;
  return `${day}-${months[monthIdx]}-${year}`;
}

/**
 * Returns today's date in India (Asia/Kolkata) formatted as YYYY-MM-DD.
 */
export function getIndiaTodayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function formatLocalIsoDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export type ReportFilePrefix =
  | 'fees-report'
  | 'batches-report'
  | 'placement-report';

export function buildReportFilename(
  prefix: ReportFilePrefix,
  now = new Date(),
): string {
  return `${prefix}-${formatLocalIsoDate(now)}.xlsx`;
}

export interface PlacementHandoverInput {
  handover_date: string;
  placement_member_id: string;
  notes?: string | null;
}

export function buildPlacementHandoverPayload(
  candidateId: string,
  adminUserId: string,
  input: PlacementHandoverInput,
):
  | { ok: true; payload: PlacementHandover }
  | { ok: false; error: string } {
  const trimmedCandidateId = candidateId.trim();
  const trimmedAdminId = adminUserId.trim();
  if (!trimmedCandidateId) {
    return { ok: false, error: 'Candidate identifier is missing.' };
  }
  if (!trimmedAdminId) {
    return { ok: false, error: 'Admin user identifier is missing.' };
  }

  const handoverDate = (input.handover_date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(handoverDate)) {
    return { ok: false, error: 'Please select a valid handover date.' };
  }

  const memberId = (input.placement_member_id ?? '').trim();
  if (!memberId) {
    return {
      ok: false,
      error: 'Please select an active placement team member.',
    };
  }

  const cleanNotes = (input.notes ?? '').trim() || null;

  return {
    ok: true,
    payload: {
      candidate_id: trimmedCandidateId,
      handover_date: handoverDate,
      placement_member_id: memberId,
      notes: cleanNotes,
      created_by: trimmedAdminId,
    },
  };
}

export function formatHandoverStatusText(
  info:
    | {
        handed_over?: boolean | null;
        handover_date?: string | null;
        placement_member?: string | null;
      }
    | null
    | undefined,
): string {
  if (!info) return 'Not handed over';
  const hasHandover = Boolean(info.handed_over || info.handover_date);
  if (!hasHandover) return 'Not handed over';
  const formattedDate = formatDateDdMmmYyyy(info.handover_date) || '—';
  const memberName = (info.placement_member ?? '').trim() || 'Placement Team';
  return `Handed over on ${formattedDate} to ${memberName}`;
}

export interface CounsellorPortfolioMetrics {
  totalCandidates: number;
  totalPendingFees: number;
  overdueInstallmentsCount: number;
  handedOverCount: number;
  overdueCandidateIds: Set<string>;
}

export function computeCounsellorPortfolioMetrics(
  candidates: CandidateOverview[],
  installments: Array<Pick<InstallmentStatus, 'candidate_id' | 'state'>>,
): CounsellorPortfolioMetrics {
  const candidateIdSet = new Set(candidates.map((c) => c.candidate_id));
  const overdueCandidateIds = new Set<string>();
  let overdueInstallmentsCount = 0;

  for (const inst of installments) {
    if (
      candidateIdSet.has(inst.candidate_id) &&
      inst.state === 'overdue'
    ) {
      overdueInstallmentsCount += 1;
      overdueCandidateIds.add(inst.candidate_id);
    }
  }

  const totalPendingPaise = candidates.reduce((sum, c) => {
    const pendingVal = Number(c.pending ?? 0);
    return sum + (Number.isFinite(pendingVal) ? Math.round(pendingVal * 100) : 0);
  }, 0);

  const handedOverCount = candidates.filter((c) => Boolean(c.handed_over)).length;

  return {
    totalCandidates: candidates.length,
    totalPendingFees: totalPendingPaise / 100,
    overdueInstallmentsCount,
    handedOverCount,
    overdueCandidateIds,
  };
}

export interface CandidateFilterKeys {
  batch_id: string | null;
  program_id: string | null;
  counsellor_id: string | null;
}

export interface FeesReportFilters {
  batchFilter: string; // 'all' | '__unassigned__' | batch_id or batch_code
  programFilter: string; // 'all' | program_id or program name
  counsellorFilter: string; // 'all' | '__unassigned__' | counsellor_id or counsellor name
  onlyPendingPositive: boolean;
}

export interface FeesReportPreviewRow {
  candidate_id: string;
  candidate_code: string;
  full_name: string;
  program: string;
  module: string;
  batch_code: string;
  counsellor: string;
  net_fee: number;
  paid: number;
  pending: number;
  overdue_installments_count: number;
}

export interface FeesReportExcelRow {
  'Candidate Code': string;
  'Full Name': string;
  Program: string;
  Module: string;
  'Batch Code': string;
  Counsellor: string;
  'Net fee (INR)': number;
  'Paid (INR)': number;
  'Pending (INR)': number;
  'Overdue Installments': number;
}

function matchesCandidateBatchFilter(
  candidate: CandidateOverview,
  meta: CandidateFilterKeys | undefined,
  batchFilter: string,
): boolean {
  if (!batchFilter || batchFilter === 'all') return true;
  if (batchFilter === '__unassigned__') {
    return meta ? !meta.batch_id : !candidate.batch_code;
  }
  if (meta?.batch_id && meta.batch_id === batchFilter) return true;
  return (candidate.batch_code ?? '') === batchFilter;
}

function matchesCandidateProgramFilter(
  candidate: CandidateOverview,
  meta: CandidateFilterKeys | undefined,
  programFilter: string,
): boolean {
  if (!programFilter || programFilter === 'all') return true;
  if (meta?.program_id && meta.program_id === programFilter) return true;
  return (candidate.program ?? '') === programFilter;
}

function matchesCandidateCounsellorFilter(
  candidate: CandidateOverview,
  meta: CandidateFilterKeys | undefined,
  counsellorFilter: string,
): boolean {
  if (!counsellorFilter || counsellorFilter === 'all') return true;
  if (counsellorFilter === '__unassigned__') {
    return meta ? !meta.counsellor_id : !candidate.counsellor;
  }
  if (meta?.counsellor_id && meta.counsellor_id === counsellorFilter) {
    return true;
  }
  return (candidate.counsellor ?? '') === counsellorFilter;
}

export function buildFeesReportRows(
  candidates: CandidateOverview[],
  installments: Array<Pick<InstallmentStatus, 'candidate_id' | 'state'>>,
  filters: FeesReportFilters,
  metaByCandidateId?: Map<string, CandidateFilterKeys>,
): {
  previewRows: FeesReportPreviewRow[];
  excelRows: FeesReportExcelRow[];
} {
  const overdueCountByCandidate = new Map<string, number>();
  for (const inst of installments) {
    if (inst.state === 'overdue') {
      overdueCountByCandidate.set(
        inst.candidate_id,
        (overdueCountByCandidate.get(inst.candidate_id) ?? 0) + 1,
      );
    }
  }

  const sortedCandidates = [...candidates].sort((a, b) =>
    (a.candidate_code ?? '').localeCompare(b.candidate_code ?? '', undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );

  const previewRows: FeesReportPreviewRow[] = [];
  const excelRows: FeesReportExcelRow[] = [];

  for (const c of sortedCandidates) {
    const meta = metaByCandidateId?.get(c.candidate_id);
    if (!matchesCandidateBatchFilter(c, meta, filters.batchFilter)) continue;
    if (!matchesCandidateProgramFilter(c, meta, filters.programFilter)) continue;
    if (!matchesCandidateCounsellorFilter(c, meta, filters.counsellorFilter)) {
      continue;
    }

    const netFee = Math.round(Number(c.net_fee ?? 0) * 100) / 100;
    const paid = Math.round(Number(c.paid ?? 0) * 100) / 100;
    const pending = Math.round(Number(c.pending ?? 0) * 100) / 100;

    if (filters.onlyPendingPositive && pending <= 0) continue;

    const overdueCount = overdueCountByCandidate.get(c.candidate_id) ?? 0;

    const row: FeesReportPreviewRow = {
      candidate_id: c.candidate_id,
      candidate_code: c.candidate_code,
      full_name: c.full_name,
      program: c.program || '—',
      module: c.module || '—',
      batch_code: c.batch_code || 'Unassigned',
      counsellor: c.counsellor || '—',
      net_fee: netFee,
      paid,
      pending,
      overdue_installments_count: overdueCount,
    };

    previewRows.push(row);
    excelRows.push({
      'Candidate Code': c.candidate_code,
      'Full Name': c.full_name,
      Program: c.program || '',
      Module: c.module || '',
      'Batch Code': c.batch_code || '',
      Counsellor: c.counsellor || '',
      'Net fee (INR)': netFee,
      'Paid (INR)': paid,
      'Pending (INR)': pending,
      'Overdue Installments': overdueCount,
    });
  }

  return { previewRows, excelRows };
}

export interface BatchesReportFilters {
  moduleFilter: string; // 'all' | module_id
  modeFilter: 'all' | 'online' | 'offline';
}

export interface BatchesReportPreviewRow {
  batch_id: string;
  batch_code: string;
  module: string;
  mode: 'online' | 'offline';
  start_date_formatted: string;
  candidates_count: number;
  smes_count: number;
  timetable_status: TimetableStatusValue;
  timetable_status_label: string;
}

export interface BatchesReportExcelRow {
  'Batch Code': string;
  Module: string;
  Mode: string;
  'Start Date': string;
  'Candidates Count': number;
  'SMEs Count': number;
  'Timetable Status': string;
}

export function buildBatchesReportRows(
  batches: Batch[],
  modules: Array<Pick<Module, 'id' | 'code' | 'name'>>,
  candidateBatchRows: Array<{ batch_id: string | null }>,
  batchSmes: BatchSme[],
  filters: BatchesReportFilters,
): {
  previewRows: BatchesReportPreviewRow[];
  excelRows: BatchesReportExcelRow[];
} {
  const moduleById = new Map(modules.map((m) => [m.id, m]));

  const candidateCountByBatch = new Map<string, number>();
  for (const c of candidateBatchRows) {
    if (c.batch_id) {
      candidateCountByBatch.set(
        c.batch_id,
        (candidateCountByBatch.get(c.batch_id) ?? 0) + 1,
      );
    }
  }

  const smeSetByBatch = new Map<string, Set<string>>();
  for (const bs of batchSmes) {
    let set = smeSetByBatch.get(bs.batch_id);
    if (!set) {
      set = new Set<string>();
      smeSetByBatch.set(bs.batch_id, set);
    }
    set.add(bs.sme_id);
  }

  const sortedBatches = [...batches].sort((a, b) =>
    (a.batch_code ?? '').localeCompare(b.batch_code ?? '', undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );

  const previewRows: BatchesReportPreviewRow[] = [];
  const excelRows: BatchesReportExcelRow[] = [];

  for (const b of sortedBatches) {
    if (
      filters.moduleFilter &&
      filters.moduleFilter !== 'all' &&
      b.module_id !== filters.moduleFilter
    ) {
      continue;
    }
    if (
      filters.modeFilter &&
      filters.modeFilter !== 'all' &&
      b.mode !== filters.modeFilter
    ) {
      continue;
    }

    const mod = moduleById.get(b.module_id);
    const modLabel = mod ? `${mod.code} — ${mod.name}` : '—';
    const startDateFormatted = formatDateDdMmmYyyy(b.start_date);
    const candidatesCount = candidateCountByBatch.get(b.id) ?? 0;
    const smesCount = smeSetByBatch.get(b.id)?.size ?? 0;
    const ttStatus = normalizeTimetableStatus(b.timetable_status);
    const ttLabel = getTimetableStatusLabel(b.timetable_status);
    const modeLabel = b.mode === 'offline' ? 'Offline' : 'Online';

    previewRows.push({
      batch_id: b.id,
      batch_code: b.batch_code,
      module: modLabel,
      mode: b.mode,
      start_date_formatted: startDateFormatted || '—',
      candidates_count: candidatesCount,
      smes_count: smesCount,
      timetable_status: ttStatus,
      timetable_status_label: ttLabel,
    });

    excelRows.push({
      'Batch Code': b.batch_code,
      Module: mod ? `${mod.code} - ${mod.name}` : '',
      Mode: modeLabel,
      'Start Date': startDateFormatted,
      'Candidates Count': candidatesCount,
      'SMEs Count': smesCount,
      'Timetable Status': ttLabel,
    });
  }

  return { previewRows, excelRows };
}

export interface PlacementReportFilters {
  handedOverFilter: 'all' | 'yes' | 'no';
  batchFilter: string; // 'all' | '__unassigned__' | batch_id or batch_code
  counsellorFilter: string; // 'all' | '__unassigned__' | counsellor_id or counsellor name
}

export interface PlacementReportPreviewRow {
  candidate_id: string;
  candidate_code: string;
  full_name: string;
  batch_code: string;
  counsellor: string;
  handed_over: boolean;
  handed_over_label: 'Yes' | 'No';
  handover_date_formatted: string;
  placement_member: string;
}

export interface PlacementReportExcelRow {
  'Candidate Code': string;
  'Full Name': string;
  'Batch Code': string;
  Counsellor: string;
  'Handed Over': 'Yes' | 'No';
  'Handover Date': string;
  'Placement Team Member': string;
}

export function buildPlacementReportRows(
  candidates: CandidateOverview[],
  filters: PlacementReportFilters,
  metaByCandidateId?: Map<string, CandidateFilterKeys>,
): {
  previewRows: PlacementReportPreviewRow[];
  excelRows: PlacementReportExcelRow[];
} {
  const sortedCandidates = [...candidates].sort((a, b) =>
    (a.candidate_code ?? '').localeCompare(b.candidate_code ?? '', undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );

  const previewRows: PlacementReportPreviewRow[] = [];
  const excelRows: PlacementReportExcelRow[] = [];

  for (const c of sortedCandidates) {
    const isHandedOver = Boolean(c.handed_over);
    if (filters.handedOverFilter === 'yes' && !isHandedOver) continue;
    if (filters.handedOverFilter === 'no' && isHandedOver) continue;

    const meta = metaByCandidateId?.get(c.candidate_id);
    if (!matchesCandidateBatchFilter(c, meta, filters.batchFilter)) continue;
    if (!matchesCandidateCounsellorFilter(c, meta, filters.counsellorFilter)) {
      continue;
    }

    const handoverDateFormatted = isHandedOver
      ? formatDateDdMmmYyyy(c.handover_date)
      : '';
    const handedOverLabel: 'Yes' | 'No' = isHandedOver ? 'Yes' : 'No';

    previewRows.push({
      candidate_id: c.candidate_id,
      candidate_code: c.candidate_code,
      full_name: c.full_name,
      batch_code: c.batch_code || 'Unassigned',
      counsellor: c.counsellor || '—',
      handed_over: isHandedOver,
      handed_over_label: handedOverLabel,
      handover_date_formatted: handoverDateFormatted || '—',
      placement_member: isHandedOver ? c.placement_member || '—' : '—',
    });

    excelRows.push({
      'Candidate Code': c.candidate_code,
      'Full Name': c.full_name,
      'Batch Code': c.batch_code || '',
      Counsellor: c.counsellor || '',
      'Handed Over': handedOverLabel,
      'Handover Date': handoverDateFormatted,
      'Placement Team Member': isHandedOver ? c.placement_member || '' : '',
    });
  }

  return { previewRows, excelRows };
}

/**
 * Validates new password rules:
 * - Minimum 8 characters
 * - At least one letter [a-zA-Z]
 * - At least one number [0-9]
 * - Both fields must match
 */
export function validatePasswordRules(
  password: string,
  confirmPassword: string,
): { ok: true } | { ok: false; error: string } {
  if (!password) {
    return { ok: false, error: 'New password is required.' };
  }
  if (password.length < 8) {
    return {
      ok: false,
      error: 'Password must be at least 8 characters long.',
    };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return {
      ok: false,
      error: 'Password must contain at least one letter.',
    };
  }
  if (!/[0-9]/.test(password)) {
    return {
      ok: false,
      error: 'Password must contain at least one number.',
    };
  }
  if (password !== confirmPassword) {
    return {
      ok: false,
      error: 'New password and confirmation do not match.',
    };
  }
  return { ok: true };
}

export const TICKET_CATEGORIES: ReadonlyArray<{
  value: TicketCategory;
  label: string;
}> = [
  { value: 'fees_payments', label: 'Fees & payments' },
  { value: 'documents', label: 'Documents' },
  { value: 'timetable_classes', label: 'Timetable & classes' },
  { value: 'technical', label: 'Technical problem' },
  { value: 'other', label: 'Other' },
];

export function getTicketCategoryLabel(
  category: TicketCategory | string | null | undefined,
): string {
  const found = TICKET_CATEGORIES.find((c) => c.value === category);
  return found ? found.label : (category ?? 'Other');
}

export function getTicketStatusLabel(
  status: TicketStatus | string | null | undefined,
): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'in_progress':
      return 'In progress';
    case 'resolved':
      return 'Resolved';
    case 'closed':
      return 'Closed';
    default:
      return status ? String(status) : 'Open';
  }
}

export interface TicketCreateInput {
  id: string;
  candidate_id: string;
  category: TicketCategory;
  subject: string;
  description: string;
  attachment_path?: string | null;
}

export interface TicketInsertPayload {
  id: string;
  candidate_id: string;
  category: TicketCategory;
  subject: string;
  description: string;
  attachment_path: string | null;
}

/**
 * Validates and builds insert payload for a new ticket.
 * Rules:
 * - subject: 3 to 150 characters
 * - description: 3 to 4000 characters
 * - category: valid TicketCategory
 * - NEVER sends status or ticket_code (database assigns default status and generates ticket_code).
 */
export function buildTicketCreatePayload(
  input: TicketCreateInput,
): { ok: true; payload: TicketInsertPayload } | { ok: false; error: string } {
  const id = (input.id ?? '').trim();
  const candidateId = (input.candidate_id ?? '').trim();
  const subject = (input.subject ?? '').trim();
  const description = (input.description ?? '').trim();
  const category = input.category;

  if (!id) {
    return { ok: false, error: 'Ticket identifier is missing.' };
  }
  if (!candidateId) {
    return { ok: false, error: 'Candidate identifier is missing.' };
  }
  if (
    !['fees_payments', 'documents', 'timetable_classes', 'technical', 'other'].includes(
      category,
    )
  ) {
    return { ok: false, error: 'Please select a valid ticket category.' };
  }
  if (subject.length < 3 || subject.length > 150) {
    return {
      ok: false,
      error: 'Subject must be between 3 and 150 characters.',
    };
  }
  if (description.length < 3 || description.length > 4000) {
    return {
      ok: false,
      error: 'Description must be between 3 and 4000 characters.',
    };
  }

  return {
    ok: true,
    payload: {
      id,
      candidate_id: candidateId,
      category,
      subject,
      description,
      attachment_path: (input.attachment_path ?? '').trim() || null,
    },
  };
}

export interface TicketMessageInput {
  ticket_id: string;
  body: string;
  attachment_path?: string | null;
}

export interface TicketMessageInsertPayload {
  ticket_id: string;
  body: string;
  attachment_path: string | null;
}

/**
 * Validates and builds insert payload for a ticket reply.
 * Never sends author_id or author_role (set by database trigger/session).
 */
export function buildTicketMessagePayload(
  input: TicketMessageInput,
): { ok: true; payload: TicketMessageInsertPayload } | { ok: false; error: string } {
  const ticketId = (input.ticket_id ?? '').trim();
  const body = (input.body ?? '').trim();

  if (!ticketId) {
    return { ok: false, error: 'Ticket identifier is missing.' };
  }
  if (!body) {
    return { ok: false, error: 'Message body cannot be empty.' };
  }
  if (body.length > 4000) {
    return { ok: false, error: 'Message cannot exceed 4000 characters.' };
  }

  return {
    ok: true,
    payload: {
      ticket_id: ticketId,
      body,
      attachment_path: (input.attachment_path ?? '').trim() || null,
    },
  };
}

/**
 * Validates ticket attachment file (pdf, jpg, png, max 5 MB) and builds storage path:
 * `<candidate_id>/tickets/<ticket_id>/<timestamp>-<filename>`
 */
export function validateAndBuildTicketAttachmentUpload(
  candidateId: string,
  ticketId: string,
  file: { name: string; size: number; type?: string } | null | undefined,
  timestampMs = Date.now(),
):
  | { ok: true; storagePath: string; ext: 'pdf' | 'jpg' | 'png' }
  | { ok: false; error: string } {
  const trimmedCandidateId = candidateId.trim();
  const trimmedTicketId = ticketId.trim();
  if (!trimmedCandidateId) {
    return { ok: false, error: 'Candidate identifier is missing.' };
  }
  if (!trimmedTicketId) {
    return { ok: false, error: 'Ticket identifier is missing.' };
  }
  if (!file) {
    return {
      ok: false,
      error: 'Please choose an attachment file (PDF, JPG, or PNG).',
    };
  }
  if (file.size <= 0) {
    return { ok: false, error: 'The selected attachment file is empty.' };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: 'File is larger than 5 MB. Please choose a file up to 5 MB.',
    };
  }
  const ext = resolveDocumentExtension(file.name, file.type);
  if (!ext) {
    return {
      ok: false,
      error: 'Unsupported file format. Choose a PDF, JPG, or PNG file.',
    };
  }

  const safeFilename = sanitizePaymentFilename(file.name, ext);
  return {
    ok: true,
    ext,
    storagePath: `${trimmedCandidateId}/tickets/${trimmedTicketId}/${timestampMs}-${safeFilename}`,
  };
}

/**
 * Formats timestamp as DD-MMM-YYYY with 12-hour time in Asia/Kolkata timezone.
 * e.g. "06-Nov-2026, 03:45 PM"
 */
export function formatTicketDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return formatDate(isoStr);
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const parts = formatter.formatToParts(d);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }
  const day = partMap.day ?? '01';
  const month = partMap.month ?? 'Jan';
  const year = partMap.year ?? '2026';
  const hour = partMap.hour ?? '12';
  const minute = partMap.minute ?? '00';
  const dayPeriod = (partMap.dayPeriod ?? 'AM').toUpperCase();
  return `${day}-${month}-${year}, ${hour}:${minute} ${dayPeriod}`;
}

export interface ConsentAcceptanceInputRow {
  candidate_id: string;
  clause_id: string;
  typed_name: string;
}

/**
 * Validates candidate signature and builds insert rows for consent_acceptances.
 * Strictly never sends accepted_at (server trigger or defaults handle timestamp).
 */
export function buildConsentAcceptancePayloads(
  candidateId: string,
  clauseIds: string[],
  typedName: string,
):
  | { ok: true; payloads: ConsentAcceptanceInputRow[] }
  | { ok: false; error: string } {
  const trimmedId = candidateId.trim();
  const trimmedName = typedName.trim();
  if (!trimmedId) {
    return { ok: false, error: 'Candidate identifier is missing.' };
  }
  if (!clauseIds || clauseIds.length === 0) {
    return { ok: false, error: 'No clauses to accept.' };
  }
  if (trimmedName.length < 2) {
    return {
      ok: false,
      error: 'Please type your full name (at least 2 characters) as your signature.',
    };
  }

  const payloads: ConsentAcceptanceInputRow[] = clauseIds.map((clauseId) => ({
    candidate_id: trimmedId,
    clause_id: clauseId,
    typed_name: trimmedName,
  }));

  return { ok: true, payloads };
}

/**
 * Extract 1-2 letter initials for user/candidate avatars.
 */
export function getInitials(name?: string | null): string {
  if (!name) return 'CD';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Human label for v_onboarding_status.photo_status
 */
export function formatPhotoStatusLabel(
  status: string | null | undefined,
): string {
  const normalized = (status ?? '').toLowerCase().trim();
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'rejected') return 'Rejected';
  return 'Missing';
}

/**
 * Human label for consent acceptance status
 */
export function formatConsentStatusLabel(
  consentsAccepted: number | null | undefined,
  consentsRequired: number | null | undefined,
): string {
  const accepted = Number(consentsAccepted ?? 0);
  const required = Number(consentsRequired ?? 0);
  if (required > 0 && accepted >= required) return 'Accepted';
  return 'Pending';
}

/**
 * Determines whether mandatory onboarding requirements are incomplete:
 * Candidate must have uploaded a profile photo (any status) AND accepted all required consents.
 */
export function isMandatoryOnboardingIncomplete(
  onboardingStatus: {
    photo_status?: string | null;
    consents_accepted?: number | null;
    consents_required?: number | null;
  } | null | undefined,
  documents: CandidateDocument[] = [],
): boolean {
  const hasProfilePhotoDoc = documents.some(
    (d) => d.doc_type === 'profile_photo',
  );
  const photoStatus = (onboardingStatus?.photo_status ?? '').toLowerCase();
  const hasPhoto =
    hasProfilePhotoDoc || (photoStatus !== '' && photoStatus !== 'missing');

  const consentsAccepted = Number(onboardingStatus?.consents_accepted ?? 0);
  const consentsRequired = Number(onboardingStatus?.consents_required ?? 0);
  const hasConsents =
    consentsRequired > 0 ? consentsAccepted >= consentsRequired : false;

  return !hasPhoto || !hasConsents;
}

/**
 * A candidate may access the portal while status is 'onboarding', 'active', or 'completed'.
 * Only block access when profiles.active is false or candidates.status is 'dropped'.
 */
export function isCandidatePortalBlocked(
  profileActive: boolean | null | undefined,
  candidateStatus: Candidate['status'] | string | null | undefined,
): boolean {
  if (!profileActive) return true;
  return candidateStatus === 'dropped';
}
