// ============================================
// ResumeAI — Main Entry Point
// ============================================
import { createClient } from '@supabase/supabase-js';
import { initAuth, signInWithGoogle, signOut, isAuthenticated } from './auth.js';
import { initAnalyzer } from './analyzer.js';
import { initEditor } from './editor.js';
import { navigateTo, showToast } from './utils.js';

// ── Supabase Config ──
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;

// ── Initialize App ──
function initApp() {
    const hasValidConfig = SUPABASE_URL && SUPABASE_ANON_KEY
        && !SUPABASE_URL.includes('YOUR_')
        && !SUPABASE_ANON_KEY.includes('your_')
        && SUPABASE_URL.includes('supabase.co');

    if (hasValidConfig) {
        try {
            supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.info('✅ Supabase connected');
        } catch (err) {
            console.warn('Supabase init failed, running in demo mode:', err);
        }
    } else {
        console.info('⚡ Running in Demo Mode — Supabase not configured');
    }

    // Init modules
    initAuth(supabase);
    initAnalyzer();
    initEditor();

    // Setup navigation
    setupNavigation();

    // Setup auth buttons
    setupAuthButtons();

    // Handle initial route
    handleRoute();
}

// ── Navigation ──
function setupNavigation() {
    window.addEventListener('hashchange', handleRoute);

    document.getElementById('btn-get-started').addEventListener('click', async () => {
        if (!isAuthenticated()) {
            await signInWithGoogle();
        }
        navigateTo('analyze');
    });
}

function handleRoute() {
    const hash = window.location.hash.replace('#', '') || 'landing';
    const validPages = ['landing', 'analyze', 'editor'];

    if (validPages.includes(hash)) {
        const pages = document.querySelectorAll('.page');
        pages.forEach(p => p.classList.remove('active'));
        const target = document.getElementById(hash);
        if (target) target.classList.add('active');
    }
}

// ── Auth Buttons ──
function setupAuthButtons() {
    document.getElementById('btn-google-login').addEventListener('click', async () => {
        await signInWithGoogle();
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        signOut();
        navigateTo('landing');
    });
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', initApp);
