"""
ResumeAI — FastAPI Backend for ATS Resume Analysis
Deployed on Vercel as serverless Python functions.
Now with OpenAI LLM for real AI bullet rewrites.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import re
import json
import os
from collections import Counter
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="ResumeAI API", version="2.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# OpenAI LLM Setup
# ──────────────────────────────────────────────

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
openai_client = None

def get_openai_client():
    """Lazy-init the OpenAI client. Returns None if no API key."""
    global openai_client
    if openai_client is not None:
        return openai_client
    if not OPENAI_API_KEY:
        print("⚠️  OPENAI_API_KEY not set — AI rewrites will use template fallback")
        return None
    try:
        from openai import AsyncOpenAI
        openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        print("✅ OpenAI client initialized")
        return openai_client
    except Exception as e:
        print(f"⚠️  OpenAI init failed: {e}")
        return None


# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    resume_text: str
    jd_text: str

class RewriteRequest(BaseModel):
    bullet_text: str
    jd_text: str
    missing_keywords: list[str]

class RewriteAllRequest(BaseModel):
    resume_text: str
    jd_text: str
    missing_keywords: list[str]

class DownloadRequest(BaseModel):
    resume_html: str
    filename: Optional[str] = "optimized-resume.pdf"

class AnalyzeResponse(BaseModel):
    score: int
    matched_keywords: list[str]
    missing_keywords: list[str]
    suggestions: list[dict]
    resume_keyword_count: int
    jd_keyword_count: int

class RewriteResponse(BaseModel):
    original: str
    rewritten: str
    keywords_added: list[str]
    used_ai: bool = False

class RewriteAllResponse(BaseModel):
    original_text: str
    optimized_text: str
    keywords_added: list[str]
    used_ai: bool = False


# ──────────────────────────────────────────────
# NLP Utilities
# ──────────────────────────────────────────────

STOP_WORDS = {
    'a','an','the','and','or','but','in','on','at','to','for','of','with',
    'by','from','is','are','was','were','be','been','being','have','has',
    'had','do','does','did','will','would','could','should','may','might',
    'shall','can','need','must','it','its','i','me','my','we','our','you',
    'your','he','his','she','her','they','them','their','this','that',
    'these','those','what','which','who','whom','when','where','why','how',
    'all','each','every','both','few','more','most','other','some','such',
    'no','not','only','own','same','so','than','too','very','just','about',
    'above','after','again','also','am','as','because','before','between',
    'during','here','into','over','then','there','through','under','up',
    'out','if','while','any','work','working','worked','use','used','using',
    'experience','including','well','within','across','ensure','ability',
    'strong','role','team','new','etc','able','get','make','like','good',
    'year','years','help','know','two','way','look','first','go','going',
    'see','day','back','still','come','take','want','long','thing','much',
    'right','say','try','best','part','per','based','high','time','key',
}

TECH_PATTERNS = re.compile(
    r'\b(python|java|javascript|typescript|react|angular|vue|node\.?js|express|'
    r'django|flask|fastapi|sql|nosql|mongodb|postgresql|mysql|aws|azure|gcp|'
    r'docker|kubernetes|git|ci/cd|rest|api|graphql|html|css|sass|webpack|vite|'
    r'agile|scrum|jira|figma|machine\s*learning|deep\s*learning|data\s*science|'
    r'nlp|tensorflow|pytorch|pandas|numpy|scikit|sklearn|tableau|power\s*bi|'
    r'excel|spark|hadoop|kafka|redis|elasticsearch|linux|c\+\+|c#|\.net|php|'
    r'ruby|rails|swift|kotlin|go|rust|scala|devops|microservices|serverless|'
    r'selenium|cypress|jest|mocha|junit|cloud|saas|seo|sem|crm|erp|ux|ui|'
    r'analytics|dashboard|kpi|roi|stakeholder|leadership|communication|'
    r'project\s*management|product\s*management|business\s*analysis|qa|'
    r'automation|performance|optimization|scalability|security|compliance)\b',
    re.IGNORECASE
)


def extract_keywords(text: str) -> list[str]:
    """Extract important keywords from text using NLP-lite approach."""
    if not text:
        return []

    # Tokenize
    words = re.sub(r'[^a-z0-9\s\+\#\.\/\-]', ' ', text.lower()).split()
    words = [w for w in words if len(w) > 2 and w not in STOP_WORDS]

    # Count frequency
    freq = Counter(words)

    # Extract bigrams
    tokens = re.sub(r'[^a-z0-9\s\+\#\.\/\-]', ' ', text.lower()).split()
    tokens = [t for t in tokens if len(t) > 1]
    for i in range(len(tokens) - 1):
        if tokens[i] not in STOP_WORDS and tokens[i+1] not in STOP_WORDS:
            bigram = f"{tokens[i]} {tokens[i+1]}"
            if len(bigram) > 5:
                freq[bigram] = freq.get(bigram, 0) + 1

    # Boost technical terms
    tech_matches = TECH_PATTERNS.findall(text)
    for t in tech_matches:
        freq[t.lower().strip()] = freq.get(t.lower().strip(), 0) + 2

    # Sort by frequency, top 50
    sorted_kw = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    return [kw for kw, _ in sorted_kw[:50]]


def calculate_score(resume_keywords: list[str], jd_keywords: list[str]):
    """Calculate ATS compatibility score."""
    if not jd_keywords:
        return 0, [], []

    resume_set = set(k.lower() for k in resume_keywords)
    matched = []
    missing = []

    for kw in jd_keywords:
        lower = kw.lower()
        found = any(
            rk == lower or lower in rk or rk in lower
            for rk in resume_set
        )
        if found:
            matched.append(kw)
        else:
            missing.append(kw)

    score = round((len(matched) / len(jd_keywords)) * 100) if jd_keywords else 0
    return score, matched, missing


def generate_suggestions(missing_keywords: list[str], resume_text: str) -> list[dict]:
    """Generate placement suggestions for missing keywords."""
    sections = {
        'summary': bool(re.search(r'summary|objective|profile|about', resume_text, re.I)),
        'experience': bool(re.search(r'experience|employment|work\s*history', resume_text, re.I)),
        'skills': bool(re.search(r'skills|technologies|tools|competencies', resume_text, re.I)),
        'education': bool(re.search(r'education|academic|degree|university', resume_text, re.I)),
        'certifications': bool(re.search(r'certifications?|certificates?', resume_text, re.I)),
    }

    suggestions = []
    for kw in missing_keywords[:15]:
        tech = bool(TECH_PATTERNS.search(kw))
        soft = bool(re.search(
            r'leadership|communication|problem.solving|teamwork|collaboration|management',
            kw, re.I
        ))

        if tech:
            where = "Skills" if sections['skills'] else "a new Skills section"
            suggestion = f'Add "{kw}" to your **{where}**. Also mention it in Experience bullet points with specific usage context.'
        elif soft:
            suggestion = f'Demonstrate "{kw}" in your **Experience** bullets with specific examples and measurable outcomes.'
        elif sections['experience']:
            suggestion = f'Incorporate "{kw}" into your **Experience** bullet points. Use it in context of a specific achievement.'
        else:
            suggestion = f'Add "{kw}" to your resume, best placed in the **Skills** or **Experience** section.'

        suggestions.append({"keyword": kw, "suggestion": suggestion})

    return suggestions


# ──────────────────────────────────────────────
# Template-Based Fallback (no AI key)
# ──────────────────────────────────────────────

def template_rewrite_bullet(bullet: str, missing_keywords: list[str]) -> tuple[str, list[str]]:
    """Fallback rewrite using templates when OpenAI is unavailable."""
    if not bullet or not missing_keywords:
        return bullet, []

    kw_to_add = missing_keywords[:2]
    kw_str = " and ".join(kw_to_add)

    import random
    patterns = [
        f"{bullet.rstrip('.')}. Leveraged {kw_str} to optimize outcomes and drive measurable results.",
        f"Utilized {kw_str} to {bullet[0].lower()}{bullet[1:].rstrip('.')}, achieving significant improvements.",
        f"{bullet.rstrip('.')}; applied {kw_str} to enhance efficiency and deliver impactful solutions.",
    ]
    rewritten = random.choice(patterns)
    return rewritten, kw_to_add


# ──────────────────────────────────────────────
# OpenAI AI Rewrites
# ──────────────────────────────────────────────

async def ai_rewrite_bullet(bullet: str, jd_text: str, missing_keywords: list[str]) -> tuple[str, list[str], bool]:
    """
    Use OpenAI to intelligently rewrite a single bullet point.
    Returns (rewritten_text, keywords_added, used_ai).
    Falls back to template if OpenAI unavailable.
    """
    client = get_openai_client()
    if not client:
        rewritten, added = template_rewrite_bullet(bullet, missing_keywords)
        return rewritten, added, False

    kw_list = ", ".join(missing_keywords[:5])
    prompt = f"""You are an expert resume writer and ATS optimization specialist.

