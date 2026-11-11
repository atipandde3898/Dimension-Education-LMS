export enum UserRole {
  Admin = 'admin',
  Candidate = 'candidate',
  Sme = 'sme',
  Counsellor = 'counsellor',
  Placement = 'placement',
}

export enum BatchMode {
  Online = 'online',
  Offline = 'offline',
}

export enum CandidateStatus {
  Enrolled = 'enrolled',
  InTraining = 'in_training',
  Certified = 'certified',
  Dropped = 'dropped',
}

export type CandidateStatusValue =
  | 'enrolled'
  | 'in_training'
  | 'certified'
  | 'dropped';

export interface Profile {
  id: string;
  role: 'admin' | 'candidate' | 'sme' | 'counsellor' | 'placement';
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
  status: CandidateStatusValue;
}

export interface CandidateOverview {
  candidate_id: string;
  candidate_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: CandidateStatusValue;
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
  enrolled: number;
  in_training: number;
  certified: number;
  total_pending_fees: number;
  overdue_installments: number;
  handed_over: number;
  open_tickets: number;
}

export enum DocumentType {
  ProfilePhoto = 'profile_photo',
  Pan = 'pan',
  PhotoId = 'photo_id',
  EnrollmentForm = 'enrollment_form',
}

export enum DocumentStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
}

export type DocTypeValue =
  | 'profile_photo'
  | 'pan'
  | 'photo_id'
  | 'enrollment_form';
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

export interface ConsentClause {
  id: string;
  version: number;
  position: number;
  title: string;
  body: string;
  required: boolean;
  active: boolean;
}

export interface ConsentAcceptance {
  id: string;
  candidate_id: string;
  clause_id: string;
  typed_name: string;
  accepted_at: string;
}

export type PhotoStatusValue =
  | 'missing'
  | 'pending'
  | 'approved'
  | 'rejected';

export interface OnboardingStatus {
  candidate_id: string;
  docs_approved: number;
  docs_required: number;
  photo_status: PhotoStatusValue | string;
  consents_required: number;
  consents_accepted: number;
  education_done: boolean;
  work_done: boolean;
  cv_done: boolean;
  onboarding_complete: boolean;
}

export interface CandidateEducation {
  candidate_id: string;
  ssc_year: number | null;
  ssc_percent: number | null;
  hsc_na: boolean;
  hsc_year: number | null;
  hsc_percent: number | null;
  diploma_na: boolean;
  diploma_stream: string | null;
  diploma_year: number | null;
  diploma_percent: number | null;
  graduation_na: boolean;
  graduation_stream: string | null;
  graduation_degree: string | null;
  graduation_year: number | null;
  graduation_percent: number | null;
  graduation_university: string | null;
  pg_na: boolean;
  pg_stream: string | null;
  pg_degree: string | null;
  pg_year: number | null;
  pg_percent: number | null;
  pg_university: string | null;
}

export type WorkTypeValue = 'fresher' | 'professional';

export interface CandidateWork {
  candidate_id: string;
  work_type: WorkTypeValue;
  total_exp_years: number | null;
  sap_consultant_exp_years: number | null;
  sap_end_user_exp_years: number | null;
  relevant_domain_exp_years: number | null;
  current_ctc_lakhs: number | null;
  notice_period_months: number | null;
}

export interface CandidateCv {
  candidate_id: string;
  storage_path: string;
  file_name: string;
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
export type InstallmentStateValue =
  | 'paid'
  | 'submitted'
  | 'overdue'
  | 'due_today'
  | 'due_soon'
  | 'upcoming';

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
  pending_amount?: number | null;
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
  status: CandidateStatusValue;
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

export type TicketCategory =
  | 'fees_payments'
  | 'documents'
  | 'timetable_classes'
  | 'technical'
  | 'other';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface Ticket {
  id: string;
  ticket_code: string;
  candidate_id: string;
  category: TicketCategory;
  subject: string;
  description: string;
  attachment_path: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export type TicketAuthorRole = 'candidate' | 'admin';

export interface TicketMessage {
  id: string;
  ticket_id: string;
  author_id: string;
  author_role: TicketAuthorRole;
  body: string;
  attachment_path: string | null;
  created_at: string;
}

export interface TicketOverview {
  id: string;
  ticket_code: string;
  candidate_id: string;
  candidate_code: string | null;
  candidate_name: string | null;
  batch_code: string | null;
  counsellor: string | null;
  category: TicketCategory;
  subject: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface CandidateProfileFull {
  candidate_id: string;
  candidate_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  stage: CandidateStatusValue;
  program: string | null;
  module: string | null;
  batch_code: string | null;
  ssc_year: number | null;
  ssc_percent: number | null;
  hsc_na: boolean | null;
  hsc_year: number | null;
  hsc_percent: number | null;
  diploma_na: boolean | null;
  diploma_stream: string | null;
  diploma_year: number | null;
  diploma_percent: number | null;
  graduation_na: boolean | null;
  graduation_stream: string | null;
  graduation_degree: string | null;
  graduation_year: number | null;
  graduation_percent: number | null;
  graduation_university: string | null;
  pg_na: boolean | null;
  pg_stream: string | null;
  pg_degree: string | null;
  pg_year: number | null;
  pg_percent: number | null;
  pg_university: string | null;
  work_type: WorkTypeValue | null;
  total_exp_years: number | null;
  sap_consultant_exp_years: number | null;
  sap_end_user_exp_years: number | null;
  relevant_domain_exp_years: number | null;
  current_ctc_lakhs: number | null;
  notice_period_months: number | null;
  cv_path: string | null;
  cv_file_name: string | null;
  photo_path: string | null;
}

export interface Opportunity {
  id: string;
  company: string;
  job_title: string;
  description: string | null;
  jd_path: string | null;
  package_min_lakhs: number | null;
  package_max_lakhs: number | null;
  cancelled: boolean;
  created_at: string;
  created_by?: string | null;
}

export interface CandidateOpportunity {
  recipient_id: string;
  opportunity_id: string;
  company: string;
  job_title: string;
  description: string | null;
  jd_path: string | null;
  package_min_lakhs: number | null;
  package_max_lakhs: number | null;
  sent_at: string;
  expires_at: string;
}

export interface CandidateApplication {
  recipient_id: string;
  opportunity_id: string;
  company: string;
  job_title: string;
  description: string | null;
  jd_path: string | null;
  package_min_lakhs: number | null;
  package_max_lakhs: number | null;
  applied_at: string;
  pipeline_stage: OpportunityPipelineStage | null;
  stage_updated_at: string | null;
  cancelled: boolean;
}

export type OpportunityResponseChoice = 'interested' | 'not_interested';

export type OpportunityResponseState =
  | 'interested'
  | 'not_interested'
  | 'waiting'
  | 'no_response';

export type OpportunityPipelineStage =
  | 'shortlisted'
  | 'interview'
  | 'selected'
  | 'offer_made'
  | 'joined'
  | 'rejected';

export interface OpportunityResponse {
  recipient_id: string;
  opportunity_id: string;
  company: string;
  job_title: string;
  candidate_id: string;
  candidate_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  module: string | null;
  stage: CandidateStatusValue;
  sent_at: string;
  expires_at: string;
  response: OpportunityResponseChoice | null;
  responded_at: string | null;
  pipeline_stage: OpportunityPipelineStage | null;
  stage_note: string | null;
  stage_updated_at: string | null;
  response_state: OpportunityResponseState;
}



