
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { throw new Error("Missing env vars"); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTriggers() {
    console.log("🔍 Inspecting Triggers via RPC...");

    // Attempt to use a custom SQL query if we can't see information_schema directly.
    // Since we likely don't have direct SQL execution capability via client without a wrapper function,
    // we will rely on likely existing RPCs or the fact that sometimes Anon can read schema info if not locked down.

    // Try querying pg_trigger via RPC if `exec_sql` or similar exists? Unlikely.
    // Try querying `information_schema.triggers`

    const { data: triggers, error } = await supabase
        .from('information_schema.triggers')
        .select('trigger_name, event_object_table, action_statement, action_timing')
        .in('event_object_table', ['matches', 'bets', 'profiles']);

    if (error) {
        console.error("❌ Error querying information_schema:", error.message);
        console.log("   (This is expected if RLS is tight. We will try to guess common names.)");
    } else {
        if (triggers.length === 0) {
            console.log("⚠️ No triggers found (or visible).");
        } else {
            console.log("\nFound Triggers:");
            triggers.forEach(t => {
                console.log(`  - Table: ${t.event_object_table} | Name: ${t.trigger_name} | Timing: ${t.action_timing}`);
            });
        }
    }

    // Also Check Functions via RPC if possible?
    console.log("\nIf you see no output above, we effectively have to blindly DROP probable triggers.");
    console.log("Common Suspects for 'Double Payout':");
    console.log("  1. 'on_bet_update' -> credits wallet when bet becomes 'won'");
    console.log("  2. 'handle_winning_bet' -> credits wallet");
    console.log("  3. 'update_user_balance' -> triggered by bet change");
}

inspectTriggers();
