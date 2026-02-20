// ============================================
// ResumeAI — Main Entry Point
// ============================================
import { createClient } from '@supabase/supabase-js';
import { initAuth, signInWithGoogle, signOut, isAuthenticated } from './auth.js';
import { initAnalyzer } from './analyzer.js';
import { initEditor } from './editor.js';
import { navigateTo, showToast } from './utils.js';

// ── Supabase Config ──
// Replace these with your Supabase project credentials
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;

// ── Initialize App ──
function initApp() {
    // Try to init Supabase (gracefully fail for demo mode)
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

    // Setup modal
    setupModal();

    // Handle initial route
    handleRoute();
}

// ── Navigation ──
function setupNavigation() {
    // Hash-based routing
    window.addEventListener('hashchange', handleRoute);

    // CTA button — sign in (demo mode) + navigate to analyze
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

    // Handle pricing scroll
    if (hash === 'pricing-section') {
        document.getElementById('landing').classList.add('active');
        setTimeout(() => {
            document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
}

// ── Auth Buttons ──
function setupAuthButtons() {
    // Sign in button — ONLY authenticates, does not navigate
    document.getElementById('btn-google-login').addEventListener('click', async () => {
        await signInWithGoogle();
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        signOut();
        navigateTo('landing');
    });
}

// ── Paywall Modal ──
function setupModal() {
    const modal = document.getElementById('paywall-modal');
    const btnClose = document.getElementById('btn-close-modal');
    const btnSubscribe = document.getElementById('btn-modal-subscribe');
    const btnSubscribeNav = document.getElementById('btn-subscribe');

    btnClose.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Close on backdrop click
    modal.querySelector('.modal-backdrop').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Subscribe buttons
    const handleSubscribe = () => {
        // For now, show a message. In production, integrate Razorpay here.
        showToast('Payment integration coming soon! For now, enjoy demo mode.', 'info');

        // Demo: grant pro access
        localStorage.setItem('resumeai_pro', 'true');
        modal.classList.add('hidden');
        showToast('🎉 Pro access activated (Demo)!', 'success');

        // Refresh usage badge
        setTimeout(() => window.location.reload(), 1000);
    };

    btnSubscribe.addEventListener('click', handleSubscribe);
    if (btnSubscribeNav) btnSubscribeNav.addEventListener('click', handleSubscribe);
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', initApp);
