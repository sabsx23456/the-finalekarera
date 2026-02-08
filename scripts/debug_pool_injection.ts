
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { throw new Error("Missing env vars"); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugPool() {
    console.log("--- START DEBUGGING POOL INJECTION ---");

    // 1. Create Test Match
    console.log("\n1. Creating Test Match...");
    const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
            meron_name: 'DEBUG_MERON',
            wala_name: 'DEBUG_WALA',
            status: 'open',
            fight_id: 'DEBUG-' + Date.now()
        })
        .select()
        .single();

    if (matchError) {
        console.error("❌ Failed to create match:", matchError);
        // If this fails, RLS on 'matches' table is likely blocking anon creates.
        // But the user is logged in as admin? 
        // NOTE: This script runs as ANON. If 'matches' requires authentication, this will fail.
        // We can't easily simulate an admin user without a password login.
        // BUT the RPC should work even for anon if we allow it, OR we are testing if the RPC works at all.
        return;
    }
    console.log("✅ Match Created:", match.id);

    try {
        // 2. Test DIRECT Insert (Control Test)
        console.log("\n2. Testing Direct Bet Insert (should likely fail due to RLS)...");
        const { error: directError } = await supabase.from('bets').insert({
            match_id: match.id,
            selection: 'meron',
            amount: 10,
            status: 'pending',
            is_bot: true
        });

        if (directError) {
            console.log("ℹ️ Direct insert failed (Expected if RLS is on):", directError.message);
        } else {
            console.log("⚠️ Direct insert SUCCEEDED. RLS might be off?");
        }

        // 3. Test RPC
        console.log("\n3. Testing 'place_bot_bet' RPC...");
        const { data: rpcData, error: rpcError } = await supabase.rpc('place_bot_bet', {
            p_match_id: match.id,
            p_selection: 'meron',
            p_amount: 500
        });

        if (rpcError) {
            console.error("❌ RPC Failed:", rpcError);
        } else {
            console.log("✅ RPC returned:", rpcData);

            // Verify it actually inserted
            const { count } = await supabase
                .from('bets')
                .select('*', { count: 'exact', head: true })
                .eq('match_id', match.id)
                .eq('amount', 500);

            if (count === 1) {
                console.log("✅ Verified: Bet was inserted into DB.");
            } else {
                console.error("❌ Mismatch: RPC said success but bet not found in DB.");
            }
        }

    } finally {
        // Cleanup
        console.log("\n4. Cleanup...");
        await supabase.from('matches').delete().eq('id', match.id);
        console.log("Done.");
    }
}

debugPool();