**Task**: Rewrite the following resume bullet point to naturally incorporate some of these missing keywords: {kw_list}

**Original bullet**: "{bullet}"

**Job description context** (for tone/relevance): "{jd_text[:500]}"

**Rules**:
1. Keep the same general meaning and achievement from the original bullet
2. Naturally weave in 2-3 of the missing keywords — do NOT force-fit all of them
3. Use strong action verbs and quantify results where possible
4. Keep it to 1-2 lines max (concise, professional)
5. Do NOT add any explanation, prefix, or label — just the rewritten bullet point itself
6. Start with an action verb (e.g., "Led", "Developed", "Optimized", "Implemented")

**Output**: Only the rewritten bullet point, nothing else."""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.7,
        )
        rewritten = response.choices[0].message.content.strip().strip('"').strip("'").strip("- ").strip("• ")

        # Determine which keywords were actually added
        added = [kw for kw in missing_keywords[:5] if kw.lower() in rewritten.lower()]
        if not added:
            added = missing_keywords[:2]  # assume at least intent

        return rewritten, added, True
    except Exception as e:
        print(f"⚠️ OpenAI rewrite failed: {e}")
        rewritten, added = template_rewrite_bullet(bullet, missing_keywords)
        return rewritten, added, False


async def ai_rewrite_all(resume_text: str, jd_text: str, missing_keywords: list[str]) -> tuple[str, list[str], bool]:
    """
    Use OpenAI to optimize the entire resume text.
    Returns (optimized_text, keywords_added, used_ai).
    Falls back to simple keyword insertion if OpenAI unavailable.
    """
    client = get_openai_client()
    if not client:
        # Fallback: just add an "Additional Skills" line
        skills = ", ".join(kw.title() for kw in missing_keywords[:10])
        optimized = resume_text.rstrip() + f"\n\nAdditional Skills: {skills}"
        return optimized, missing_keywords[:10], False

    kw_list = ", ".join(missing_keywords[:15])
    prompt = f"""You are an expert resume writer and ATS optimization specialist.

