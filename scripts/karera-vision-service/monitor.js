import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENROUTER_API_KEY) {
    console.error("Missing environment variables.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function analyzeScreenshot(base64Image) {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Analyze this race dividend board. Return a JSON object with: 1. 'dividends': array of { 'horse_number': int, 'amount': float }. 2. 'scratched': array of horse numbers marked with 'S' or 'SCR'. If no data can be read, return empty arrays."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/png;base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ]
            })
        });

        const data = await response.json();
        // Extract JSON from the response text (Gemini can be chatty)
        const content = data.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return null;
    } catch (error) {
        console.error("AI Analysis Failed:", error);
        return null;
    }
}

async function monitorRaces() {
    console.log("Checking for active races...");

    // Fetch active races with a URL
    const { data: races, error } = await supabase
        .from('karera_races')
        .select('*')
        .eq('status', 'open')
        .not('website_url', 'is', null);

    if (error) {
        console.error("Error fetching races:", error);
        return;
    }

    if (!races || races.length === 0) {
        console.log("No active races to monitor.");
        return;
    }

    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });

    for (const race of races) {
        console.log(`Monitoring Race: ${race.name} (${race.website_url})`);
        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            await page.goto(race.website_url, { waitUntil: 'networkidle2', timeout: 30000 });

            const screenshotBuffer = await page.screenshot({ encoding: 'base64' });
            await page.close();

            // Analyze with AI
            const analysis = await analyzeScreenshot(screenshotBuffer);

            if (analysis) {
                console.log("AI Analysis Result:", analysis);

                // Update Dividends
                if (analysis.dividends && analysis.dividends.length > 0) {
                    for (const div of analysis.dividends) {
                        await supabase
                            .from('karera_horses')
                            .update({ current_dividend: div.amount })
                            .eq('race_id', race.id)
                            .eq('horse_number', div.horse_number);
                    }
                }

                // Update Scratched Horses
                if (analysis.scratched && analysis.scratched.length > 0) {
                    for (const horseNum of analysis.scratched) {
                        await supabase
                            .from('karera_horses')
                            .update({ status: 'scratched' })
                            .eq('race_id', race.id)
                            .eq('horse_number', horseNum);
                    }
                }
            }
        } catch (err) {
            console.error(`Error processing race ${race.id}:`, err);
        }
    }

    await browser.close();
}

// Run immediately then schedule via CRON or loop with delay
monitorRaces();
// To loop: setInterval(monitorRaces, 60000);
