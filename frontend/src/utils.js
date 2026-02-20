// ============================================
// ResumeAI — Utility helpers
// ============================================

/**
 * Show a toast notification
 */
export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/**
 * Navigate to a page section (hash-based SPA)
 */
export function navigateTo(hash) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.classList.remove('active'));

    const target = document.getElementById(hash);
    if (target) {
        target.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.location.hash = hash;
}

/**
 * Extract text from a PDF file using pdf.js (preserves line breaks)
 */
export async function extractTextFromPDF(file) {
    const pdfjsLib = await import('pdfjs-dist');

    // Set the worker source
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
    ).toString();

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const typedArray = new Uint8Array(e.target.result);
                const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;

                const pageTexts = [];
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();

                    // Group text items by Y position to preserve line breaks
                    let lastY = null;
                    let lineText = '';
                    let pageLines = [];

                    for (const item of content.items) {
                        const y = Math.round(item.transform[5]); // Y position
                        if (lastY !== null && Math.abs(y - lastY) > 5) {
                            // New line detected (Y changed)
                            if (lineText.trim()) pageLines.push(lineText.trim());
                            lineText = '';
                        }
                        lineText += item.str;
                        lastY = y;
                    }
                    if (lineText.trim()) pageLines.push(lineText.trim());

                    const pageText = pageLines.join('\n');
                    // Deduplicate: skip if this page is identical to a previous one
                    if (!pageTexts.includes(pageText)) {
                        pageTexts.push(pageText);
                    }
                }

                const fullText = pageTexts.join('\n\n');
                resolve(fullText.trim() || '[Could not extract text from PDF — please paste your resume text manually]');
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Extract text from a DOCX file using mammoth
 * Uses convertToHtml to preserve paragraph breaks, then strips HTML to text
 */
