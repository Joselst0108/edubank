(function () {
  const url = 'https://udtbudxpndrvzoecascn.supabase.co';
  const key = 'sb_publishable_5KmxWnmhPNpTSiSAGpMfeA_Gy-ajYOh';
  if (!window.eduBankSupabase) {
    window.eduBankSupabase = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
})();
