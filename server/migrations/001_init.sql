create table workspaces(
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null,
  kind text not null check(kind in('production','evaluation')), seeded_at timestamptz, created_at timestamptz not null default now());
create table users(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  email text not null, name text not null,
  role text not null check(role in('regulator','inst_admin','inst_staff','state_officer','verifier','security_admin')),
  password_hash text, institution_id uuid, state text, active boolean not null default true, created_at timestamptz not null default now(),
  unique(workspace_id,email));
create table institutions(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  code text not null, name text not null, state text not null, synthetic boolean not null default false,
  created_at timestamptz not null default now(), unique(workspace_id,code));
alter table users add constraint users_inst_fk foreign key(institution_id) references institutions on delete set null;
create table programmes(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  institution_id uuid not null references institutions on delete cascade, name text not null,
  unique(institution_id,name));
create table approvals(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  programme_id uuid not null references programmes on delete cascade, academic_year text not null,
  approved_intake int not null check(approved_intake>=0), reference text not null, effective_from date not null,
  updated_at timestamptz not null default now(), unique(programme_id,academic_year));
create table students(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  apaar_id text not null, name text not null, created_at timestamptz not null default now(), unique(workspace_id,apaar_id));
create table enrolments(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  student_id uuid not null references students on delete cascade, institution_id uuid not null references institutions on delete cascade,
  programme_id uuid not null references programmes on delete cascade, academic_year text not null,
  reported_name text not null, category text not null, status text not null check(status in('Active','Withdrawn','Transferred','Cancelled')),
  reported_at timestamptz not null default now(), updated_at timestamptz not null default now(), version int not null default 1,
  source text not null default 'import', import_job_id uuid,
  unique(student_id,institution_id,programme_id,academic_year));
create index on enrolments(workspace_id,institution_id,academic_year);
create index on enrolments(workspace_id,student_id);
create index on enrolments(programme_id,academic_year);
create table import_jobs(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  institution_id uuid references institutions, filename text not null, file_hash text not null, status text not null,
  total int not null, accepted int not null, rejected int not null, warnings int not null,
  mapping jsonb, created_by uuid references users, created_at timestamptz not null default now());
create unique index one_import_per_file on import_jobs(workspace_id,coalesce(institution_id,'00000000-0000-0000-0000-000000000000'::uuid),file_hash) where status<>'rejected';
create table import_rows(
  id bigserial primary key, job_id uuid not null references import_jobs on delete cascade, workspace_id uuid not null,
  row_no int not null, status text not null check(status in('accepted','rejected','warning')), issues jsonb not null default '[]', data jsonb not null);
create index on import_rows(job_id);
create index on import_rows(workspace_id,status);
create table policy_rules(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  key text not null, version int not null, name text not null, description text not null default '',
  type text not null, config jsonb not null,
  status text not null check(status in('draft','tested','approved','published','retired')),
  effective_date date not null, owner text not null,
  created_by uuid references users, approved_by uuid references users, published_by uuid references users,
  created_at timestamptz not null default now(), published_at timestamptz, unique(workspace_id,key,version));
create unique index one_published_rule on policy_rules(workspace_id,key) where status='published';
create table recon_runs(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  triggered_by uuid references users, trigger text not null, change_event_id uuid, stats jsonb not null default '{}',
  started_at timestamptz not null default now(), finished_at timestamptz);
create table findings(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  finding_key text not null, type text not null, rule_key text not null, rule_version int not null,
  severity text not null, status text not null check(status in('current','cleared')),
  institution_ids uuid[] not null default '{}', academic_year text, evidence jsonb not null, calculation text not null, recommendation text not null,
  first_run_id uuid, last_run_id uuid, cleared_run_id uuid, cleared_by_change uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id,finding_key));
create table cases(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  seq bigserial, finding_id uuid not null unique references findings on delete cascade,
  status text not null check(status in('Open','Assigned','Clarification Requested','Under Review','Escalated','Resolved','Dismissed')),
  severity text not null, title text not null, assignee_id uuid references users, resolution_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on cases(workspace_id,status);
create table case_events(
  id bigserial primary key, case_id uuid not null references cases on delete cascade, workspace_id uuid not null,
  actor_id uuid, actor_name text not null, kind text not null, from_status text, to_status text, note text, meta jsonb,
  created_at timestamptz not null default now());
create index on case_events(case_id);
create table change_events(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  enrolment_id uuid not null references enrolments on delete cascade, actor_id uuid, actor_name text not null,
  reason text not null, source text not null, fields text[] not null, impact jsonb not null default '{}', created_at timestamptz not null default now());
create table record_versions(
  id bigserial primary key, workspace_id uuid not null, enrolment_id uuid not null references enrolments on delete cascade,
  version int not null, field text not null, old_value text, new_value text, reason text not null,
  actor_name text not null, source text not null, change_event_id uuid references change_events, created_at timestamptz not null default now());
create index on record_versions(enrolment_id);
create table simulations(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  rule_id uuid references policy_rules on delete cascade, rule_key text not null, draft_config jsonb not null, baseline jsonb not null, result jsonb not null,
  created_by uuid references users, created_at timestamptz not null default now());
create table test_runs(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  created_by uuid references users, metrics jsonb not null, scenarios jsonb not null, duration_ms numeric not null, created_at timestamptz not null default now());
create table verification_requests(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  requester_id uuid references users, apaar_masked text not null, apaar_hash text not null, institution_code text not null, purpose text not null,
  status text not null check(status in('answered','revoked','expired')), result jsonb not null, expires_at timestamptz not null, created_at timestamptz not null default now());
create table correction_requests(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces on delete cascade,
  enrolment_id uuid not null references enrolments on delete cascade, requested_by uuid references users, requester_name text not null,
  field text not null, new_value text not null, reason text not null,
  status text not null check(status in('pending','applied','rejected')), decided_by text, decision_note text,
  created_at timestamptz not null default now(), decided_at timestamptz);
create table audit_events(
  id bigserial primary key, workspace_id uuid not null references workspaces on delete cascade, actor_id uuid, actor_name text not null, actor_role text not null,
  action text not null, target_type text, target_id text, institution_id uuid, detail jsonb, created_at timestamptz not null default now());
create index on audit_events(workspace_id,created_at desc);
create table integration_events(
  id bigserial primary key, workspace_id uuid not null references workspaces on delete cascade, integration text not null, status text not null, message text not null, created_at timestamptz not null default now());
create table rate_limits(key text primary key, window_start timestamptz not null, count int not null);
