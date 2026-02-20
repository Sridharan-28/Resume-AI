// ============================================
// ResumeAI — Analyzer Module
// ============================================
import {
    extractKeywords,
    calculateATSScore,
    generateSuggestions,
    extractTextFromPDF,
    extractTextFromDOCX,
    showToast,
    navigateTo
} from './utils.js';
import { canAnalyze, incrementUsage, getRemainingAnalyses, isAuthenticated } from './auth.js';

let lastAnalysis = null;

/**
 * Initialize the analyzer UI and event handlers
 */
export function initAnalyzer() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const btnBrowse = document.getElementById('btn-browse');
    const btnRemoveFile = document.getElementById('btn-remove-file');
    const btnAnalyze = document.getElementById('btn-analyze');
    const resumeTextarea = document.getElementById('resume-text');
    const jdTextarea = document.getElementById('jd-text');
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');

    let uploadedFileText = '';

    // Browse button — directly opens file picker
    btnBrowse.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileInput.click();
    });

    // Drop zone click (but not on the button)
    dropZone.addEventListener('click', (e) => {
        if (e.target === btnBrowse || btnBrowse.contains(e.target)) return;
        fileInput.click();
    });

    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) await handleFile(file);
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) await handleFile(file);
    });

    async function handleFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['pdf', 'docx', 'doc', 'txt'].includes(ext)) {
            showToast('Please upload a PDF, DOCX, or TXT file', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast('File too large. Max 5MB.', 'error');
            return;
        }

        fileName.textContent = `📄 ${file.name}`;
        fileInfo.classList.remove('hidden');

        try {
            showToast('Reading file...', 'info');

            if (ext === 'txt') {
                // Plain text files
                uploadedFileText = await file.text();
            } else if (ext === 'pdf') {
                uploadedFileText = await extractTextFromPDF(file);
            } else {
                uploadedFileText = await extractTextFromDOCX(file);
            }

            // Check if extraction actually got meaningful text
            if (!uploadedFileText || uploadedFileText.includes('[Could not extract') || uploadedFileText.length < 20) {
                showToast('⚠️ Could not read file content. Please paste your resume text in the box below.', 'error');
                uploadedFileText = '';
                resumeTextarea.focus();
            } else {
                resumeTextarea.value = uploadedFileText;
                showToast('✅ File loaded! Resume text extracted.', 'success');
            }
            updateAnalyzeButton();
        } catch (err) {
            showToast('Failed to read file. Please paste your resume text manually below.', 'error');
            resumeTextarea.focus();
            console.error(err);
        }
    }

    btnRemoveFile.addEventListener('click', () => {
        uploadedFileText = '';
        resumeTextarea.value = '';
        fileInfo.classList.add('hidden');
        fileInput.value = '';
        updateAnalyzeButton();
    });

    // Enable analyze button when both fields have content
    function updateAnalyzeButton() {
        const hasResume = resumeTextarea.value.trim().length > 10 || uploadedFileText.length > 10;
        const hasJD = jdTextarea.value.trim().length > 10;
        btnAnalyze.disabled = !(hasResume && hasJD);
    }

    // Listen for all text input methods (typing, pasting, etc.)
    ['input', 'change', 'paste', 'keyup'].forEach(event => {
        resumeTextarea.addEventListener(event, updateAnalyzeButton);
        jdTextarea.addEventListener(event, updateAnalyzeButton);
    });

    // Analyze button
    btnAnalyze.addEventListener('click', async () => {
        // Auto sign-in if not authenticated (demo mode)
        if (!isAuthenticated()) {
            const auth = await import('./auth.js');
            await auth.signInWithGoogle();
        }

        // Check usage limits
        const allowed = await canAnalyze();
        if (!allowed) {
            document.getElementById('paywall-modal').classList.remove('hidden');
            return;
        }

        await runAnalysis();
    });

    // Update usage badge
    updateUsageBadge();
}

/**
 * Run the analysis — calls backend API first, falls back to client-side
 */
