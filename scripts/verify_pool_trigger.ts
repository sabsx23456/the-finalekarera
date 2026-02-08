
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
// Need service role to bypass RLS for cleanup if needed, but we can test as anon for 'bets' insert
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) { throw new Error("Missing env vars"); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyPoolTrigger() {
    console.log("--- VERIFYING POOL TRIGGER ---");

    // 1. Create Test Match (Need RPC or Admin logic, but let's assume one open match exists or create one)
    // We'll query for an existing open match or create one via RPC if available? 
    // Since we locked down 'matches', we can't create one easily as ANON.
    // Let's find an 'open' match.

    let { data: match } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'open')
        .limit(1)
        .single();

    if (!match) {
        console.log("No open match found. Cannot verify.");
        // We could create one via SQL tool from the agent side, but this script runs locally.
        // Assuming the user has an open match or we can mock one.
        return;
    }

    const startMeron = Number(match.meron_total || 0);
    console.log(`Match ID: ${match.id}`);
    console.log(`Initial Meron Total: ${startMeron}`);

    // 2. Place a Bet (via RPC place_bot_bet which we know works, OR direct insert if allowed)
    // Direct insert is blocked for ANON if not authenticated? No, we allowed authenticated bets.
    // But this script is ANON. 
    // Let's use the 'place_bot_bet' RPC if it still works for anon (it should, for the injector).

    console.log("Placing 100 on Meron via Bot RPC...");
    const { error: rpcError } = await supabase.rpc('place_bot_bet', {
        p_match_id: match.id,
        p_selection: 'meron',
        p_amount: 100
    });

    if (rpcError) {
        console.error("RPC Error:", rpcError);
        return;
    }

    // 3. Check Match Total
    // Wait a moment for trigger
    await new Promise(r => setTimeout(r, 1000));

    const { data: updatedMatch } = await supabase
        .from('matches')
        .select('meron_total')
        .eq('id', match.id)
        .single();

    const newMeron = Number(updatedMatch.meron_total);
    console.log(`New Meron Total: ${newMeron}`);

    if (newMeron === startMeron + 100) {
        console.log("✅ SUCCESS: Trigger updated match total!");
    } else {
        console.error("❌ FAILURE: Match total did not update correctly.");
    }
}

verifyPoolTrigger();
