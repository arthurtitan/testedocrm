ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS followup_count integer DEFAULT 0;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_followup_at timestamp with time zone DEFAULT NULL;