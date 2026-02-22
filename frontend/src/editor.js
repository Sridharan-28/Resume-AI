// ============================================
// ResumeAI — Editor Module
// ============================================
import {
    localRewriteBullet,
    downloadAsPDF,
    showToast,
    debounce
} from './utils.js';
import { getLastAnalysis } from './analyzer.js';

let originalScore = 0;
let currentScore = 0;
let missingKeywords = [];
let jdKeywords = [];
let jdText = '';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Initialize the editor
 */
export function initEditor() {
    const btnOpenEditor = document.getElementById('btn-open-editor');
    const btnRescore = document.getElementById('btn-rescore');
    const btnDownload = document.getElementById('btn-download');
    const btnAiRewrite = document.getElementById('btn-ai-rewrite');
    const btnAutoOptimize = document.getElementById('btn-auto-optimize');
    const btnNewAnalysis = document.getElementById('btn-new-analysis');
    const editor = document.getElementById('resume-editor');

    // Open editor from results
    btnOpenEditor.addEventListener('click', () => {
        const analysis = getLastAnalysis();
        if (!analysis) {
            showToast('No analysis found. Please analyze first.', 'error');
            return;
        }
        openEditor(analysis);
    });

    // Re-score
    btnRescore.addEventListener('click', () => {
        rescoreResume();
    });

    // Download PDF
    btnDownload.addEventListener('click', () => {
        const plainText = editor.innerText || editor.textContent;
        if (!plainText.trim()) {
            showToast('Nothing to download', 'error');
            return;
        }
        downloadAsPDF(plainText);
        showToast('Preparing PDF download...', 'success');
    });

    // AI Rewrite (manual — select text first)
    btnAiRewrite.addEventListener('click', () => {
        rewriteSelectedBullet();
    });

    // Auto-Optimize All Bullets
    btnAutoOptimize.addEventListener('click', () => {
        autoOptimizeAllBullets();
    });

    // New analysis
    btnNewAnalysis.addEventListener('click', () => {
        // Hide results
        document.getElementById('results').classList.add('hidden');

        // Clear form fields
        document.getElementById('resume-text').value = '';
        document.getElementById('jd-text').value = '';
        document.getElementById('file-info').classList.add('hidden');
        document.getElementById('btn-analyze').disabled = true;

        // Reset file input so user can upload a new file
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.value = '';

        // Reset gauge
        const gaugeFill = document.getElementById('gauge-fill');
        gaugeFill.style.strokeDashoffset = 534;
        document.getElementById('gauge-score').textContent = '0';

        // Navigate back to analyze page
        const pages = document.querySelectorAll('.page');
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById('analyze').classList.add('active');
        window.location.hash = 'analyze';

        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Live rescore on edit (debounced)
    editor.addEventListener('input', debounce(() => {
        rescoreResume();
    }, 1500));
}

/**
 * Open the editor with analysis data
 */
function openEditor(analysis) {
    const editor = document.getElementById('resume-editor');
    const editorMissingKw = document.getElementById('editor-missing-kw');
    const comparison = document.getElementById('comparison');

    // Store state
    originalScore = analysis.score;
    currentScore = analysis.score;
    missingKeywords = [...analysis.missing];
    jdKeywords = [...analysis.jdKeywords];
    jdText = analysis.jdText || '';

    // Navigate to editor page
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.classList.remove('active'));
    document.getElementById('editor').classList.add('active');
    window.location.hash = 'editor';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Populate editor with formatted resume text
    const formattedResume = formatResumeForEditor(analysis.resumeText, analysis.matched, analysis.missing);
    editor.innerHTML = formattedResume;

    // Populate missing keywords sidebar
    editorMissingKw.innerHTML = missingKeywords.length
        ? missingKeywords.map(kw => `<span class="chip chip-red">${escapeHtml(kw)}</span>`).join('')
        : '<span style="color:var(--green);font-size:0.85rem;">✓ All matched!</span>';

    // Show comparison with initial scores
    comparison.classList.remove('hidden');
    document.getElementById('score-before').textContent = originalScore;
    document.getElementById('score-after').textContent = currentScore;
    updateCompDiff();
}

/**
 * Format resume text for the editor with strict "Professional ATS" styling
 * Layout: Name (Center, Big) -> Role (Center, Med) -> Contact (Center, Small) -> Sections
 */
/**
 * Format resume text for the editor.
 * Responds to user request: "Only update keywords, do not change format."
 * We apply minimal structural styling (headings, bullets) but respect original flow.
 */
function formatResumeForEditor(text, matchedKeywords, missingKw) {
    let lines = text.split(/\n/);
    let html = '<div style="font-family:Calibri,Arial,sans-serif;line-height:1.5;color:#eee;">';

    const actionVerbPattern = /^(Achieved|Administered|Advised|Analyzed|Applied|Architected|Assessed|Assisted|Automated|Built|Cleaned|Collaborated|Communicated|Completed|Conducted|Configured|Consolidated|Contributed|Coordinated|Created|Customized|Debugged|Defined|Delivered|Demonstrated|Deployed|Designed|Detected|Developed|Directed|Documented|Drove|Enabled|Engineered|Enhanced|Ensured|Established|Evaluated|Executed|Expanded|Facilitated|Formulated|Generated|Guided|Identified|Implemented|Improved|Increased|Initiated|Innovated|Installed|Integrated|Introduced|Investigated|Launched|Led|Leveraged|Maintained|Managed|Mentored|Migrated|Modeled|Modernized|Monitored|Negotiated|Obtained|Operated|Optimized|Orchestrated|Organized|Oversaw|Performed|Pioneered|Planned|Prepared|Presented|Processed|Produced|Programmed|Proposed|Provided|Published|Queried|Raised|Ran|Received|Recommended|Redesigned|Reduced|Re-engineered|Refactored|Refined|Reformulated|Resolved|Restructured|Reviewed|Revised|Revitalized|Scheduled|Secured|Selected|Simplified|Solved|Spearheaded|Standardized|Streamlined|Strengthened|Supervised|Supported|Surpassed|Tested|Tracked|Trained|Transformed|Translated|Troubleshot|Unified|Updated|Upgraded|Utilized|Validated|Verified|Visualized|Wrote)\b/i;

    const sectionPattern = /^(experience|education|skills|projects|certifications?|summary|objective|profile|work\s*history|employment|awards|volunteer|interests|references|publications|languages?|career\s*objective|professional\s*experience|professional\s*summary|technical\s*skills|core\s*competencies|additional\s*skills)$/i;

    // Contact line pattern: contains phone OR email OR linkedin
    const contactPattern = /(\+?\d[\d\s\-]{7,}|@[\w.]+\.\w|linkedin|github|portfolio)/i;

    // Track header lines (first 1-3 non-empty lines before any section heading or bullet)
    let headerLineCount = 0;
    let pastHeader = false;

    for (const line of lines) {
        if (!line.trim()) {
            html += '<div style="height:8px;"></div>';
            continue;
        }

        let processedLine = escapeHtml(line);

        // Keyword highlighting
        for (const kw of matchedKeywords) {
            const regex = new RegExp(`\\b(${escapeRegex(kw)})\\b`, 'gi');
            processedLine = processedLine.replace(regex, '<span class="highlight-matched">$1</span>');
        }
        for (const kw of missingKw) {
            const regex = new RegExp(`\\b(${escapeRegex(kw)})\\b`, 'gi');
            processedLine = processedLine.replace(regex, '<span class="highlight-missing">$1</span>');
        }

        const trimmed = line.trim();

        // --- SECTION HEADINGS ---
        const isHeading = sectionPattern.test(trimmed)
            || (trimmed.length > 3 && trimmed.length < 50 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && !/^\d/.test(trimmed) && !/[@|+]/.test(trimmed));

        // --- BULLETS ---
        const hasBulletMarker = trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('■') || trimmed.startsWith('▪') || trimmed.match(/^\d+\./);
        const startsWithActionVerb = actionVerbPattern.test(trimmed) && trimmed.length > 30;
        const isBullet = hasBulletMarker || startsWithActionVerb;

        // --- CONTACT LINE ---
        const isContact = contactPattern.test(trimmed) && trimmed.length < 200;

        // Once we hit a section heading or bullet, we're past the header
        if (isHeading || isBullet) pastHeader = true;

        // --- HEADER LINES (Name, Title) ---
        if (!pastHeader && !isContact && headerLineCount < 2 && trimmed.length < 60 && !isBullet) {
            if (headerLineCount === 0) {
                // NAME: Large, centered, bold
                html += '<h1 style="font-family:Calibri,Arial,sans-serif;font-size:22px;font-weight:800;text-align:center;color:#fff;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px;">' + processedLine + '</h1>';
            } else {
                // TITLE/ROLE: Centered, medium
                html += '<h3 style="font-family:Calibri,Arial,sans-serif;font-size:15px;font-weight:600;text-align:center;color:#ccc;margin:2px 0 6px 0;">' + processedLine + '</h3>';
            }
            headerLineCount++;
        }
        else if (isContact) {
            // CONTACT: Centered, small, muted
            html += '<p style="font-family:Calibri,Arial,sans-serif;font-size:12px;text-align:center;color:#aaa;margin:2px 0;">' + processedLine + '</p>';
            if (!pastHeader) pastHeader = false; // contact can be in header area
        }
        else if (isHeading) {
            // SECTION HEADING: Bold, uppercase, with border
            html += '<h2 style="font-family:Calibri,Arial,sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;color:#fff;border-bottom:2px solid #555;padding-bottom:2px;margin-top:16px;margin-bottom:6px;">' + processedLine + '</h2>';
        }
        else if (isBullet) {
            // BULLET: with dot
            const safeOriginal = escapeHtml(trimmed).replace(/"/g, '&quot;');
            html += '<div class="editor-bullet" data-original="' + safeOriginal + '" style="font-family:Calibri,Arial,sans-serif;font-size:13px;padding:2px 0;margin:1px 0;position:relative;padding-left:14px;cursor:text;"><span style="position:absolute;left:0;top:2px;">•</span>' + processedLine + '</div>';
        }
        else {
            // NORMAL TEXT
            html += '<p style="font-family:Calibri,Arial,sans-serif;font-size:13px;margin:2px 0;color:#ddd;">' + processedLine + '</p>';
        }
    }

    html += '</div>';
    return html;
}

/**
 * Re-score the resume after edits — uses backend API for consistency
 */
async function rescoreResume() {
    const editor = document.getElementById('resume-editor');
    // Get plain text from contenteditable
    let plainText = editor.innerText || editor.textContent || '';
    plainText = plainText.trim();

    if (!plainText || plainText.length < 20) return;

    if (!jdKeywords || jdKeywords.length === 0) {
        showToast('No JD keywords to compare against.', 'info');
        return;
    }

    let newScore = 0;
    let newMissing = [];

    // Try backend API first (same algorithm as initial analysis)
    try {
        const response = await fetch(`${API_URL}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resume_text: plainText, jd_text: jdText }),
            signal: AbortSignal.timeout(10000)
        });

        if (response.ok) {
            const data = await response.json();
            newScore = data.score;
            newMissing = data.missing_keywords || [];
        } else {
            throw new Error('API error');
        }
    } catch {
        // Fallback: simple text-based keyword matching (no extractKeywords)
        const resumeLower = plainText.toLowerCase();
        const matched = [];
        const missing = [];

        jdKeywords.forEach(kw => {
            if (resumeLower.includes(kw.toLowerCase())) {
                matched.push(kw);
            } else {
                missing.push(kw);
            }
        });

        newScore = jdKeywords.length > 0
            ? Math.round((matched.length / jdKeywords.length) * 100)
            : 0;
        newMissing = missing;
    }

    currentScore = newScore;

    // Update comparison
    document.getElementById('score-after').textContent = currentScore;
    updateCompDiff();

    // Update sidebar missing keywords in real-time
    missingKeywords = newMissing;
    const editorMissingKw = document.getElementById('editor-missing-kw');
    editorMissingKw.innerHTML = missingKeywords.length
        ? missingKeywords.map(kw => `<span class="chip chip-red">${escapeHtml(kw)}</span>`).join('')
        : '<span style="color:var(--green);font-size:0.85rem;">✓ All keywords matched!</span>';

    // Visual flash to show update happened
    const afterCard = document.querySelector('.comp-card.after');
    if (afterCard) {
        afterCard.style.transition = 'transform 0.2s';
        afterCard.style.transform = 'scale(1.05)';
        setTimeout(() => { afterCard.style.transform = 'scale(1)'; }, 300);
    }

    if (currentScore > originalScore) {
        showToast(`Score improved: ${originalScore} → ${currentScore}!`, 'success');
    }
}

/**
 * Update the comparison diff display
 */
function updateCompDiff() {
    const diffEl = document.getElementById('comp-diff');
    const diff = currentScore - originalScore;

    if (diff > 0) {
        diffEl.textContent = `+${diff} points`;
        diffEl.style.background = 'var(--green-bg)';
        diffEl.style.color = 'var(--green)';
    } else if (diff < 0) {
        diffEl.textContent = `${diff} points`;
        diffEl.style.background = 'var(--red-bg)';
        diffEl.style.color = 'var(--red)';
    } else {
        diffEl.textContent = 'No change';
        diffEl.style.background = 'var(--bg-glass)';
        diffEl.style.color = 'var(--text-muted)';
    }
}

/**
 * AI Rewrite the selected bullet — calls backend Gemini AI, falls back to client-side
 */
async function rewriteSelectedBullet() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
        showToast('Select a bullet point to rewrite', 'info');
        return;
    }

    if (missingKeywords.length === 0) {
        showToast('No missing keywords to incorporate!', 'success');
        return;
    }

    // Find the parent .editor-bullet element
    let node = selection.anchorNode;
    let bulletDiv = null;
    while (node && node !== document.body) {
        if (node.nodeType === 1 && node.classList && node.classList.contains('editor-bullet')) {
            bulletDiv = node;
            break;
        }
        node = node.parentNode;
    }

    // Get the bullet text to rewrite
    let bulletText = '';
    let targetEl = null;

    if (bulletDiv && bulletDiv.dataset.original) {
        bulletText = bulletDiv.dataset.original;
        targetEl = bulletDiv;
    } else {
        bulletText = selection.toString().trim();
        if (bulletText.length < 10) {
            showToast('Select more text to rewrite', 'info');
            return;
        }
    }

    // Show loading state
    const btn = document.getElementById('btn-ai-rewrite');
    const originalBtnText = btn.textContent;
    btn.textContent = '⏳ AI is rewriting...';
    btn.disabled = true;

    try {
        let rewritten = '';
        let usedAi = false;

        // Try backend AI rewrite first
        try {
            const response = await fetch(`${API_URL}/api/rewrite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bullet_text: bulletText,
                    jd_text: jdText,
                    missing_keywords: missingKeywords
                }),
                signal: AbortSignal.timeout(15000) // 15s for AI
            });

            if (response.ok) {
                const data = await response.json();
                rewritten = data.rewritten;
                usedAi = data.used_ai;
                console.info(`✅ Bullet rewritten via ${usedAi ? 'Gemini AI' : 'template fallback'}`);
            } else {
                throw new Error(`API returned ${response.status}`);
            }
        } catch (apiErr) {
            console.warn('⚠️ Backend unavailable, using client-side rewrite:', apiErr.message);
            rewritten = localRewriteBullet(bulletText, missingKeywords);
        }

        // Apply rewrite to the editor
        if (targetEl) {
            targetEl.textContent = '• ' + rewritten;
        } else {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(rewritten));
        }

        showToast(
            usedAi ? '🤖 Bullet rewritten by AI!' : '✏️ Bullet rewritten with keywords!',
            'success'
        );
    } catch (err) {
        showToast('Rewrite failed: ' + err.message, 'error');
    } finally {
        btn.textContent = originalBtnText;
        btn.disabled = false;
    }

    // Re-score after rewrite
    setTimeout(() => rescoreResume(), 500);
}