**Task**: Optimize the following resume to naturally incorporate missing keywords from a job description.

**Missing keywords to incorporate**: {kw_list}

**Job description** (for context):
{jd_text[:800]}

**Current resume**:
{resume_text[:3000]}

**Rules**:
1. Keep the EXACT SAME structure, sections, and formatting of the original resume
2. Keep all existing content — do NOT remove any achievements or experiences
3. Naturally weave missing keywords into existing bullet points where they fit
4. If a keyword doesn't fit in any existing bullet, add it to the Skills section
5. Use strong action verbs and maintain a professional tone
6. Do NOT add any explanation, prefix, or commentary — output ONLY the optimized resume text
7. Preserve line breaks and section headings exactly as they are

**Output**: The full optimized resume text only."""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=3000,
            temperature=0.7,
        )
        optimized = response.choices[0].message.content.strip()

        # Determine which keywords were added
        added = [kw for kw in missing_keywords if kw.lower() in optimized.lower()]

        return optimized, added, True
    except Exception as e:
        print(f"⚠️ OpenAI rewrite-all failed: {e}")
        skills = ", ".join(kw.title() for kw in missing_keywords[:10])
        optimized = resume_text.rstrip() + f"\n\nAdditional Skills: {skills}"
        return optimized, missing_keywords[:10], False


# ──────────────────────────────────────────────
# API Endpoints
# ──────────────────────────────────────────────

@app.get("/")
async def root():
    has_ai = bool(OPENAI_API_KEY)
    return {
        "message": "ResumeAI API",
        "version": "2.0.0",
        "status": "healthy",
        "ai_enabled": has_ai
    }


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    """Analyze resume against job description and return ATS score."""
    if len(request.resume_text.strip()) < 20:
        raise HTTPException(400, "Resume text too short")
    if len(request.jd_text.strip()) < 20:
        raise HTTPException(400, "Job description too short")

    resume_kw = extract_keywords(request.resume_text)
    jd_kw = extract_keywords(request.jd_text)

    score, matched, missing = calculate_score(resume_kw, jd_kw)
    suggestions = generate_suggestions(missing, request.resume_text)

    return AnalyzeResponse(
        score=score,
        matched_keywords=matched,
        missing_keywords=missing,
        suggestions=suggestions,
        resume_keyword_count=len(resume_kw),
        jd_keyword_count=len(jd_kw),
    )


@app.post("/api/rewrite", response_model=RewriteResponse)
async def rewrite(request: RewriteRequest):
    """Rewrite a single bullet point using AI (Gemini) or template fallback."""
    if not request.bullet_text.strip():
        raise HTTPException(400, "Bullet text is empty")

    rewritten, added, used_ai = await ai_rewrite_bullet(
        request.bullet_text,
        request.jd_text,
        request.missing_keywords
    )

    return RewriteResponse(
        original=request.bullet_text,
        rewritten=rewritten,
        keywords_added=added,
        used_ai=used_ai,
    )


@app.post("/api/rewrite-all", response_model=RewriteAllResponse)
async def rewrite_all(request: RewriteAllRequest):
    """Optimize the entire resume using AI (Gemini) or template fallback."""
    if not request.resume_text.strip():
        raise HTTPException(400, "Resume text is empty")

    optimized, added, used_ai = await ai_rewrite_all(
        request.resume_text,
        request.jd_text,
        request.missing_keywords
    )

    return RewriteAllResponse(
        original_text=request.resume_text,
        optimized_text=optimized,
        keywords_added=added,
        used_ai=used_ai,
    )


@app.get("/api/health")
async def health():
    has_ai = bool(OPENAI_API_KEY)
    return {"status": "ok", "ai_enabled": has_ai}
