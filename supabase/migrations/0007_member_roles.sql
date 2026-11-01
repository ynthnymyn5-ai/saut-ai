-- Phase 1 roles: Owner, Admin, Manager, Employee.
-- 'agent' and 'viewer' stay valid (existing rows keep working):
--   agent  → treated like employee
--   viewer → read-only
-- New enum values must be committed before use, so they live in their own migration.
alter type member_role add value if not exists 'manager';
alter type member_role add value if not exists 'employee';
