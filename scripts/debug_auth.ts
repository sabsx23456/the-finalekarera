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

const TEST_EMAIL = 'boss@sabonglava.com';
const TEST_PASSWORD = 'password123';

async function testAuth() {
    console.log(`Testing auth for: ${TEST_EMAIL}`);

    const { data: { session }, error: loginError } = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
    });

    if (loginError) {
        console.error("❌ Login Failed:", loginError.message);
        return;
    }

    if (!session) {
        console.error("❌ No session returned.");
        return;
    }

    console.log("✅ Login successful. Token:", session.access_token.substring(0, 10) + "...");
    console.log("Testing RLS: Fetching Profile...");

    // This is the part that was causing AbortError / Recursion
    const start = Date.now();
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    const duration = Date.now() - start;

    if (profileError) {
        console.error("❌ Profile Fetch Failed:", profileError);
        console.error("Duration:", duration, "ms");
        if (duration > 2000) {
            console.error("⚠️  Request took > 2s. This strongly suggests the RLS recursion is NOT fixed.");
        }
    } else {
        console.log("✅ Profile Fetched:", profile);
        console.log("Duration:", duration, "ms");
        console.log("RLS Recursion check passed.");
    }
}

testAuth();