async function runAnalysis() {
    const btnAnalyze = document.getElementById('btn-analyze');
    const loader = document.getElementById('analyze-loader');
    const resultsEl = document.getElementById('results');

    const resumeText = document.getElementById('resume-text').value.trim();
    const jdText = document.getElementById('jd-text').value.trim();

    if (!resumeText || !jdText) {
        showToast('Please provide both resume text and job description', 'error');
        return;
    }

    // Show loading state
    btnAnalyze.disabled = true;
    loader.classList.remove('hidden');
    btnAnalyze.querySelector('span:not(.btn-loader)')?.classList.add('hidden');

    try {
        let score, matched, missing, suggestions, resumeKeywords, jdKeywords;

        // Try backend API first
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        let usedBackend = false;

        try {
            const response = await fetch(`${API_URL}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resume_text: resumeText, jd_text: jdText }),
                signal: AbortSignal.timeout(10000) // 10s timeout
            });

            if (response.ok) {
                const data = await response.json();
                score = data.score;
                matched = data.matched_keywords;
                missing = data.missing_keywords;
                suggestions = data.suggestions;
                resumeKeywords = Array(data.resume_keyword_count).fill('');
                jdKeywords = matched.concat(missing);
                usedBackend = true;
                console.info('✅ Analysis via backend API');
            } else {
                throw new Error(`API returned ${response.status}`);
            }
        } catch (apiErr) {
            console.warn('⚠️ Backend API unavailable, using client-side analysis:', apiErr.message);
        }

        // Fallback to client-side if backend failed
        if (!usedBackend) {
            await new Promise(r => setTimeout(r, 800)); // UX delay
            resumeKeywords = extractKeywords(resumeText);
            jdKeywords = extractKeywords(jdText);
            const result = calculateATSScore(resumeKeywords, jdKeywords);
            score = result.score;
            matched = result.matched;
            missing = result.missing;
            suggestions = generateSuggestions(missing, resumeText);
        }

        // Store analysis
        lastAnalysis = {
            resumeText,
            jdText,
            score,
            matched,
            missing,
            suggestions,
            resumeKeywords,
            jdKeywords
        };

        // Increment usage
        await incrementUsage(score, null);

        // Render results
        renderResults(score, matched, missing, suggestions);

        // Show results section
        resultsEl.classList.remove('hidden');
        resultsEl.scrollIntoView({ behavior: 'smooth' });

        // Update usage badge
        updateUsageBadge();

        showToast(`ATS Score: ${score}/100`, score >= 70 ? 'success' : 'error');

    } catch (err) {
        showToast('Analysis failed: ' + err.message, 'error');
        console.error(err);
    } finally {
        btnAnalyze.disabled = false;
        loader.classList.add('hidden');
    }
}

/**
 * Render analysis results
 */
function renderResults(score, matched, missing, suggestions) {
    // Animate gauge
    const gaugeFill = document.getElementById('gauge-fill');
    const gaugeScore = document.getElementById('gauge-score');
    const verdict = document.getElementById('score-verdict');

    // Add SVG gradient if not present
    const gaugeSvg = document.querySelector('.gauge-svg');
    if (!gaugeSvg.querySelector('defs')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
      <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#6c5ce7" />
        <stop offset="50%" style="stop-color:#a855f7" />
        <stop offset="100%" style="stop-color:#ec4899" />
      </linearGradient>
    `;
        gaugeSvg.insertBefore(defs, gaugeSvg.firstChild);
    }

    // Animate score number
    animateNumber(gaugeScore, 0, score, 1500);

    // Animate gauge fill
    const circumference = 2 * Math.PI * 85; // ~534
    const offset = circumference - (score / 100) * circumference;
    setTimeout(() => {
        gaugeFill.style.strokeDashoffset = offset;
    }, 100);

    // Verdict
    if (score >= 75) {
        verdict.textContent = '🎉 Excellent Match!';
        verdict.className = 'score-verdict good';
    } else if (score >= 50) {
        verdict.textContent = '⚠️ Needs Improvement';
        verdict.className = 'score-verdict medium';
    } else {
        verdict.textContent = '🔴 Low Match — Optimize Your Resume';
        verdict.className = 'score-verdict poor';
    }

    // Matched keywords
    const matchedEl = document.getElementById('matched-keywords');
    matchedEl.innerHTML = matched.length
        ? matched.map(kw => `<span class="chip chip-green">${escapeHtml(kw)}</span>`).join('')
        : '<span style="color:var(--text-muted);font-size:0.85rem;">None found</span>';

    // Missing keywords (red)
    const missingEl = document.getElementById('missing-keywords');
    missingEl.innerHTML = missing.length
        ? missing.map(kw => `<span class="chip chip-red">${escapeHtml(kw)}</span>`).join('')
        : '<span style="color:var(--green);font-size:0.85rem;">✓ All keywords matched!</span>';

    // Suggestions
    const suggestionsEl = document.getElementById('suggestions-list');
    const suggestionsSection = document.getElementById('suggestions-section');

    if (suggestions.length > 0) {
        suggestionsSection.classList.remove('hidden');
        suggestionsEl.innerHTML = suggestions.slice(0, 10).map(s => `
      <div class="suggestion-item">
        <span class="suggestion-keyword">${escapeHtml(s.keyword)}</span>
        <span class="suggestion-text">${s.suggestion}</span>
      </div>
    `).join('');
    } else {
        suggestionsSection.classList.add('hidden');
    }
}

/**
 * Animate a number from start to end
 */
function animateNumber(el, start, end, duration) {
    const startTime = performance.now();
    function update(currentTime) {
        const progress = Math.min((currentTime - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const current = Math.round(start + (end - start) * eased);
        el.textContent = current;
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Get the last analysis results
 */
export function getLastAnalysis() {
    return lastAnalysis;
}

/**
 * Update the usage badge
 */
async function updateUsageBadge() {
    const badge = document.getElementById('usage-badge');
    try {
        const remaining = await getRemainingAnalyses();
        if (remaining === Infinity) {
            badge.textContent = '⭐ Pro — Unlimited analyses';
            badge.style.borderColor = 'var(--accent)';
        } else {
            badge.textContent = `${remaining} / 3 free analyses remaining`;
            if (remaining <= 1) {
                badge.style.borderColor = 'var(--red)';
                badge.style.color = 'var(--red)';
            }
        }
    } catch {
        badge.textContent = '3 / 3 free analyses remaining';
    }
}
