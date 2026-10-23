-- God Mode Cut — first-run data. Safe to run more than once.
-- 1. Your own workspace, in FULL AUTO: upload → edit → caption → slot → Buffer → published.
insert into public.content_workspaces (name, slug, is_agency, editor_brand_folder, automation_mode, access_mode, allowed_platforms, approval_rules, schedule_rules, overage_behavior, timezone, brand_profile, scripts_enabled)
values (
  'Studio HQ', 'studio-hq', true, 'Studio HQ', 'full_auto', 'agency_only',
  array['instagram', 'facebook', 'tiktok', 'youtube'],
  '{"edit_approval": false, "caption_approval": false, "final_post_approval": false, "client_review": false}',
  '{"preferred_days": [1,2,3,4,5], "windows": [{"start": "09:00", "end": "11:00"}, {"start": "17:00", "end": "19:00"}], "min_gap_minutes": 180, "max_posts_per_day": 2}',
  'warn', 'America/New_York',
  '{"about": "Studio HQ builds websites, SEO, custom software and social video for brand-scaling businesses.", "voice": "Direct, confident, technical, no hype."}',
  true
)
on conflict (slug) do nothing;

-- 2. Make yourself the owner (replace the email):
-- insert into public.content_staff (user_id, role, display_name)
-- select id, 'owner', 'Owner' from auth.users where email = 'you@example.com'
-- on conflict (user_id) do update set role = 'owner';

-- 3. Optional agency team member:
-- insert into public.content_staff (user_id, role) select id, 'agency' from auth.users where email = 'teammate@example.com';
