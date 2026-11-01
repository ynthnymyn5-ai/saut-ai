-- ════════════════════════════════════════════════════════════════════════════
-- 0010 — Voice settings (additive, re-runnable)
-- organizations.voice_settings: the business's default assistant voices,
--   e.g. {"voice_ar": "<ElevenLabs voice id>", "voice_en": "<voice id>"}.
-- Per-employee voices live in ai_employees.call_settings (voice_ar / voice_en).
-- Only non-secret voice IDs are stored; the ElevenLabs API key stays in server env.
-- ════════════════════════════════════════════════════════════════════════════
alter table organizations add column if not exists voice_settings jsonb not null default '{}';
do $$ begin
  alter table organizations add constraint organizations_voice_settings_object check (jsonb_typeof(voice_settings) = 'object');
exception when duplicate_object then null; end $$;
