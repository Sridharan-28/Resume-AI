// ============================================
// ResumeAI — Supabase Auth (Google OAuth)
// ============================================
import { showToast } from './utils.js';

let supabaseClient = null;
let currentUser = null;

/**
 * Initialize Supabase client
 */
export function initAuth(supabase) {
    supabaseClient = supabase;

    if (!supabaseClient) {
        console.info('⚡ Auth: Demo mode (no Supabase)');
        return;
    }

    // Listen for auth state changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            currentUser = session.user;
            updateAuthUI(true);
        } else {
            currentUser = null;
            updateAuthUI(false);
        }
    });

    // Check existing session
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
            currentUser = session.user;
            updateAuthUI(true);
        }
    });
}

/**
 * Sign in with Google via Supabase
 */
export async function signInWithGoogle() {
    if (!supabaseClient) {
        // Demo mode: simulate login
        currentUser = {
            id: 'demo-user-' + Date.now(),
            email: 'demo@resumeai.com',
            user_metadata: {
                full_name: 'Demo User',
                avatar_url: ''
            }
        };
        updateAuthUI(true);
        showToast('Signed in (Demo Mode)', 'success');
        return;
    }

    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        if (error) throw error;
    } catch (err) {
        showToast('Login failed: ' + err.message, 'error');
    }
}

/**
 * Sign out
 */
export async function signOut() {
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    }
    currentUser = null;
    updateAuthUI(false);
    showToast('Signed out', 'info');
}

/**
 * Get current user
 */
export function getUser() {
    return currentUser;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
    return !!currentUser;
}

/**
 * Update the UI based on auth state
 */
function updateAuthUI(loggedIn) {
    const loginBtn = document.getElementById('btn-google-login');
    const profileEl = document.getElementById('user-profile');
    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');

    if (loggedIn && currentUser) {
        loginBtn.classList.add('hidden');
        profileEl.classList.remove('hidden');

        const name = currentUser.user_metadata?.full_name || currentUser.email || 'User';
        const avatar = currentUser.user_metadata?.avatar_url || '';

        nameEl.textContent = name;
        if (avatar) {
            avatarEl.src = avatar;
            avatarEl.style.display = 'block';
        } else {
            avatarEl.style.display = 'none';
        }
    } else {
        loginBtn.classList.remove('hidden');
        profileEl.classList.add('hidden');
    }
}

/**
 * Get usage count for the current user (returns number of analyses used)
 */
export async function getUsageCount() {
    if (!supabaseClient || !currentUser) {
        // Demo mode: use localStorage
        return parseInt(localStorage.getItem('resumeai_usage') || '0');
    }

    try {
        const { data, error } = await supabaseClient
            .from('usage_logs')
            .select('id', { count: 'exact' })
            .eq('user_id', currentUser.id);

        if (error) throw error;
        return data?.length || 0;
    } catch (err) {
        console.error('Usage check failed:', err);
        return parseInt(localStorage.getItem('resumeai_usage') || '0');
    }
}

/**
 * Increment usage count
 */
export async function incrementUsage(scoreBefore, scoreAfter) {
    if (!supabaseClient || !currentUser) {
        // Demo mode: use localStorage
        const current = parseInt(localStorage.getItem('resumeai_usage') || '0');
        localStorage.setItem('resumeai_usage', (current + 1).toString());
        return;
    }

    try {
        await supabaseClient
            .from('usage_logs')
            .insert({
                user_id: currentUser.id,
                score_before: scoreBefore,
                score_after: scoreAfter
            });
    } catch (err) {
        console.error('Usage increment failed:', err);
    }
}

/**
 * Check if user has an active subscription
 */
export async function hasActiveSubscription() {
    if (!supabaseClient || !currentUser) {
        return localStorage.getItem('resumeai_pro') === 'true';
    }

    try {
        const { data, error } = await supabaseClient
            .from('subscriptions')
            .select('is_active, expires_at')
            .eq('user_id', currentUser.id)
            .single();

        if (error || !data) return false;
        if (!data.is_active) return false;
        if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
        return true;
    } catch {
        return false;
    }
}

const FREE_LIMIT = 50; // 50 for demo/dev, change to 3 for production

/**
 * Check if user can perform an analysis
 */
export async function canAnalyze() {
    const isPro = await hasActiveSubscription();
    if (isPro) return true;

    const used = await getUsageCount();
    return used < FREE_LIMIT;
}

/**
 * Get remaining free analyses
 */
export async function getRemainingAnalyses() {
    const isPro = await hasActiveSubscription();
    if (isPro) return Infinity;

    const used = await getUsageCount();
    return Math.max(0, FREE_LIMIT - used);
}
