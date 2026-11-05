export enum UserRole {
  Admin = 'admin',
  Candidate = 'candidate',
  Sme = 'sme',
  Counsellor = 'counsellor',
}

export enum BatchMode {
  Online = 'online',
  Offline = 'offline',
}

export enum CandidateStatus {
  Onboarding = 'onboarding',
  Active = 'active',
  Completed = 'completed',
  Dropped = 'dropped',
}

export interface Profile {
  id: string;
  role: 'admin' | 'candidate' | 'sme' | 'counsellor';
  full_name: string;
  email: string;
  phone: string | null;
  active: boolean;
}

export interface Program {
  id: string;
  name: string;
  active: boolean;
}

export interface Module {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface PlacementMember {
  id: string;
  full_name: string;
  email: string;
  active: boolean;
}

export type TimetableStatusValue = 'not_set' | 'published' | 'opted_out';

export interface Batch {
  id: string;
  batch_code: string;
  module_id: string;
  mode: 'online' | 'offline';
  start_date: string;
  end_date: string | null;
  location: string | null;
  timetable_status: TimetableStatusValue | string | null;
  timetable_finalised_at?: string | null;
}

export interface BatchSme {
  batch_id: string;
  sme_id: string;
}

export interface Candidate {
  id: string;
  profile_id: string | null;
  candidate_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  program_id: string;
  module_id: string;
  batch_id: string | null;
  counsellor_id: string | null;
  status: 'onboarding' | 'active' | 'completed' | 'dropped';
}

export interface CandidateOverview {
  candidate_id: string;
  candidate_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: 'onboarding' | 'active' | 'completed' | 'dropped';
  program: string | null;
  module: string | null;
  batch_code: string | null;
  batch_mode: 'online' | 'offline' | null;
  counsellor: string | null;
  net_fee: number | null;
  paid: number | null;
  pending: number | null;
  handed_over: boolean | null;
  handover_date: string | null;
  placement_member: string | null;
}

export interface DashboardStats {
  total_candidates: number;
  onboarding: number;
  active: number;
  total_pending_fees: number;
  overdue_installments: number;
  handed_over: number;
}

export enum DocumentType {
  Pan = 'pan',
  PhotoId = 'photo_id',
  EnrollmentForm = 'enrollment_form',
}

export enum DocumentStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
}

export type DocTypeValue = 'pan' | 'photo_id' | 'enrollment_form';
export type DocStatusValue = 'pending' | 'approved' | 'rejected';

export interface CandidatePan {
  candidate_id: string;
  pan_number: string;
}

export interface CandidateDocument {
  id: string;
  candidate_id: string;
  doc_type: DocTypeValue;
  storage_path: string;
  status: DocStatusValue;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  uploaded_at: string | null;
}

export interface PendingDocumentWithCandidate extends CandidateDocument {
  candidates:
    | { full_name: string; candidate_code: string }
    | Array<{ full_name: string; candidate_code: string }>
    | null;
}

export enum PaymentStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Rejected = 'rejected',
}

export type PaymentStatusValue = 'pending' | 'confirmed' | 'rejected';
export type InstallmentStateValue = 'paid' | 'overdue' | 'upcoming';

export interface FeePlan {
  candidate_id: string;
  total_fee: number;
  discount: number;
  note: string | null;
}

export interface Installment {
  id: string;
  candidate_id: string;
  seq: number;
  due_date: string;
  amount: number;
}

export interface Payment {
  id: string;
  candidate_id: string;
  installment_id: string | null;
  amount: number;
  paid_on: string;
  reference: string | null;
  proof_path: string | null;
  status: PaymentStatusValue;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string | null;
}

export interface CandidateFeesSummary {
  candidate_id: string;
  total_fee: number | null;
  discount: number | null;
  net_fee: number | null;
  paid: number | null;
  pending: number | null;
}

export interface InstallmentStatus {
  id: string;
  candidate_id: string;
  seq: number;
  due_date: string;
  amount: number;
  paid: number;
  state: InstallmentStateValue;
}

export interface PendingPaymentWithCandidate extends Payment {
  candidates:
    | { full_name: string; candidate_code: string }
    | Array<{ full_name: string; candidate_code: string }>
    | null;
}

export interface TimetableSlot {
  id: string;
  batch_id: string;
  sme_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  meeting_link: string;
}

export interface ClassSession {
  id: string;
  batch_id: string;
  sme_id: string;
  session_date: string;
  duration_minutes: number;
  topic: string;
}

export interface SmeBatchCandidate {
  id: string;
  candidate_code: string;
  full_name: string;
  status: 'onboarding' | 'active' | 'completed' | 'dropped';
  batch_id: string | null;
}

export interface PlacementHandover {
  candidate_id: string;
  handover_date: string;
  placement_member_id: string;
  notes: string | null;
  created_by: string | null;
}

export interface CounsellorDocumentRow {
  candidate_id: string;
  doc_type: DocTypeValue;
  status: DocStatusValue;
}

export interface CounsellorPaymentRow {
  id: string;
  candidate_id: string;
  amount: number;
  paid_on: string;
  status: PaymentStatusValue;
}

export type SortDirection = 'asc' | 'desc';


