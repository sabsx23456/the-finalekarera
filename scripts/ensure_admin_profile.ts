import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const EMAIL = 'boss@sabonglava.com';
const PASSWORD = 'password123';

async function fixProfile() {
    console.log(`Fixing profile for: ${EMAIL}`);

    const { data: { session }, error } = await supabase.auth.signInWithPassword({
        email: EMAIL,
        password: PASSWORD,
    });

    if (error || !session) {
        console.error("Login failed:", error?.message);
        return;
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (profile) {
        console.log("✅ Profile already exists:", profile);
    } else {
        console.log("⚠️ Profile missing. Inserting now...");
        const { error: insertError } = await supabase
            .from('profiles')
            .insert({
                id: session.user.id,
                username: 'boss_admin',
                role: 'admin',
                credits: 1000000
            });

        if (insertError) {
            console.error("❌ Insert failed:", insertError);
        } else {
            console.log("✅ Profile created successfully!");
        }
    }
}

fixProfile();
