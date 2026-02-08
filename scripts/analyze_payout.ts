
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzePayouts() {
    console.log("Starting Payout Analysis...");

    // 1. Get recent finished matches
    const { data: matches, error: matchError } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'finished')
        .order('created_at', { ascending: false })
        .limit(5);

    if (matchError) {
        console.error("Error fetching matches:", matchError);
        return;
    }

    if (!matches || matches.length === 0) {
        console.log("No finished matches found.");
        return;
    }

    console.log(`Analyzing last ${matches.length} matches...\n`);

    for (const match of matches) {
        console.log(`MATCH: ${match.meron_name} vs ${match.wala_name} (ID: ${match.id.slice(0, 8)})`);
        console.log(`WINNER: ${match.winner}`);

        // 2. Get all bets for this match
        const { data: bets, error: betsError } = await supabase
            .from('bets')
            .select('*')
            .eq('match_id', match.id)
            .neq('status', 'cancelled');

        if (betsError) {
            console.error("Error fetching bets:", betsError);
            continue;
        }

        if (!bets || bets.length === 0) {
            console.log("  No bets found for this match.\n");
            continue;
        }

        // 3. Analyze Pool
        let meronTotal = 0;
        let walaTotal = 0;
        let meronBotTotal = 0;
        let walaBotTotal = 0;

        bets.forEach((bet: any) => {
            const amount = Number(bet.amount);
            if (bet.selection === 'meron') {
                meronTotal += amount;
                if (bet.is_bot) meronBotTotal += amount;
            } else if (bet.selection === 'wala') {
                walaTotal += amount;
                if (bet.is_bot) walaBotTotal += amount;
            }
        });

        const grossPool = meronTotal + walaTotal;
        const commission = grossPool * 0.04; // Assuming 4%
        const netPool = grossPool - commission;
        const winningSideTotal = match.winner === 'meron' ? meronTotal : walaTotal;

        // Theoretical Odds
        // Formula: (Total Pool * 0.96) / Winning Side Total
        let theoreticalOdds = 0;
        if (winningSideTotal > 0) {
            theoreticalOdds = netPool / winningSideTotal;
        }

        console.log("  POOL ANALYSIS:");
        console.log(`    Total Pool:     ${grossPool.toLocaleString()}`);
        console.log(`    Meron Total:    ${meronTotal.toLocaleString()} (Bots: ${meronBotTotal.toLocaleString()})`);
        console.log(`    Wala Total:     ${walaTotal.toLocaleString()}  (Bots: ${walaBotTotal.toLocaleString()})`);
        console.log(`    Winning Side:   ${winningSideTotal.toLocaleString()}`);
        console.log(`    Commission(4%): ${commission.toLocaleString()}`);
        console.log(`    Net Pool:       ${netPool.toLocaleString()}`);
        console.log(`    Calc. Odds:     ${theoreticalOdds.toFixed(4)}x`);

        // 4. Check Actual Payouts
        const winningBets = bets.filter((b: any) => b.selection === match.winner && b.status === 'won');

        if (winningBets.length > 0) {
            // Check the first winning bet to see the payout ratio applied
            // Note: DB usually stores 'payout' as the TOTAL amount returned (stake + win) or just win amount? 
            // Let's check a sample.
            const sampleBet = winningBets[0];
            // Assuming 'payout' field exists and represents total return
            // return / stake = odds
            const actualPayout = Number(sampleBet.payout);
            const stake = Number(sampleBet.amount);
            const actualOdds = actualPayout / stake;

            console.log("  ACTUAL DATA (Sample Bet):");
            console.log(`    Stake:          ${stake}`);
            console.log(`    Payout:         ${actualPayout}`);
            console.log(`    Actual Odds:    ${actualOdds.toFixed(4)}x`);

            const diff = Math.abs(theoreticalOdds - actualOdds);
            if (diff > 0.01) {
                console.log("  ⚠️ DISCREPANCY DETECTED!");

                // HYPOTHESIS CHECK: Are bots excluded from the POOL? 
                // i.e. (HumanBetPool * 0.96) / HumanWinningSide? 
                // Or (TotalPool * 0.96) / (WinningSide - BotWinningSide)?

                // Check if bots are completely ignored (Pure P2P)
                const humanMeron = meronTotal - meronBotTotal;
                const humanWala = walaTotal - walaBotTotal;
                const humanPool = humanMeron + humanWala;
                const humanWinningSide = match.winner === 'meron' ? humanMeron : humanWala;
                const humanOdds = (humanPool * 0.96) / humanWinningSide;

                console.log(`    hypothesis(HumanOnly): ${humanOdds.toFixed(4)}x`);
                if (Math.abs(humanOdds - actualOdds) < 0.01) {
                    console.log("    -> MATCH! Bots are completely excluded from payout calculations.");
                }

                // Check if bots add to POT but don't take from it? (Unlikely, would bankrupt house)
                // Check if bots dillute the pot?
            } else {
                console.log("  ✅ Odds match theoretical calculation.");
            }

        } else {
            console.log("  No winning bets found to verify.");
        }
        console.log("-".repeat(50) + "\n");
    }
}

analyzePayouts();