/**
 * Auto-optimize: calls backend AI to optimize entire resume, falls back to smart keyword injection
 */
async function autoOptimizeAllBullets() {
    const editor = document.getElementById('resume-editor');

    if (missingKeywords.length === 0) {
        showToast('✅ No missing keywords — your resume is already optimized!', 'success');
        return;
    }

    // Filter out garbage/generic keywords that don't belong in a resume
    const genericWords = new Set([
        'needed', 'apps', 'complex', 'queries', 'job', 'title', 'role', 'roles',
        'company', 'position', 'candidate', 'applicant', 'information', 'compliance',
        'minimum', 'equivalent', 'preferred', 'together', 'effectively', 'ensures',
        'standards', 'detailed', 'insights', 'reports', 'enhance', 'processing',
        'advanced', 'required', 'education', 'bachelor', 'degree', 'tools',
        'computer', 'science', 'job title'
    ]);
    const safeMissing = missingKeywords.filter(k =>
        k.length > 2 && !genericWords.has(k.toLowerCase())
    );

    if (safeMissing.length === 0) {
        showToast('✅ No meaningful keywords missing — your resume is well-optimized!', 'success');
        return;
    }

    // Show loading state
    const btn = document.getElementById('btn-auto-optimize');
    const originalBtnText = btn.textContent;
    btn.textContent = '⏳ AI is optimizing...';
    btn.disabled = true;

    try {
        // Get current resume text from editor
        let plainText = editor.innerText || editor.textContent || '';
        plainText = plainText.trim();

        let usedAi = false;

        // Try backend AI rewrite-all
        try {
            const response = await fetch(`${API_URL}/api/rewrite-all`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resume_text: plainText,
                    jd_text: jdText,
                    missing_keywords: safeMissing
                }),
                signal: AbortSignal.timeout(30000)
            });

            if (response.ok) {
                const data = await response.json();
                usedAi = data.used_ai;

                if (usedAi && data.optimized_text && data.optimized_text.length > plainText.length * 0.7) {
                    // AI optimized — verify it returned a proper resume (not just keywords)
                    const analysis = {
                        matched: jdKeywords.filter(kw => !safeMissing.includes(kw)),
                        missing: safeMissing
                    };
                    editor.innerHTML = formatResumeForEditor(
                        data.optimized_text,
                        analysis.matched,
                        data.keywords_added.length > 0
                            ? safeMissing.filter(kw => !data.keywords_added.includes(kw))
                            : []
                    );
                    showToast(`🤖 AI optimized resume! Added ${data.keywords_added.length} keywords.`, 'success');
                } else {
                    throw new Error('AI response too short or not AI — fallback');
                }
            } else {
                throw new Error(`API returned ${response.status}`);
            }
        } catch (apiErr) {
            console.warn('⚠️ Using client-side optimization:', apiErr.message);

            // ── Smart client-side fallback ──
            // Strategy: inject keywords into existing bullet points where they contextually fit,
            // then add remaining to Technical Skills section

            const bullets = editor.querySelectorAll('.editor-bullet');
            const injected = new Set();

            // Step 1: Try to inject each keyword into a relevant bullet point
            for (const kw of safeMissing) {
                if (injected.has(kw)) continue;

                for (const bullet of bullets) {
                    const text = bullet.textContent.replace('•', '').trim();
                    // Check if this bullet is contextually related to the keyword
                    const kwLower = kw.toLowerCase();
                    const textLower = text.toLowerCase();

                    // Skip if keyword is already present
                    if (textLower.includes(kwLower)) {
                        injected.add(kw);
                        break;
                    }

                    // Try to find a contextual match and inject
                    const relatedTerms = getRelatedContext(kwLower);
                    const hasRelatedContent = relatedTerms.some(term => textLower.includes(term));

                    if (hasRelatedContent && text.length > 30) {
                        // Inject keyword naturally at the end of the bullet
                        const originalText = bullet.textContent;
                        const cleanText = originalText.replace(/\.\s*$/, '');
                        bullet.textContent = `${cleanText}, leveraging ${kw}.`;
                        injected.add(kw);
                        break;
                    }
                }
            }

            // Step 2: Add remaining keywords to Technical Skills section
            const remaining = safeMissing.filter(kw => !injected.has(kw));
            if (remaining.length > 0) {
                const skillsList = remaining.map(kw => kw.charAt(0).toUpperCase() + kw.slice(1)).join(', ');

                // Find existing "Additional Skills" or "Technical Skills" line
                let existingSkillLine = null;
                for (const el of editor.children) {
                    if (el.textContent.includes('Additional Skills:')) {
                        existingSkillLine = el;
                        break;
                    }
                }

                if (existingSkillLine) {
                    // Append to existing skills line
                    existingSkillLine.textContent = existingSkillLine.textContent.replace(/\s*$/, '') + ', ' + skillsList;
                } else {
                    // Create new skills line under Technical Skills heading
                    const skillsLine = document.createElement('p');
                    skillsLine.style.cssText = 'font-family:Calibri,Arial,sans-serif;font-size:13px;margin:6px 0;color:#ddd;';
                    skillsLine.textContent = `Additional Skills: ${skillsList}`;

                    let inserted = false;
                    const headings = editor.querySelectorAll('h2');
                    for (const h of headings) {
                        if (/skills|competenc|expertise|technolog/i.test(h.textContent)) {
                            // Insert after the heading's next sibling (existing skills line)
                            let target = h.nextElementSibling;
                            while (target && !target.matches('h2')) {
                                target = target.nextElementSibling;
                            }
                            if (target) {
                                target.insertAdjacentElement('beforebegin', skillsLine);
                            } else {
                                h.insertAdjacentElement('afterend', skillsLine);
                            }
                            inserted = true;
                            break;
                        }
                    }
                    if (!inserted) editor.appendChild(skillsLine);
                }
            }

            const totalAdded = injected.size + remaining.length;
            showToast(`⚡ Optimized! Added ${totalAdded} keywords to your resume.`, 'success');
        }
    } catch (err) {
        showToast('Optimization failed: ' + err.message, 'error');
    } finally {
        btn.textContent = originalBtnText;
        btn.disabled = false;
    }

    // Re-score to reflect changes
    setTimeout(() => rescoreResume(), 500);
}

