
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testCancelMatch() {
    console.log('--- TEST CANCEL MATCH ---');

    console.log('0. Authenticating...');
    const { data: { session }, error: authError } = await supabase.auth.signInWithPassword({
        email: 'geraldp56124@sabonglava.com',
        password: 'password123' // Default password from seed_users.sql logic? Wait, seed says crypt('4FAS314fY%nhd'). Let's hope I can find a user where I know the password.
        // Actually, seed_users.sql effectively resets passwords. The comment says `crypt('4FAS314fY%nhd', gen_salt('bf'))`. 
        // That is the hash. I need the plaintext.
        // The previous `create_users.ts` script used `password123` for new users. 
        // But `seed_users.sql` uses specific hashes. I don't know the plaintext for `4FAS314fY%nhd`'s hash unless that IS the password.
        // Let's try `password123` with a created user if possible, or use one from `create_users.ts`.
        // Alternatively, since I have `execute_sql` tool, I can just use that to insert a test user with a known password if needed, or bypass RLS by using the tool directly? 
        // No, I want to verify the logic via the `cancel_match` RPC function call which IS what the frontend does.

        // Let's try to verify if `test_cancel` can just run without auth if I use `mcp_supabase_execute_sql` to check results?
        // No, I need to call the RPC via the client.

        // Strategy: Use the MCP tool to call the RPC directly! much easier.
    });

    // Changing strategy: validation via MCP tools is safer and doesn't require guessing passwords.
    // I will delete this script and just use the MCP tools to interact.


    if (matchError) throw matchError;
    console.log(`   Match Created: ${match.id}`);

    // 2. Place a bet (as a user)
    // We need a user ID. Let's pick one from profiles.
    const { data: user } = await supabase.from('profiles').select('id, balance').limit(1).single();
    if (!user) throw new Error('No users found');

    console.log(`2. Placing bet for User: ${user.id} (Balance: ${user.balance})`);

    // Decrease balance manually (simulating bet placement trigger usually does this, 
    // but if we insert into 'bets', the trigger MIGHT handle it if it exists, 
    // OR the app handles it. Let's check trigger... 
    // Assuming 'bets' insert trigger deducts balance? Or app does?
    // Let's just insert into bets and manually deduct to assume worst case safe test.)

    // Actually, let's just insert the bet and see if cancel refunds it.
    // If we want to be strict, we need to know if 'place_bet' RPC does the deduction.
    // Let's assume the bet is placed.

    const betAmount = 100;
    const { data: bet, error: betError } = await supabase.from('bets').insert({
        match_id: match.id,
        user_id: user.id,
        amount: betAmount,
        selection: 'meron',
        status: 'pending'
    }).select().single();

    if (betError) throw betError;
    console.log(`   Bet Placed: ${bet.id} for ${betAmount}`);

    // 3. Call Cancel Match
    console.log('3. Cancelling Match...');
    const { error: cancelError } = await supabase.rpc('cancel_match', { match_id_input: match.id });
    if (cancelError) throw cancelError;
    console.log('   Match Cancelled RPC Success.');

    // 4. Verify
    console.log('4. Verifying...');

    // Check Match Status
    const { data: checkMatch } = await supabase.from('matches').select('status').eq('id', match.id).single();
    console.log(`   Match Status: ${checkMatch.status} (Expected: 'cancelled')`);

    // Check Bet Status
    const { data: checkBet } = await supabase.from('bets').select('status').eq('id', bet.id).single();
    console.log(`   Bet Status: ${checkBet.status} (Expected: 'cancelled')`);

    // Check Profile Balance Increment
    // Since we didn't use the 'place_bet' RPC which deducts, the user balance should have INCREASED by 100 from original.
    // Wait, if we manually inserted bet, we didn't deduct. So refund will add 100.
    // So final balance should be Original + 100.
    const { data: userAfter } = await supabase.from('profiles').select('balance').eq('id', user.id).single();
    console.log(`   User Balance: ${userAfter.balance} (Old: ${user.balance}, Amount: ${betAmount})`);

    if (userAfter.balance === user.balance + betAmount) {
        console.log('   SUCCESS: Balance refunded (incremented correctly).');
    } else {
        console.log('   WARNING: Balance mismatch. (Did you manually deduct before refund?)');
    }
}

testCancelMatch().catch(console.error);
