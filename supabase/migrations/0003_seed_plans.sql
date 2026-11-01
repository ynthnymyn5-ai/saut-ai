-- Proposed launch prices (not confirmed market prices). Annual = 10 × monthly (2 months free).
insert into subscription_plans
  (code, name_en, name_ar, currency, price_monthly, price_annual, max_employees, monthly_voice_minutes, monthly_conversations, max_locations, sort_order, features)
values
  ('starter',  'Starter',  'المبتدئ',   'KWD', 19.000, 190.000,  1,  300,  1000, 1, 1,
    '["1 AI employee","Basic AI conversations","Basic analytics","Knowledge base","300 voice minutes / month","Email support"]'),
  ('business', 'Business', 'الأعمال',   'KWD', 49.000, 490.000,  3, 1200,  5000, 1, 2,
    '["Up to 3 AI employees","Advanced AI conversations","Arabic dialect selection","Call summaries","Appointment booking","WhatsApp integration (when connected)","Advanced analytics","Priority support"]'),
  ('pro',      'Pro',      'الاحترافي', 'KWD', 99.000, 990.000, 10, 4000, 20000, 5, 3,
    '["Up to 10 AI employees","Advanced automation","Multiple business locations","Advanced reporting","Custom AI instructions","Team management","Priority assistance","Higher monthly usage allowance"]')
on conflict (code) do nothing;

insert into platform_settings (key, value) values
  ('trial',           '{"enabled": true, "days": 14, "requires_card": false}'),
  ('annual_discount', '{"months_free": 2}'),
  ('default_currency','"KWD"'),
  ('ai',              '{"chat_model": "gpt-4o-mini", "realtime_model": "gpt-4o-realtime-preview"}')
on conflict (key) do nothing;

-- To make yourself a platform admin after signing up:
--   update users set platform_role = 'admin' where email = 'you@company.com';
