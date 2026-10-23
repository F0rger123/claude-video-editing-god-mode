/**
 * Shared domain vocabulary. Mirrors the CHECK constraints in
 * supabase/migrations/0001_content_core.sql — change both together.
 */

export const JOB_STATUSES = [
  "incoming",
  "pending_approval",
  "queued",
  "editing",
  "rendering",
  "review",
  "needs_changes",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "archived",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  incoming: "Incoming",
  pending_approval: "Pending Approval",
  queued: "Queued",
  editing: "Editing",
  rendering: "Rendering",
  review: "Review",
  needs_changes: "Needs Changes",
  approved: "Approved",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  archived: "Archived",
};

export const POST_STATUSES = [
  "draft",
  "awaiting_approval",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "linkedin", "threads", "pinterest", "twitter"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  threads: "Threads",
  pinterest: "Pinterest",
  twitter: "X",
};

export type JobForm = "short" | "long";
export type Priority = "low" | "normal" | "high" | "urgent";
export type AccessMode = "agency_only" | "client_upload" | "client_collab";
export type AutomationMode = "manual" | "auto" | "conditional" | "full_auto";
export type OverageBehavior = "block" | "warn" | "require_owner_approval" | "allow_billable";

export const MEDIA_KINDS = [
  "video",
  "photo",
  "audio",
  "broll",
  "logo",
  "reference_video",
  "reference_image",
  "link",
  "note",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  video: "Video",
  photo: "Photo",
  audio: "Audio",
  broll: "B-roll",
  logo: "Logo / asset",
  reference_video: "Reference video",
  reference_image: "Reference image",
  link: "Link",
  note: "Note",
};

/** Package limits. Any missing field means "no limit". */
export type PackageLimits = {
  short_per_month?: number;
  long_per_month?: number;
  videos_per_week?: number;
  revision_rounds?: number;
  max_video_minutes?: number;
  max_simultaneous_jobs?: number;
  turnaround_days?: number;
  included_platforms?: Platform[];
};

export type ApprovalRules = {
  /** Agency (or client) must approve the edit before captions/scheduling. */
  edit_approval?: boolean;
  /** Caption must be approved before the post is sent to Buffer. */
  caption_approval?: boolean;
  /** Final explicit "post it" approval before Buffer. */
  final_post_approval?: boolean;
  /** Edits are shown to the client for approval after the agency passes them. */
  client_review?: boolean;
};

export type ConditionalRules = {
  require_quota?: boolean;
  short_form_only?: boolean;
  agency_uploads_only?: boolean;
  max_duration_minutes?: number;
  require_reference?: boolean;
  categories?: string[];
  trusted_client?: boolean;
};

export type TimeWindow = { start: string; end: string }; // "HH:MM" local to the workspace timezone

export type ScheduleRules = {
  /** 0 = Sunday … 6 = Saturday. Empty / missing = every day. */
  preferred_days?: number[];
  windows?: TimeWindow[];
  min_gap_minutes?: number;
  max_posts_per_day?: number;
  /** Per platform, Monday–Sunday in the workspace timezone ("one post a week"). */
  max_posts_per_week?: number;
  blackout_dates?: string[]; // YYYY-MM-DD
  platform_rules?: Partial<Record<Platform, Omit<ScheduleRules, "platform_rules">>>;
};

export type BrandProfile = {
  about?: string;
  handle?: string;
  voice?: string;
  colors?: string;
  fonts?: string;
  always?: string;
  never?: string;
  cta?: string;
  hashtags?: string;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  is_agency: boolean;
  logo_path: string | null;
  contact_email: string | null;
  brand_profile: BrandProfile;
  editor_brand_folder: string | null;
  allowed_platforms: Platform[];
  access_mode: AccessMode;
  automation_mode: AutomationMode;
  conditional_rules: ConditionalRules;
  default_permissions: Partial<Permissions>;
  package: PackageLimits;
  overage_behavior: OverageBehavior;
  approval_rules: ApprovalRules;
  schedule_rules: ScheduleRules;
  timezone: string;
  posting_frequency: string | null;
  default_post_timing: PostTiming;
  default_post_time: string | null;
  scripts_enabled: boolean;
  scripts_per_batch: number;
  idea_requests_per_month: number;
  ideas_per_request: number;
  archived_at: string | null;
};

/** When an approved video posts: next good slot, right after editing, or a fixed time (e.g. 12:00). */
export type PostTiming = "auto_slot" | "after_edit" | "fixed";

/** Per-upload style picks: a preset id, or "auto" = let Claude decide from the brand's references. */
export type StyleChoices = { captions?: string; sound?: string; edit?: string; notes?: string; /** Library items (sound effects, overlays, LUTs…) to use in this video. */ materials?: string[] };

export type Permissions = {
  can_upload: boolean;
  can_view_drafts: boolean;
  can_comment: boolean;
  can_request_changes: boolean;
  can_approve: boolean;
  can_view_calendar: boolean;
  can_view_published: boolean;
  can_download_final: boolean;
  can_trigger_editing: boolean;
  can_view_scripts: boolean;
  can_swipe_scripts: boolean;
  can_generate_ideas: boolean;
};

export type Job = {
  id: string;
  workspace_id: string;
  title: string;
  form: JobForm;
  platforms: Platform[];
  status: JobStatus;
  review_stage: "agency" | "client" | null;
  needs_attention: boolean;
  attention_reason: string | null;
  priority: Priority;
  due_date: string | null;
  category: string | null;
  client_notes: string | null;
  requested_outputs: number;
  auto_post: boolean | null;
  revision_count: number;
  current_version_id: string | null;
  script_id: string | null;
  post_timing: PostTiming | null;
  post_at: string | null;
  style_choices: StyleChoices;
  source: "agency" | "client" | "drive";
  created_by: string | null;
  queued_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
