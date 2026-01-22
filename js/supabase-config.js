// ========================================
// Supabase Configuration
// ========================================
const SUPABASE_URL = 'https://dziiijctkqxxgehgbema.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aWlpamN0a3F4eGdlaGdiZW1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTcxNzcsImV4cCI6MjA4Mzk5MzE3N30.WZIe3TFciUhd10NxEL4FBcs6EWFqBupnbtF10drMIJg';

// Supabase Client 초기화
let supabaseClient = null;

function initSupabase() {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase 연결 완료');
        return supabaseClient;
    } else {
        console.error('❌ Supabase SDK가 로드되지 않았습니다');
        return null;
    }
}

// Global export
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.getSupabaseClient = () => supabaseClient;
window.initSupabase = initSupabase;