export async function extractTextFromDOCX(file) {
    const mammoth = await import('mammoth');

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                // Use convertToHtml to preserve paragraph structure
                const result = await mammoth.convertToHtml({ arrayBuffer });
                const html = result.value;

                // Parse HTML to extract text with line breaks preserved
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const lines = [];
                const elements = doc.body.children;

                for (const el of elements) {
                    const tagName = el.tagName.toLowerCase();

                    if (tagName === 'ul' || tagName === 'ol') {
                        // Handle list items as bullet points
                        const items = el.querySelectorAll('li');
                        items.forEach(li => {
                            const text = li.textContent.trim();
                            if (text) lines.push('• ' + text);
                        });
                    } else {
                        // <p>, <h1>-<h6>, or other block elements
                        const text = el.textContent.trim();
                        if (text) {
                            lines.push(text);
                        } else {
                            lines.push(''); // Preserve empty paragraphs as blank lines
                        }
                    }
                }

                const text = lines.join('\n').trim();
                resolve(text || '[Could not extract text from DOCX — please paste your resume text manually]');
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Keyword extraction using NLP-lite approach
 * Extracts important/meaningful terms from text (skills, tools, concepts)
 */
export function extractKeywords(text) {
    if (!text) return [];

    // Comprehensive stop words: common English + generic resume/JD filler words
    const stopWords = new Set([
        // Articles, prepositions, conjunctions
        'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
        'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
        'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
        'shall', 'can', 'need', 'must', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you',
        'your', 'he', 'his', 'she', 'her', 'they', 'them', 'their', 'this', 'that',
        'these', 'those', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
        'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
        'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'about',
        'above', 'after', 'again', 'also', 'am', 'as', 'because', 'before', 'between',
        'during', 'here', 'into', 'over', 'then', 'there', 'through', 'under', 'up',
        'out', 'if', 'while', 'any',
        // Generic verbs (not skill-specific)
        'work', 'working', 'worked', 'use', 'used', 'using', 'make', 'making', 'made',
        'get', 'getting', 'got', 'help', 'helping', 'helped', 'know', 'knowing', 'known',
        'go', 'going', 'gone', 'see', 'seeing', 'seen', 'come', 'coming', 'came',
        'take', 'taking', 'taken', 'give', 'giving', 'given', 'find', 'finding', 'found',
        'say', 'saying', 'said', 'tell', 'telling', 'told', 'keep', 'keeping', 'kept',
        'let', 'put', 'run', 'running', 'ran', 'set', 'setting', 'show', 'showing',
        'try', 'trying', 'tried', 'ask', 'asked', 'turn', 'start', 'starting', 'started',
        'move', 'moving', 'play', 'apply', 'applying', 'applied', 'look', 'looking',
        'bring', 'bringing', 'hold', 'holding', 'write', 'writing', 'stand', 'join',
        'follow', 'following', 'followed', 'learn', 'learning', 'learned', 'open',
        'close', 'stop', 'send', 'receive', 'read', 'provide', 'providing', 'provided',
        'include', 'including', 'included', 'support', 'supporting', 'supports',
        'ensure', 'ensuring', 'ensured', 'maintain', 'maintaining', 'maintained',
        'produce', 'producing', 'produced', 'execute', 'executing', 'executed',
        'perform', 'performing', 'performed', 'require', 'requiring', 'required',
        'involve', 'involving', 'involved', 'create', 'creating', 'created',
        'manage', 'managing', 'managed', 'develop', 'developing', 'developed',
        'build', 'building', 'built', 'deliver', 'delivering', 'delivered',
        'identify', 'identifying', 'identified', 'contribute', 'contributing',
        'demonstrate', 'demonstrating', 'achieve', 'achieving', 'achieved',
        'implement', 'implementing', 'implemented', 'collaborate', 'collaborating',
        'understand', 'understanding', 'interpret', 'interpreting',
        // Generic adjectives
        'good', 'great', 'best', 'better', 'new', 'old', 'large', 'small', 'big',
        'high', 'low', 'strong', 'basic', 'advanced', 'essential', 'important',
        'key', 'main', 'major', 'primary', 'relevant', 'specific', 'various',
        'different', 'able', 'available', 'current', 'general', 'particular',
        'possible', 'potential', 'real', 'right', 'similar', 'total', 'whole',
        'accurate', 'reliable', 'effective', 'efficient', 'successful',
        'responsible', 'appropriate', 'additional', 'existing', 'necessary',
        'higher-level', 'lower-level', 'mid-level', 'entry-level', 'senior-level',
        // Generic nouns (not skills)
        'job', 'role', 'team', 'company', 'organization', 'department', 'group',
        'position', 'opportunity', 'candidate', 'applicant', 'employee', 'employer',
        'client', 'customer', 'user', 'member', 'person', 'people', 'individual',
        'year', 'years', 'month', 'months', 'day', 'days', 'time', 'times',
        'way', 'part', 'thing', 'place', 'point', 'case', 'example', 'result',
        'results', 'level', 'area', 'areas', 'field', 'type', 'types', 'form',
        'number', 'order', 'line', 'end', 'name', 'fact', 'head', 'side',
        'experience', 'ability', 'skill', 'knowledge', 'summary', 'objective',
        'responsibility', 'responsibilities', 'qualification', 'qualifications',
        'requirement', 'requirements', 'description', 'title', 'location',
        'cadence', 'operational', 'basis', 'aspect', 'manner', 'degree', 'range',
        'scope', 'task', 'tasks', 'duty', 'duties', 'function', 'functions',
        'process', 'output', 'outputs', 'input', 'inputs', 'specialist',
        'scientist', 'engineer', 'analyst', 'manager', 'director', 'coordinator',
        'associate', 'assistant', 'intern', 'lead', 'head', 'officer', 'executive',
        // Company/consulting/industry words (not skills)
        'cgi', 'solutions', 'services', 'technologies', 'consulting', 'partners',
        'corporation', 'limited', 'ltd', 'inc', 'llc', 'global', 'international',
        'industry', 'sector', 'market', 'business', 'enterprise', 'professional',
        // More filler
        'etc', 'e.g', 'ie', 'well', 'within', 'across', 'along', 'among',
        'around', 'away', 'per', 'via', 'toward', 'towards', 'upon', 'versus',
        'like', 'much', 'many', 'often', 'always', 'never', 'already',
        'back', 'still', 'want', 'long', 'far', 'first', 'second', 'third',
        'next', 'last', 'early', 'late', 'soon', 'even', 'now', 'today',
        'usage', 'using', 'used', 'uses', 'utilize', 'utilized', 'via',
        // Short generic words that appear in JDs but aren't skills
        'code', 'pay', 'plan', 'data', 'model', 'tool', 'tools', 'design',
        'review', 'report', 'test', 'base', 'full', 'half', 'meet', 'call',
        'step', 'note', 'list', 'goal', 'need', 'must', 'core', 'plus',
        'fast', 'deep', 'wide', 'clear', 'clean', 'raw', 'digital', 'add',
        // USER REPORTED GARBAGE WORDS
        'needed', 'need', 'needs', 'app', 'apps', 'application', 'applications',
        'complex', 'complexity', 'query', 'queries', 'deploy', 'deployed', 'deployment',
        'create', 'creation', 'creative', 'creating', 'models', 'modeling', 'modelled',
        'bi.', 'bi', 'intelligence', 'artificial', 'automated', 'automation',
        'efficient', 'efficiency', 'effective', 'effectively', 'improve', 'improved',
        'improvement', 'maintain', 'maintaining', 'maintained', 'maintenance',
        'support', 'supporting', 'supported', 'ensure', 'ensuring', 'ensured',
        'identify', 'identifying', 'identified', 'perform', 'performing', 'performed',
        'provide', 'providing', 'provided', 'develop', 'developing', 'developed',
        'development', 'manage', 'managing', 'managed', 'management',
        'best', 'practice', 'practices', 'outcome', 'outcomes', 'impact',
        'follow', 'following', 'followed', 'understand', 'understanding',
        'collaborate', 'collaborating', 'collaboration', 'communicate', 'communication',
        'communicating', 'contribute', 'contributing', 'contribution',
        'participate', 'participating', 'participation', 'strong', 'good', 'excellent',
        'proficient', 'proficiency', 'expert', 'expertise', 'knowledgeable'
    ]);

    // Whitelist for words that SHOULD have dots
    const dotWhitelist = new Set(['node.js', 'vue.js', 'react.js', 'next.js', 'express.js', 'angular.js', 'd3.js', 'three.js', 'chart.js', '.net', 'asp.net', 'vb.net', 'c#', 'f#']);

    // Clean text but preserve dots inside words for now
    let cleanText = text.toLowerCase().replace(/[^a-z0-9\s\+\#\.\/\-]/g, ' ');

    const words = cleanText
        .split(/\s+/)
        .filter(w => {
            // Filter out garbage
            if (w.length < 2) return false;
            if (stopWords.has(w)) return false;

            // If word ends in dot (e.g. "Bi."), ignore it unless it's whitelisted
            if (w.endsWith('.') && !dotWhitelist.has(w)) return false;

            // If word contains dot but isn't whitelisted, usually safe to keep split parts later
            // but for now let's just keep valid technical terms
            return true;
        })
        .map(w => w.replace(/\.$/, '')); // Remove trailing dot if any passed through

    // Count frequency
    const freq = {};
    words.forEach(w => {
        if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
    });

    // Also detect multi-word phrases (bigrams/trigrams) for things like "Power BI"
    // We use the original text to find these sequences
    const tokens = cleanText.split(/\s+/).filter(t => t.length > 0);

    for (let i = 0; i < tokens.length - 1; i++) {
        const t1 = tokens[i].replace(/\.$/, '');
        const t2 = tokens[i + 1].replace(/\.$/, '');

        if (!stopWords.has(t1) && !stopWords.has(t2)) {
            const bigram = t1 + ' ' + t2;
            if (bigram.length > 4) { // arbitrary length check
                freq[bigram] = (freq[bigram] || 0) + 1;
            }
        }
    }

    // Technical term patterns — boost these significantly
    const techPatterns = /\b(python|java|javascript|typescript|react|angular|vue|node\.?js|express|django|flask|fastapi|sql|nosql|mongodb|postgresql|mysql|aws|azure|gcp|docker|kubernetes|git|ci\/cd|rest|api|graphql|html|css|sass|webpack|vite|agile|scrum|jira|figma|machine\s*learning|deep\s*learning|data\s*science|nlp|tensorflow|pytorch|pandas|numpy|scikit|sklearn|tableau|power\s*bi|excel|spark|hadoop|kafka|redis|elasticsearch|linux|windows|c\+\+|c#|\.net|php|ruby|rails|swift|kotlin|go|rust|scala|r\b|matlab|sas|devops|microservices|serverless|blockchain|cybersecurity|cloud|saas|b2b|b2c|seo|sem|crm|erp|ux|ui|figma|adobe|analytics|reporting|dashboard|dashboards|kpi|roi|stakeholder|leadership|problem\s*solving|critical\s*thinking|project\s*management|product\s*management|business\s*analysis|documentation|testing|qa|automation|selenium|performance|optimization|scalability|security|compliance|gdpr|hipaa|data\s*engineering|data\s*pipeline|etl|data\s*modeling|data\s*visualization|statistical\s*analysis)\b/gi;

    const techMatches = text.match(techPatterns) || [];
    techMatches.forEach(t => {
        const lower = t.toLowerCase().trim();
        freq[lower] = (freq[lower] || 0) + 3; // strong boost for tech terms
    });

    // Sort by frequency, take top meaningful terms
    // Only include words with count >= 2 (tech terms are auto-boosted above this)
    return Object.entries(freq)
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([word]) => word);
}

/**
 * Calculate ATS score
 */
export function calculateATSScore(resumeKeywords, jdKeywords) {
    if (!jdKeywords.length) return { score: 0, matched: [], missing: [] };

    const resumeSet = new Set(resumeKeywords.map(k => k.toLowerCase()));
    const matched = [];
    const missing = [];

    jdKeywords.forEach(kw => {
        const lower = kw.toLowerCase();
        // Check exact match or partial match
        let found = false;
        for (const rk of resumeSet) {
            if (rk === lower || rk.includes(lower) || lower.includes(rk)) {
                found = true;
                break;
            }
        }
        if (found) {
            matched.push(kw);
        } else {
            missing.push(kw);
        }
    });

    const score = Math.round((matched.length / jdKeywords.length) * 100);

    return { score, matched, missing };
}

/**
 * Generate suggestions for where to add missing keywords
 */
export function generateSuggestions(missingKeywords, resumeText) {
    const sections = detectResumeSections(resumeText);
    const suggestions = [];

    missingKeywords.forEach(kw => {
        const suggestion = getSuggestionForKeyword(kw, sections);
        suggestions.push({
            keyword: kw,
            suggestion: suggestion
        });
    });

    return suggestions;
}

function detectResumeSections(text) {
    const sectionPatterns = {
        summary: /summary|objective|profile|about/i,
        experience: /experience|employment|work\s*history/i,
        skills: /skills|technologies|tools|competencies|expertise/i,
        education: /education|academic|degree|university|college/i,
        projects: /projects|portfolio/i,
        certifications: /certifications?|certificates?|licenses?/i
    };

    const found = {};
    for (const [name, pattern] of Object.entries(sectionPatterns)) {
        found[name] = pattern.test(text);
    }
    return found;
}

function getSuggestionForKeyword(keyword, sections) {
    const techTerms = /python|java|react|sql|aws|docker|kubernetes|git|html|css|node|angular|vue|typescript|mongodb|postgresql|redis|linux|tensorflow|pytorch|graphql|api|rest|ci\/cd|webpack|vite|agile|scrum|devops|cloud|microservices|serverless|selenium|cypress|jest/i;
    const softSkills = /leadership|communication|problem.solving|teamwork|collaboration|management|analytical|strategic|creative|adaptable|detail.oriented|organized|self.motivated|critical\s*thinking/i;
    const certTerms = /certified|certification|certificate|pmp|aws\s*certified|cissp|cpa|cfa|scrum\s*master/i;

    if (techTerms.test(keyword)) {
        if (sections.skills) {
            return `Add "${keyword}" to your **Skills** section. Also mention it in your **Experience** bullet points with specific usage context.`;
        }
        return `Create a **Skills** section and add "${keyword}". Include it in relevant experience bullet points.`;
    }

    if (softSkills.test(keyword)) {
        return `Demonstrate "${keyword}" in your **Experience** bullets with specific examples and measurable outcomes.`;
    }

    if (certTerms.test(keyword)) {
        if (sections.certifications) {
            return `Add "${keyword}" to your **Certifications** section.`;
        }
        return `Add a **Certifications** section and include "${keyword}".`;
    }

    if (sections.experience) {
        return `Incorporate "${keyword}" into your **Experience** section bullet points. Use it in context of a specific achievement or responsibility.`;
    }

    return `Add "${keyword}" to your resume. Best placed in the **Skills** or **Experience** section with specific context.`;
}

/**
 * Smart AI rewrite (client-side)
 * Enhances a bullet point to naturally include missing keywords
 */
export function localRewriteBullet(bulletText, missingKeywords) {
    if (!bulletText || !missingKeywords.length) return bulletText;

    let text = bulletText.trim();
    // Remove leading bullet marker if present
    text = text.replace(/^[•\-\*■▪]\s*/, '');

    const kwToAdd = missingKeywords.slice(0, 2);
    const kwStr = kwToAdd.join(' and ');
    const kwComma = kwToAdd.join(', ');

    // Remove trailing period for easier concatenation
    const endsWithPeriod = text.endsWith('.');
    const base = endsWithPeriod ? text.slice(0, -1) : text;

    // Multiple natural rewrite patterns
    const patterns = [
        `${base}, leveraging ${kwStr} to drive results.`,
        `${base}; incorporated ${kwStr} for enhanced functionality.`,
        `${base} using ${kwStr} to optimize performance.`,
        `${base}, with specific focus on ${kwStr}.`,
        `${base} (utilized ${kwStr} in this capacity).`,
        `${base}, ensuring effective use of ${kwStr}.`,
        `Applied ${kwStr} while ${base.charAt(0).toLowerCase()}${base.slice(1)}.`,
        `${base} — integrated ${kwStr} to support business goals.`
    ];

    // Pick a random pattern
    const idx = Math.floor(Math.random() * patterns.length);
    return patterns[idx];
}

/**
 * Generate a downloadable PDF from plain text
 * Rebuilds clean, professional HTML for print (dark text on white background)
 */
export function downloadAsPDF(plainText, filename = 'optimized-resume.pdf') {
    const lines = plainText.split('\n');
    let bodyHtml = '';

    const actionVerbPattern = /^(Achieved|Administered|Advised|Analyzed|Applied|Architected|Assessed|Assisted|Automated|Built|Cleaned|Collaborated|Communicated|Completed|Conducted|Configured|Consolidated|Contributed|Coordinated|Created|Customized|Debugged|Defined|Delivered|Demonstrated|Deployed|Designed|Detected|Developed|Directed|Documented|Drove|Enabled|Engineered|Enhanced|Ensured|Established|Evaluated|Executed|Expanded|Facilitated|Formulated|Generated|Guided|Identified|Implemented|Improved|Increased|Initiated|Innovated|Installed|Integrated|Introduced|Investigated|Launched|Led|Leveraged|Maintained|Managed|Mentored|Migrated|Modeled|Modernized|Monitored|Negotiated|Obtained|Operated|Optimized|Orchestrated|Organized|Oversaw|Performed|Pioneered|Planned|Prepared|Presented|Processed|Produced|Programmed|Proposed|Provided|Published|Queried|Raised|Ran|Received|Recommended|Redesigned|Reduced|Re-engineered|Refactored|Refined|Reformulated|Resolved|Restructured|Reviewed|Revised|Revitalized|Scheduled|Secured|Selected|Simplified|Solved|Spearheaded|Standardized|Streamlined|Strengthened|Supervised|Supported|Surpassed|Tested|Tracked|Trained|Transformed|Translated|Troubleshot|Unified|Updated|Upgraded|Utilized|Validated|Verified|Visualized|Wrote)\b/i;

    const sectionPattern = /^(experience|education|skills|projects|certifications?|summary|objective|profile|work\s*history|employment|awards|volunteer|interests|references|publications|languages?|career\s*objective|professional\s*experience|professional\s*summary|technical\s*skills|core\s*competencies|additional\s*skills)$/i;

    const contactPattern = /(\+?\d[\d\s\-]{7,}|@[\w.]+\.\w|linkedin|github|portfolio)/i;

    let headerLineCount = 0;
    let pastHeader = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            bodyHtml += '<div style="height:6px;"></div>';
            continue;
        }

        // Escape HTML
        const escaped = trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Section heading
        const isHeading = sectionPattern.test(trimmed)
            || (trimmed.length > 3 && trimmed.length < 50 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && !/^\d/.test(trimmed) && !/[@|+]/.test(trimmed));

        // Bullet
        const hasBulletMarker = trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('■') || trimmed.match(/^\d+\./);
        const startsWithActionVerb = actionVerbPattern.test(trimmed) && trimmed.length > 30;
        const isBullet = hasBulletMarker || startsWithActionVerb;

        const isContact = contactPattern.test(trimmed) && trimmed.length < 200;

        if (isHeading || isBullet) pastHeader = true;

        if (!pastHeader && !isContact && headerLineCount < 2 && trimmed.length < 60 && !isBullet) {
            if (headerLineCount === 0) {
                bodyHtml += '<h1>' + escaped + '</h1>';
            } else {
                bodyHtml += '<h3>' + escaped + '</h3>';
            }
            headerLineCount++;
        } else if (isContact) {
            bodyHtml += '<p style="text-align:center;font-size:10pt;color:#555;margin:2px 0;">' + escaped + '</p>';
        } else if (isHeading) {
            bodyHtml += '<h2>' + escaped + '</h2>';
        } else if (isBullet) {
            const bulletText = escaped.replace(/^[•\-*■]\s*/, '');
            bodyHtml += '<p style="padding-left:16px;position:relative;"><span style="position:absolute;left:4px;">•</span>' + bulletText + '</p>';
        } else {
            bodyHtml += '<p>' + escaped + '</p>';
        }
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(
        '<!DOCTYPE html>' +
        '<html>' +
        '<head>' +
        '  <title>' + filename + '</title>' +
        '  <style>' +
        '    * { margin: 0; padding: 0; box-sizing: border-box; }' +
        '    body {' +
        '      font-family: Calibri, "Segoe UI", Arial, sans-serif;' +
        '      max-width: 750px;' +
        '      margin: 30px auto;' +
        '      padding: 30px 40px;' +
        '      color: #222;' +
        '      font-size: 11pt;' +
        '      line-height: 1.5;' +
        '    }' +
        '    h1 {' +
        '      font-size: 22pt;' +
        '      font-weight: 800;' +
        '      text-align: center;' +
        '      color: #111;' +
        '      letter-spacing: 1px;' +
        '      text-transform: uppercase;' +
        '      margin-bottom: 2px;' +
        '    }' +
        '    h2 {' +
        '      font-size: 13pt;' +
        '      font-weight: 700;' +
        '      color: #111;' +
        '      text-transform: uppercase;' +
        '      letter-spacing: 0.5px;' +
        '      border-bottom: 1.5px solid #333;' +
        '      padding-bottom: 2px;' +
        '      margin-top: 14px;' +
        '      margin-bottom: 6px;' +
        '    }' +
        '    h3 {' +
        '      font-size: 13pt;' +
        '      font-weight: 600;' +
        '      text-align: center;' +
        '      color: #444;' +
        '      margin: 2px 0 4px 0;' +
        '    }' +
        '    p {' +
        '      margin: 2px 0;' +
        '      font-size: 10.5pt;' +
        '      color: #222;' +
        '    }' +
        '    @media print {' +
        '      body { margin: 0; padding: 20px 30px; }' +
        '      @page { margin: 0.5in; }' +
        '    }' +
        '  </style>' +
        '</head>' +
        '<body>' + bodyHtml + '</body>' +
        '</html>'
    );
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
    }, 500);
}

/**
 * Debounce function
 */
export function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}
