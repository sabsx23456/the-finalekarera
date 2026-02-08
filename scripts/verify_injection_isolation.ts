
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { throw new Error("Missing env vars"); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyIsolation() {
    console.log("--- VERIFYING INJECTION ISOLATION ---");

    // 1. Find Open Match
    let { data: match } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'open')
        .limit(1)
        .single();

    if (!match) {
        console.log("No open match found.");
        return;
    }

    const startInjected = Number(match.meron_injected || 0);
    const startTotal = Number(match.meron_total || 0);

    console.log(`Initial Injected: ${startInjected}`);
    console.log(`Initial Total: ${startTotal}`);

    // 2. Place USER Bet (Should NOT increase Injected)
    // We simulate user bet via 'place_bot_bet' with source='user' (or default is bot, but let's try to mimic user)
    // Actually, real user bet uses direct INSERT via RLS. We can try that or use helper if RLS blocks.
    // For this test, let's use the RPC but pass source='user' (which we just added support for distinguishing? 
    // Wait, place_bot_bet default source is 'bot'. The UI uses source='injection'.
    // A real user bet has source='user' (default in DB).

    // Let's use RPC with source='user' to simulate a user bet easily
    console.log("Placing USER bet...");
    await supabase.rpc('place_bot_bet', {
        p_match_id: match.id,
        p_selection: 'meron',
        p_amount: 100,
        p_source: 'user'
    });

    // 3. Place INJECTION Bet
    console.log("Placing INJECTION bet...");
    await supabase.rpc('place_bot_bet', {
        p_match_id: match.id,
        p_selection: 'meron',
        p_amount: 50,
        p_source: 'injection'
    });

    await new Promise(r => setTimeout(r, 1000));

    // 4. Verify
    const { data: updated } = await supabase.from('matches').select('*').eq('id', match.id).single();
    const newInjected = Number(updated.meron_injected);
    const newTotal = Number(updated.meron_total);

    console.log(`New Injected: ${newInjected}`);
    console.log(`New Total: ${newTotal}`);

    const injectedDiff = newInjected - startInjected;
    const totalDiff = newTotal - startTotal;

    if (injectedDiff === 50) {
        console.log("✅ SUCCESS: Injected total increased by 50 (ignoring user bet).");
    } else {
        console.error(`❌ FAILURE: Injected total increased by ${injectedDiff} (Expected 50).`);
    }

    if (totalDiff === 150) {
        console.log("✅ SUCCESS: Global total increased by 150 (User + Injection).");
    } else {
        console.error(`❌ FAILURE: Global total increased by ${totalDiff} (Expected 150).`);
    }
}

verifyIsolation();
