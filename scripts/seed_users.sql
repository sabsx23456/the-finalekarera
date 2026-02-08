-- Bulk Insert Users
-- This script replaces all existing users with the provided list.
-- It deletes from auth.users and all dependent tables in public schema first.
-- It relies on the existing 'handle_new_user' trigger to create profiles, then updates them.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Cleanup dependents first
DELETE FROM public.raffle_entries;
DELETE FROM public.claimed_rewards;
DELETE FROM public.transaction_requests;
DELETE FROM public.transactions;
DELETE FROM public.bets;
DELETE FROM public.admin_logs;
DELETE FROM public.profiles;
DELETE FROM auth.users;


INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) VALUES 
-- ADMINS
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'geraldp56124@sabonglava.com', crypt('4FAS314fY%nhd', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "admin"}', '{"username": "geraldp56124", "role": "admin"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'lorji67142@sabonglava.com', crypt('Z$mlkADh%$', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "admin"}', '{"username": "lorji67142", "role": "admin"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'mben61246@sabonglava.com', crypt('tnEk6215FCsa(@', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "admin"}', '{"username": "mben61246", "role": "admin"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'cyrus7124@sabonglava.com', crypt('KJ(CfsLK412&4%', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "admin"}', '{"username": "cyrus7124", "role": "admin"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '22Cute120618@sabonglava.com', crypt('120618#Valerie', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "admin"}', '{"username": "22Cute120618", "role": "admin"}', now(), now(), '', '', '', ''
),

-- MASTER AGENTS
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'mastergeraldp56124@sabonglava.com', crypt('4FAS314fY%nhd', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "master_agent"}', '{"username": "mastergeraldp56124", "role": "master_agent"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'masterlorji67142@sabonglava.com', crypt('Z$mlkADh%$', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "master_agent"}', '{"username": "masterlorji67142", "role": "master_agent"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'mastermben61246@sabonglava.com', crypt('tnEk6215FCsa(@', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "master_agent"}', '{"username": "mastermben61246", "role": "master_agent"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'mastercyrus7124@sabonglava.com', crypt('KJ(CfsLK412&4%', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "master_agent"}', '{"username": "mastercyrus7124", "role": "master_agent"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'master22Cute120618@sabonglava.com', crypt('120618#Valerie', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "master_agent"}', '{"username": "master22Cute120618", "role": "master_agent"}', now(), now(), '', '', '', ''
),

-- AGENTS
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'agentgeraldp56124@sabonglava.com', crypt('4FAS314fY%nhd', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "agent"}', '{"username": "agentgeraldp56124", "role": "agent"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'agentlorji67142@sabonglava.com', crypt('Z$mlkADh%$', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "agent"}', '{"username": "agentlorji67142", "role": "agent"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'agentmben61246@sabonglava.com', crypt('tnEk6215FCsa(@', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "agent"}', '{"username": "agentmben61246", "role": "agent"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'agentcyrus7124@sabonglava.com', crypt('KJ(CfsLK412&4%', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "agent"}', '{"username": "agentcyrus7124", "role": "agent"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'agent22Cute120618@sabonglava.com', crypt('120618#Valerie', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "agent"}', '{"username": "agent22Cute120618", "role": "agent"}', now(), now(), '', '', '', ''
),

-- USERS/PLAYERS
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'usergeraldp56124@sabonglava.com', crypt('4FAS314fY%nhd', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "user"}', '{"username": "usergeraldp56124", "role": "user"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'userlorji67142@sabonglava.com', crypt('Z$mlkADh%$', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "user"}', '{"username": "userlorji67142", "role": "user"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'usermben61246@sabonglava.com', crypt('tnEk6215FCsa(@', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "user"}', '{"username": "usermben61246", "role": "user"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'usercyrus7124@sabonglava.com', crypt('KJ(CfsLK412&4%', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "user"}', '{"username": "usercyrus7124", "role": "user"}', now(), now(), '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'user22Cute120618@sabonglava.com', crypt('120618#Valerie', gen_salt('bf')), now(), 
    '{"provider": "email", "providers": ["email"], "role": "user"}', '{"username": "user22Cute120618", "role": "user"}', now(), now(), '', '', '', ''
);

-- Fix up profiles created by the trigger
-- Force correct role from auth.users metadata
UPDATE public.profiles p
SET role = (u.raw_user_meta_data->>'role')::public.user_role
FROM auth.users u
WHERE p.id = u.id;

-- Activate and set balances
UPDATE public.profiles
SET 
    status = 'active',
    balance = CASE 
        WHEN role = 'admin' THEN 10000000
        WHEN role = 'master_agent' THEN 5000000
        WHEN role = 'agent' THEN 1000000
        ELSE 1000
    END;
