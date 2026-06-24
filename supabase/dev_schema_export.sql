-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  display_name text,
  phone text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT companies_pkey PRIMARY KEY (id)
);
CREATE TABLE public.shows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid,
  name text NOT NULL,
  location text,
  show_date date,
  show_mode USER-DEFINED NOT NULL DEFAULT 'manual'::show_mode,
  status USER-DEFINED NOT NULL DEFAULT 'draft'::show_status,
  created_by_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  firing_system text,
  script_adapter text,
  script_filename text,
  script_uploaded_at timestamp with time zone,
  field_map_image_path text,
  field_map_uploaded_at timestamp with time zone,
  show_code text,
  CONSTRAINT shows_pkey PRIMARY KEY (id),
  CONSTRAINT shows_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT shows_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.continuity_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  name text NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'active'::session_status,
  started_by_user_id uuid,
  ended_by_user_id uuid,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT continuity_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT continuity_sessions_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT continuity_sessions_started_by_user_id_fkey FOREIGN KEY (started_by_user_id) REFERENCES public.profiles(id),
  CONSTRAINT continuity_sessions_ended_by_user_id_fkey FOREIGN KEY (ended_by_user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.show_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  user_id uuid,
  role USER-DEFINED NOT NULL,
  display_name_for_show text,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT show_participants_pkey PRIMARY KEY (id),
  CONSTRAINT show_participants_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT show_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.issues (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  session_id uuid,
  issue_source USER-DEFINED NOT NULL DEFAULT 'manual_director_entry'::issue_source,
  issue_type USER-DEFINED NOT NULL DEFAULT 'no_continuity'::issue_type,
  status USER-DEFINED NOT NULL DEFAULT 'new'::issue_status,
  channel_number integer NOT NULL,
  cue_value text NOT NULL,
  position_name text,
  effect_name text,
  assigned_to_user_id uuid,
  created_by_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  director_note text,
  CONSTRAINT issues_pkey PRIMARY KEY (id),
  CONSTRAINT issues_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id),
  CONSTRAINT issues_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT issues_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id),
  CONSTRAINT issues_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.issue_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL,
  old_status USER-DEFINED,
  new_status USER-DEFINED NOT NULL,
  changed_by_user_id uuid,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT issue_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT issue_status_history_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issues(id),
  CONSTRAINT issue_status_history_changed_by_user_id_fkey FOREIGN KEY (changed_by_user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.script_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  channel_number integer NOT NULL,
  cue_value text NOT NULL,
  position_name text,
  effect_name text,
  raw_row jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT script_events_pkey PRIMARY KEY (id),
  CONSTRAINT script_events_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id)
);
CREATE TABLE public.field_map_markers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  marker_type text NOT NULL,
  marker_name text NOT NULL,
  x_percent numeric NOT NULL,
  y_percent numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT field_map_markers_pkey PRIMARY KEY (id),
  CONSTRAINT field_map_markers_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id)
);
CREATE TABLE public.position_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT position_groups_pkey PRIMARY KEY (id),
  CONSTRAINT position_groups_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id)
);
CREATE TABLE public.positions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  group_id uuid,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'manual'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT positions_pkey PRIMARY KEY (id),
  CONSTRAINT positions_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT positions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.position_groups(id)
);
CREATE TABLE public.issue_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL,
  show_id uuid NOT NULL,
  session_id uuid,
  technician_name text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  acknowledged_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT issue_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT issue_assignments_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issues(id),
  CONSTRAINT issue_assignments_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT issue_assignments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id)
);
CREATE TABLE public.additional_technician_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL,
  show_id uuid NOT NULL,
  session_id uuid,
  primary_technician_name text NOT NULL,
  additional_technician_name text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  requested_note text,
  director_note text,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT additional_technician_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT additional_technician_assignments_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issues(id),
  CONSTRAINT additional_technician_assignments_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT additional_technician_assignments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id)
);
CREATE TABLE public.technician_notices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  issue_id uuid,
  show_id uuid NOT NULL,
  session_id uuid,
  technician_name text NOT NULL,
  notice_type text NOT NULL,
  title text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'unread'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  acknowledged_at timestamp with time zone,
  CONSTRAINT technician_notices_pkey PRIMARY KEY (id),
  CONSTRAINT technician_notices_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issues(id),
  CONSTRAINT technician_notices_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT technician_notices_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id)
);
CREATE TABLE public.technician_heartbeats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  session_id uuid NOT NULL,
  technician_name text NOT NULL,
  device_id text,
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT technician_heartbeats_pkey PRIMARY KEY (id),
  CONSTRAINT technician_heartbeats_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT technician_heartbeats_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id)
);
CREATE TABLE public.issue_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL,
  show_id uuid NOT NULL,
  session_id uuid,
  sender_role text NOT NULL,
  sender_technician_name text,
  body text NOT NULL,
  client_message_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT issue_messages_pkey PRIMARY KEY (id),
  CONSTRAINT issue_messages_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issues(id),
  CONSTRAINT issue_messages_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT issue_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id)
);
CREATE TABLE public.issue_message_reads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL,
  show_id uuid NOT NULL,
  session_id uuid,
  reader_role text NOT NULL,
  reader_technician_name text,
  last_read_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT issue_message_reads_pkey PRIMARY KEY (id),
  CONSTRAINT issue_message_reads_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issues(id),
  CONSTRAINT issue_message_reads_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT issue_message_reads_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id)
);
CREATE TABLE public.issue_voice_memos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL,
  show_id uuid NOT NULL,
  session_id uuid NOT NULL,
  sender_role text NOT NULL,
  sender_technician_name text,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  duration_ms integer NOT NULL,
  file_size_bytes bigint NOT NULL,
  client_memo_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT issue_voice_memos_pkey PRIMARY KEY (id),
  CONSTRAINT issue_voice_memos_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issues(id),
  CONSTRAINT issue_voice_memos_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT issue_voice_memos_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id)
);
CREATE TABLE public.issue_voice_memo_reads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL,
  show_id uuid NOT NULL,
  session_id uuid NOT NULL,
  reader_role text NOT NULL,
  reader_technician_name text,
  last_read_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT issue_voice_memo_reads_pkey PRIMARY KEY (id),
  CONSTRAINT issue_voice_memo_reads_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issues(id),
  CONSTRAINT issue_voice_memo_reads_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT issue_voice_memo_reads_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id)
);
CREATE TABLE public.direct_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  session_id uuid NOT NULL,
  technician_name text NOT NULL,
  sender_role text NOT NULL,
  sender_technician_name text,
  body text NOT NULL,
  client_message_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT direct_messages_pkey PRIMARY KEY (id),
  CONSTRAINT direct_messages_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT direct_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id)
);
CREATE TABLE public.direct_message_reads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  session_id uuid NOT NULL,
  technician_name text NOT NULL,
  reader_role text NOT NULL,
  reader_technician_name text,
  last_read_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT direct_message_reads_pkey PRIMARY KEY (id),
  CONSTRAINT direct_message_reads_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT direct_message_reads_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id)
);
CREATE TABLE public.direct_voice_memos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  session_id uuid NOT NULL,
  technician_name text NOT NULL,
  sender_role text NOT NULL,
  sender_technician_name text,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  duration_ms integer NOT NULL,
  file_size_bytes bigint NOT NULL,
  client_memo_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT direct_voice_memos_pkey PRIMARY KEY (id),
  CONSTRAINT direct_voice_memos_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT direct_voice_memos_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id)
);
CREATE TABLE public.direct_voice_memo_reads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  session_id uuid NOT NULL,
  technician_name text NOT NULL,
  reader_role text NOT NULL,
  reader_technician_name text,
  last_read_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT direct_voice_memo_reads_pkey PRIMARY KEY (id),
  CONSTRAINT direct_voice_memo_reads_show_id_fkey FOREIGN KEY (show_id) REFERENCES public.shows(id),
  CONSTRAINT direct_voice_memo_reads_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.continuity_sessions(id)
);