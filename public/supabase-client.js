// Initialize Supabase Client
const SUPABASE_URL = 'https://hrbjmhbteqjyomfwclgj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9S8Pf9CMDK7ggfG00FxM2g_O-DsRUrv';

// The supabase client will be globally available as window.supabaseClient
if (window.supabase) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase client initialized successfully.");
} else {
    console.error("Supabase CDN script not loaded.");
}
