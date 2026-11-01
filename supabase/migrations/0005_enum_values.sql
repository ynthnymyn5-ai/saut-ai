-- New enum values must be committed before they can be used (Postgres rule),
-- so they live in their own migration ahead of 0006.
alter type plan_code add value if not exists 'enterprise';