/**
 * Get related context terms for a keyword to find matching bullets
 */
function getRelatedContext(keyword) {
    const contextMap = {
        'data': ['dataset', 'database', 'report', 'dashb', 'analy', 'insight', 'metric', 'record', 'transact'],
        'analytics': ['report', 'dashb', 'metric', 'insight', 'visual', 'trend', 'perform', 'track'],
        'data analytics': ['report', 'dashb', 'metric', 'insight', 'visual', 'trend'],
        'machine learning': ['model', 'predict', 'algorithm', 'train', 'classif', 'neural', 'ai', 'automat'],
        'power bi': ['dashb', 'report', 'visual', 'bi', 'metric', 'kpi'],
        'sql': ['query', 'database', 'table', 'data', 'join', 'select', 'mysql', 'postgres'],
        'python': ['script', 'automat', 'program', 'code', 'develop', 'framework'],
        'business': ['stakeholder', 'strategy', 'revenue', 'profit', 'growth', 'client', 'decision'],
        'analysis': ['report', 'insight', 'metric', 'evaluat', 'assess', 'review', 'investig'],
        'intelligence': ['insight', 'decision', 'strateg', 'report', 'dashb', 'bi'],
        'automation': ['automat', 'workflow', 'process', 'efficien', 'reduc', 'streamlin'],
        'optimization': ['improv', 'efficien', 'perform', 'reduc', 'enhanc', 'streamlin'],
        'statistical': ['statist', 'model', 'analys', 'predict', 'regress', 'correlat'],
        'security': ['secur', 'protect', 'complian', 'audit', 'risk', 'access'],
        'management': ['manag', 'lead', 'coordinat', 'oversee', 'supervise', 'team'],
        'systems': ['system', 'platform', 'infra', 'architect', 'integrat'],
        'regulations': ['regulat', 'compli', 'policy', 'standard', 'govern'],
        'regulatory': ['regulat', 'compli', 'policy', 'standard', 'govern'],
        'decision-making': ['decision', 'strateg', 'insight', 'recommend', 'evaluat'],
        'learning': ['train', 'develop', 'skill', 'model', 'algorithm'],
        'analyst': ['analy', 'report', 'data', 'insight', 'metric'],
        'power': ['bi', 'dashb', 'report', 'query', 'pivot'],
        'data analyst': ['data', 'analy', 'report', 'insight'],
    };
    return contextMap[keyword] || [keyword.substring(0, 4)];
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
