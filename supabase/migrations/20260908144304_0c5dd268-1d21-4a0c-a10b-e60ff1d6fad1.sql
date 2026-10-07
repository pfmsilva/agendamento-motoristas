INSERT INTO public.user_roles (user_id, role)
VALUES ('cdecf862-bbbf-45d6-8b59-362346002c42', 'administrator')
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles
SET name = 'Administrator Demo', email = 'admin.demo@example.com', active = true
WHERE id = 'cdecf862-bbbf-45d6-8b59-362346002c42';
