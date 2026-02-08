import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const admins = ['admin_new_1', 'admin_new_2', 'admin_new_3'];
const mas = ['ma_new_1', 'ma_new_2', 'ma_new_3'];

async function createUsers() {
    console.log('Creating Admins...');
    for (const user of admins) {
        const email = `${user}@sabonglava.com`;
        console.log(`Creating ${email}...`);
        const { data, error } = await supabase.auth.signUp({
            email,
            password: 'password123',
            options: {
                data: {
                    username: user // Store username in metadata too if needed, though profile handles it
                }
            }
        });
        if (error) console.error(`Error creating ${user}:`, error.message);
        else console.log(`Created ${user}: ${data.user?.id}`);
    }

    console.log('Creating Master Agents...');
    for (const user of mas) {
        const email = `${user}@sabonglava.com`;
        console.log(`Creating ${email}...`);
        const { data, error } = await supabase.auth.signUp({
            email,
            password: 'password123',
            options: {
                data: {
                    username: user
                }
            }
        });
        if (error) console.error(`Error creating ${user}:`, error.message);
        else console.log(`Created ${user}: ${data.user?.id}`);
    }
}

createUsers();
