import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- CONFIGURATION ---
const NEW_EMAIL = 'boss@sabonglava.com'; // <--- CHANGE THIS IF YOU WANT
const NEW_PASSWORD = 'password123';      // <--- CHANGE THIS IF YOU WANT
const NEW_USERNAME = 'boss_admin';       // <--- CHANGE THIS IF YOU WANT
// ---------------------

async function createAdmin() {
    console.log(`\nCreating Admin Account: ${NEW_EMAIL}...`);

    // 1. Try to Sign Up
    const { data, error } = await supabase.auth.signUp({
        email: NEW_EMAIL,
        password: NEW_PASSWORD,
        options: {
            data: {
                username: NEW_USERNAME,
                role: 'admin', // This triggers the handle_new_user function to make you an Admin in profiles
            },
        },
    });

    if (error) {
        console.error('❌ Sign Up Error:', error.message);

        // If user already exists, maybe we just need to verify login?
        if (error.message.includes('already registered')) {
            console.log('⚠️ User already exists. Trying to log in to verify...');
        } else {
            return; // Stop on other errors
        }
    }

    // 2. Try to Sign In (Verification)
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: NEW_EMAIL,
        password: NEW_PASSWORD,
    });

    if (loginError) {
        console.error('❌ Login Check Failed:', loginError.message);
        if (loginError.message.includes('Email not confirmed')) {
            console.log('\n!!! IMPORTANT !!!');
            console.log('Your Supabase project has "Email Confirmations" ENABLED.');
            console.log('You cannot log in until you confirm the email.');
            console.log('Go to: https://yopmail.com/ or your real inbox if you used a real email.');
            console.log('OR go to Supabase Dashboard -> Authentication -> Users -> Click on the user -> "Confirm Email".');
        }
        return;
    }

    // 3. Check Profile Table
    if (loginData.session) {
        console.log('✅ Auth Login Successful!');

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', loginData.session.user.id)
            .single();

        if (profile) {
            console.log('✅ Profile Found:', profile.username, '| Role:', profile.role);
            console.log('\n🎉 SUCCESS! You can now log in to the app.');
            console.log(`Email: ${NEW_EMAIL}`);
            console.log(`Password: ${NEW_PASSWORD}`);
        } else {
            console.error('❌ Profile Error: User exists in Auth, but NOT in "profiles" table.');
            console.error('This means the Database Trigger failed.');
            console.error('Did you run the "reset_database.sql" script defined in the previous step?');
        }
    }
}

createAdmin();
