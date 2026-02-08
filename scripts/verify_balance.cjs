const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Load local env vars from repo root (optional, but convenient for dev).
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

// Admin credentials for this test script only.
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
    process.exit(1);
}
if (!adminEmail || !adminPassword) {
    console.error("Missing env vars: ADMIN_EMAIL / ADMIN_PASSWORD");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyBalance() {
    console.log("Starting verification...");

    // 1. Login as Admin
    console.log("Logging in as admin...");
    const { data: { session }, error: loginError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: adminPassword,
    });

    if (loginError) {
        console.error("Login failed:", loginError);
        return;
    }
    console.log("Login successful. User:", session.user.email);

    // 2. Fetch a user to update (any user that's not the admin user).
    const { data: targetUser, error: fetchError } = await supabase
        .from('profiles')
        .select('id, username, balance')
        .neq('id', session.user.id)
        .limit(1)
        .maybeSingle();

    if (fetchError || !targetUser) {
        console.error("Fetch user failed or no target user found:", fetchError);
        return;
    }
    const initialBalance = Number(targetUser.balance) || 0;
    console.log(`Target User: ${targetUser.username}, Initial Balance: ${initialBalance}`);

    // 3. Update Balance
    const addAmount = 50;
    const newExpectedBalance = initialBalance + addAmount;
    console.log(`Attempting to add ${addAmount}... Expected: ${newExpectedBalance}`);

    const { error: updateError } = await supabase
        .from('profiles')
        .update({ balance: newExpectedBalance })
        .eq('id', targetUser.id);

    if (updateError) {
        console.error("Update failed:", updateError);
        console.error("Note: This requires RLS policies that allow the admin user to update the target profile.");
        return;
    }
    console.log("Update command sent successfully.");

    // 4. Verification Fetch
    // Wait small delay
    await new Promise(r => setTimeout(r, 1000));

    const { data: updatedUser, error: verifyError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUser.id)
        .single();

    if (verifyError) {
        console.error("Verification fetch failed:", verifyError);
        return;
    }

    const finalBalance = Number(updatedUser.balance);
    console.log(`Final Balance: ${finalBalance}`);

    if (finalBalance === newExpectedBalance) {
        console.log("SUCCESS: Balance updated correctly.");
    } else {
        console.error(`FAILURE: Balance mismatch. Expected ${newExpectedBalance}, got ${finalBalance}`);
    }
}

verifyBalance();
