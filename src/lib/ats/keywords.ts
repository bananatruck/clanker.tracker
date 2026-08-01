/**
 * Tokenisation and alias folding for requirement matching.
 *
 * A posting says "JS", the resume says "JavaScript", and a naive matcher
 * reports a gap that isn't there — then the user rewrites a bullet to fix a
 * problem they never had. Folding synonyms to one canonical token is what
 * makes the evidence table trustworthy enough to act on.
 *
 * Same principle as lib/fill/normalize.ts, different vocabulary: that one
 * folds *questions*, this one folds *technologies*.
 */

/** Words that carry no matching signal. Kept tight — over-stripping loses meaning. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for',
  'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could',
  'can', 'may', 'might', 'must', 'shall', 'this', 'that', 'these', 'those',
  'you', 'your', 'we', 'our', 'us', 'they', 'their', 'it', 'its',
  'ability', 'able', 'strong', 'excellent', 'good', 'great', 'solid', 'proven',
  'experience', 'experienced', 'knowledge', 'understanding', 'familiarity',
  'skills', 'skill', 'working', 'work', 'years', 'year', 'plus', 'etc',
  'including', 'include', 'includes', 'such', 'other', 'more', 'most', 'well',
  'using', 'use', 'used', 'across', 'within', 'into', 'about', 'over',
]);

/**
 * Canonical forms. Written as `variant → canonical` so that both sides of a
 * comparison collapse to the same token regardless of which one the writer used.
 */
const ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  node: 'nodejs',
  'node.js': 'nodejs',
  'react.js': 'react',
  reactjs: 'react',
  'vue.js': 'vue',
  vuejs: 'vue',
  golang: 'go',
  py: 'python',
  postgres: 'postgresql',
  psql: 'postgresql',
  mongo: 'mongodb',
  k8s: 'kubernetes',
  kube: 'kubernetes',
  gcp: 'googlecloud',
  'google cloud': 'googlecloud',
  aws: 'aws',
  'amazon web services': 'aws',
  ci: 'cicd',
  cd: 'cicd',
  'ci/cd': 'cicd',
  ml: 'machinelearning',
  'machine learning': 'machinelearning',
  ai: 'artificialintelligence',
  nlp: 'naturallanguageprocessing',
  'rest api': 'rest',
  restful: 'rest',
  api: 'api',
  apis: 'api',
  db: 'database',
  databases: 'database',
  sql: 'sql',
  ux: 'userexperience',
  ui: 'userinterface',
  qa: 'qualityassurance',
  oop: 'objectoriented',
  tdd: 'testdriven',
  'unit testing': 'testing',
  tests: 'testing',
  test: 'testing',
  agile: 'agile',
  scrum: 'agile',
  'c#': 'csharp',
  'c++': 'cplusplus',
  'objective-c': 'objectivec',
  frontend: 'frontend',
  'front-end': 'frontend',
  'front end': 'frontend',
  backend: 'backend',
  'back-end': 'backend',
  'back end': 'backend',
  fullstack: 'fullstack',
  'full-stack': 'fullstack',
  'full stack': 'fullstack',
};

/** Multi-word aliases must be folded before the string is split on spaces. */
const PHRASE_ALIASES = Object.entries(ALIASES).filter(([k]) => /[\s/]/.test(k));

/** Crude singularisation. Enough to make "microservices" match "microservice". */
function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('sses') || word.endsWith('shes') || word.endsWith('ches')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Every value the alias table maps *to*. These are already canonical and must
 * never be singularised — otherwise "Kubernetes" becomes "kubernete" while
 * "k8s" resolves to "kubernetes", and the two stop matching each other.
 */
const CANONICAL_FORMS = new Set(Object.values(ALIASES));

/** Fold one token to its canonical form. */
export function canonical(token: string): string {
  const t = token.toLowerCase().trim();
  const direct = ALIASES[t];
  if (direct) return direct;
  if (CANONICAL_FORMS.has(t)) return t;
  const singular = singularize(t);
  return ALIASES[singular] ?? singular;
}

/**
 * Split text into canonical content tokens.
 *
 * `+`, `#` and `.` survive the punctuation strip because dropping them turns
 * C++ into C and Node.js into two useless tokens.
 */
export function tokenize(text: string): string[] {
  let s = text.toLowerCase();

  for (const [phrase, to] of PHRASE_ALIASES) {
    s = s.split(phrase).join(` ${to} `);
  }

  return s
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .split(/[\s,/]+/)
    .map((w) => w.replace(/^[-.]+|[-.]+$/g, ''))
    .filter((w) => w.length >= 2)
    .map(canonical)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

/** Distinct content tokens, order preserved. */
export function keywords(text: string): string[] {
  return [...new Set(tokenize(text))];
}

/** Years demanded by a requirement, if it states a number. */
export function extractYears(text: string): number | null {
  // "5+ years", "3-5 years", "minimum of 4 years"
  const m = /(\d{1,2})\s*(?:\+|-\s*\d{1,2})?\s*(?:\+\s*)?year/i.exec(text);
  return m ? Number(m[1]) : null;
}
