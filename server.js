const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
let sharp;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|bmp|mp4|avi|mov|webm|mkv|pdf|doc|docx|txt|rtf/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('application/') ||
      file.mimetype.startsWith('text/');
    cb(null, extOk || mimeOk);
  }
});

// ═══════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

function readFileHead(filePath, maxBytes = 1048576) {
  const stats = fs.statSync(filePath);
  const size = Math.min(stats.size, maxBytes);
  const buffer = Buffer.alloc(size);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, size, 0);
  fs.closeSync(fd);
  return buffer;
}

function clamp(val, min = 0.05, max = 0.95) {
  return Math.min(max, Math.max(min, val));
}

function verdictFromPercent(aiPercent) {
  if (aiPercent >= 75) return { verdict: 'Likely AI-Generated', verdictColor: 'red' };
  if (aiPercent >= 55) return { verdict: 'Possibly AI-Generated', verdictColor: 'orange' };
  if (aiPercent >= 40) return { verdict: 'Uncertain', verdictColor: 'yellow' };
  return { verdict: 'Likely Human-Written', verdictColor: 'green' };
}

// Shannon entropy: H = -Σ p·log₂(p)
function shannonEntropy(freqMap, total) {
  if (total === 0) return 0;
  let h = 0;
  for (const count of Object.values(freqMap)) {
    if (count > 0) {
      const p = count / total;
      h -= p * Math.log2(p);
    }
  }
  return h;
}

// Sigmoid normalization: maps raw value → 0-1 AI likelihood
// When invert=true, LOWER raw values → higher AI score
function sigmoidNorm(raw, center, steepness, invert = false) {
  const x = invert
    ? (center - raw) * steepness
    : (raw - center) * steepness;
  return 1 / (1 + Math.exp(-x));
}

// Pearson correlation coefficient
function pearsonCorr(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
}

// Lag-1 autocorrelation
function autocorrelation(vals) {
  const n = vals.length;
  if (n < 3) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n - 1; i++) num += (vals[i] - mean) * (vals[i + 1] - mean);
  for (let i = 0; i < n; i++) den += (vals[i] - mean) ** 2;
  return den === 0 ? 0 : num / den;
}

// Coefficient of variation (σ / μ)
function cv(vals) {
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mean === 0) return 0;
  const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  return std / mean;
}

// Syllable count (heuristic)
function countSyllables(word) {
  word = word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? Math.max(m.length, 1) : 1;
}

// Flesch-Kincaid grade level for a block of text
function fkGrade(text) {
  const sents = text.match(/[^.!?]+[.!?]+/g) || [text];
  const words = text.match(/\b[a-z']+\b/gi) || [];
  if (words.length === 0 || sents.length === 0) return 0;
  const syls = words.reduce((s, w) => s + countSyllables(w), 0);
  return 0.39 * (words.length / sents.length) + 11.8 * (syls / words.length) - 15.59;
}

// Length-aware confidence
function computeConfidence(wordCount, rawProb) {
  const decisiveness = Math.abs(rawProb - 0.5) * 2;
  let lengthMul;
  if (wordCount < 50) lengthMul = 0.3;
  else if (wordCount < 100) lengthMul = 0.5;
  else if (wordCount < 200) lengthMul = 0.75;
  else if (wordCount < 500) lengthMul = 0.9;
  else lengthMul = 1.0;
  const conf = decisiveness * lengthMul;
  if (conf >= 0.6) return 'High';
  if (conf >= 0.35) return 'Medium';
  return 'Low';
}

// Top 200 most common English words
const COMMON_WORDS = new Set([
  'the','be','to','of','and','a','in','that','have','i','it','for','not','on',
  'with','he','as','you','do','at','this','but','his','by','from','they','we',
  'say','her','she','or','an','will','my','one','all','would','there','their',
  'what','so','up','out','if','about','who','get','which','go','me','when',
  'make','can','like','time','no','just','him','know','take','people','into',
  'year','your','good','some','could','them','see','other','than','then','now',
  'look','only','come','its','over','think','also','back','after','use','two',
  'how','our','work','first','well','way','even','new','want','because','any',
  'these','give','day','most','us','great','very','much','before','between',
  'still','should','been','through','where','too','find','here','thing','many',
  'those','long','made','world','own','while','last','might','such','end',
  'never','both','old','each','tell','does','set','three','had','has','was',
  'were','are','is','am','did','being','more','may','down','part','same',
  'around','every','must','place','small','right','big','few','off','keep',
  'help','put','another','hand','high','again','under','once','man','woman',
  'life','child','home','need','house','why','let','head','point','far','turn',
  'move','left','run','real','group','start','call','ask','began','seem','show',
  'hear','play','number','change','state'
]);

// AI cliché words — disproportionately generated by LLMs
// Only words that are DISTINCTIVELY AI — excludes common academic/formal vocabulary
const AI_CLICHE_WORDS = new Set([
  'delve','tapestry','landscape','leverage','utilize','facilitate',
  'multifaceted','comprehensive','robust','nuanced','pivotal','paramount',
  'intricate','meticulous','holistic','streamline','foster','encompass',
  'embark','underscore','interplay','showcasing','navigating','underscores',
  'harness','spearhead','bolster','elucidate','cornerstone','synergy',
  'groundbreaking','transformative','noteworthy','commendable','invaluable',
  'indispensable','testament','realm','myriad','plethora',
  'harnessing','crafting','elevate','optimize','strategically','proactively',
  'seamlessly','endeavor','adept','proficient',
  'burgeoning','thriving','vibrant','bustling',
  'captivating','enthralling','resonate','reverberate',
  'accentuate','illuminate','demystify','unravel',
  'spearheading','orchestrating','catalyzing','galvanizing','propelling',
  // Extended list — additional high-signal AI words
  'arguably','undeniably','unequivocally','quintessential','indispensable',
  'imperative','conducive','elucidating','delineate','juxtapose',
  'juxtaposition','paradigm','paradigmatic','synergistic','synergize',
  'ideate','ideation','actionable','scalable','impactful',
  'operationalize','incentivize','conceptualize','contextualize',
  'revolutionize','reimagine','reinvent','reimagining',
  'underpin','underpinning','overarching','intersectionality',
  'intersecting','multifarious','manifold','discerning',
  'astute','judicious','exemplary','commendable','laudable',
  'formidable','unwavering','steadfast','relentless','tenacious',
  'poignant','evocative','visceral','palpable','tangible',
  'intangible','ephemeral','transcendent','unprecedented',
  'unparalleled','seminal','watershed','monumental',
  'instrumental','consequential','substantive','quintessentially',
  'reimagined','curated','curating','bespoke',
  'tailor','tailored','tailor-made','fine-tuned',
  'cutting-edge','state-of-the-art','thought-provoking',
  'game-changing','trailblazing','pioneering',
  'ever-evolving','ever-changing','ever-growing','ever-increasing',
  'aforementioned','hitherto','heretofore','notwithstanding',
  'therein','thereof','whereby','whilst',
]);

// AI cliché phrases
const AI_CLICHE_PHRASES = [
  "it's important to note","it is important to note","it's worth noting",
  "it is worth noting","it bears mentioning","in today's world",
  "in today's digital age","in today's fast-paced","in the realm of",
  "plays a crucial role","plays a vital role","plays a key role",
  "plays an important role","is a testament to","stands as a testament",
  "serves as a reminder","serves as a testament","paves the way",
  "shed light on","sheds light on","shedding light on","dive deep into",
  "let's dive in","let's delve into","a myriad of","a plethora of",
  "at the end of the day","it goes without saying","when it comes to",
  "in this day and age","the landscape of","the realm of",
  "it cannot be overstated","cannot be understated",
  "in a nutshell","the bottom line is","the key takeaway",
  "moving forward","going forward","looking ahead",
  "the importance of","the significance of","the impact of",
  "has become increasingly","is becoming increasingly",
  "whether you're a","whether you are a",
  "not only but also","first and foremost","last but not least",
  "in order to","due to the fact","the fact that",
  "on the other hand","having said that","that being said",
  "it should come as no surprise","comes as no surprise",
  "are well-positioned","is well-positioned",
  "offers a unique","offers valuable","provides valuable",
  "can be a game","is a game-changer",
  "are you looking to","if you're looking to","if you are looking to",
  "in the ever-evolving","in an ever-changing",
  "a comprehensive guide","a step-by-step guide",
  "from understanding","from exploring","from analyzing",
  "by understanding","by exploring","by leveraging",
  "this comprehensive","this article will","this guide will",
  "without further ado","with that in mind","with this in mind",
  // Extended phrases — additional high-signal AI patterns
  "it is crucial to","it is essential to","it is imperative to",
  "it is noteworthy that","it is evident that","it is clear that",
  "it is undeniable that","it is worth mentioning","it is safe to say",
  "there is no denying","there is no doubt","needless to say",
  "as we navigate","as we delve","as we explore",
  "one cannot overstate","one cannot underestimate",
  "in an increasingly","in our increasingly",
  "stands out as","stands as a","serves as a cornerstone",
  "serves as a catalyst","acts as a catalyst",
  "the cornerstone of","the bedrock of","the crux of",
  "the epitome of","the pinnacle of","the hallmark of",
  "a deep dive into","taking a closer look","a holistic approach",
  "a nuanced understanding","a comprehensive understanding",
  "a fundamental shift","a paradigm shift",
  "strikes a balance","navigating the complexities",
  "at its core","at the heart of","at the forefront of",
  "is poised to","are poised to","well-positioned to",
  "on a deeper level","to a large extent","to a great extent",
  "a wide range of","a broad spectrum of","a diverse range of",
  "the intricacies of","the nuances of","the complexities of",
  "in light of","in the wake of","in the context of",
  "is not without its challenges","is not without its limitations",
  "the ever-growing","the ever-expanding","the rapidly evolving",
  "a testament to the","a reflection of","a manifestation of",
  "fosters a sense of","cultivates a sense of",
  "the overarching goal","the overarching theme",
  "embracing the","harnessing the power","unlocking the potential",
  "bridging the gap","closing the gap","filling the void",
  "a wealth of","a treasure trove","an abundance of",
  "the fabric of","the tapestry of","woven into the fabric",
  "reshaping the","redefining the","revolutionizing the",
  "it becomes evident","it becomes clear","it becomes apparent",
  "to put it simply","simply put","to sum up",
  "a double-edged sword","a slippery slope",
  "the tip of the iceberg","scratch the surface",
  "food for thought","a wake-up call",
];

// AI-typical adverbs — AI overuses these formal adverbs
const AI_ADVERBS = new Set([
  'significantly','importantly','effectively','efficiently','essentially',
  'fundamentally','particularly','specifically','notably','remarkably',
  'considerably','substantially','profoundly','increasingly','predominantly',
  'inherently','intrinsically','invariably','inevitably','undoubtedly',
  'unquestionably','indisputably','categorically','overwhelmingly',
  'disproportionately','exponentially','systematically','holistically',
  'strategically','proactively','meticulously','seamlessly','effortlessly',
  'comprehensively','thoroughly','rigorously','robustly',
]);

// ═══════════════════════════════════════════════════════════
//  TEXT ANALYSIS — 23 Signals with Ensemble Scoring
// ═══════════════════════════════════════════════════════════

function analyzeText(text) {
  if (!text || text.trim().length < 50) {
    return { error: 'Please provide at least 50 characters for meaningful analysis.' };
  }
  const clean = text.trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  const words = clean.toLowerCase().match(/\b[a-z']+\b/g) || [];
  const wc = words.length;
  if (wc < 10) {
    return { error: 'Please provide at least 10 words for accurate analysis.' };
  }
  const uniqueWords = new Set(words);
  const paragraphs = clean.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const sentLens = sentences.map(s => (s.match(/\b\w+\b/g) || []).length);
  const avgSL = sentLens.reduce((a, b) => a + b, 0) / sentLens.length;
  const lowerClean = clean.toLowerCase();
  const chars = clean.toLowerCase().replace(/\s+/g, ' ');

  // ─── Word frequency map (reused by several signals) ───
  const wordFreq = {};
  for (const w of words) wordFreq[w] = (wordFreq[w] || 0) + 1;

  // ─── Bigram frequency map ───
  const bigramFreq = {};
  let bigramTotal = 0;
  for (let i = 0; i < wc - 1; i++) {
    const bg = words[i] + ' ' + words[i + 1];
    bigramFreq[bg] = (bigramFreq[bg] || 0) + 1;
    bigramTotal++;
  }

  // ═══════════════════════════════════════
  // SIGNAL 1: Character Trigram Entropy
  // ═══════════════════════════════════════
  const charTriFreq = {};
  let charTriTotal = 0;
  for (let i = 0; i < chars.length - 2; i++) {
    const tri = chars.substring(i, i + 3);
    charTriFreq[tri] = (charTriFreq[tri] || 0) + 1;
    charTriTotal++;
  }
  const charTriEntropy = shannonEntropy(charTriFreq, charTriTotal);
  const sig1 = sigmoidNorm(charTriEntropy, 8.6, 2.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 2: Word-Level Entropy Ratio
  // ═══════════════════════════════════════
  const wordEntropy = shannonEntropy(wordFreq, wc);
  const maxWordEntropy = Math.log2(uniqueWords.size || 1);
  const wordEntropyRatio = maxWordEntropy > 0 ? wordEntropy / maxWordEntropy : 1;
  const sig2 = sigmoidNorm(wordEntropyRatio, 0.92, 18.0, false);

  // ═══════════════════════════════════════
  // SIGNAL 3: Zipf's Law Correlation
  // ═══════════════════════════════════════
  const freqVals = Object.values(wordFreq).sort((a, b) => b - a);
  let zipfCorr = 0.97;
  if (freqVals.length >= 10) {
    const logRanks = freqVals.map((_, i) => Math.log(i + 1));
    const logFreqs = freqVals.map(f => Math.log(f));
    zipfCorr = Math.abs(pearsonCorr(logRanks, logFreqs));
  }
  const sig3 = sigmoidNorm(zipfCorr, 0.94, 10.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 4: Conditional Word Entropy (Bigram)
  // ═══════════════════════════════════════
  const bigramEntropy = shannonEntropy(bigramFreq, bigramTotal);
  const condEntropy = Math.max(0, bigramEntropy - wordEntropy);
  const sig4 = sigmoidNorm(condEntropy, 4.5, 0.6, true);

  // ═══════════════════════════════════════
  // SIGNAL 5: Sentence Length Burstiness
  // ═══════════════════════════════════════
  const slCV = cv(sentLens);
  const diffs = sentLens.slice(1).map((v, i) => Math.abs(v - sentLens[i]));
  const diffCV = diffs.length > 1 ? cv(diffs) : slCV;
  const combinedBurst = (slCV + diffCV) / 2;
  const sig5 = sigmoidNorm(combinedBurst, 0.40, 4.5, true);

  // ═══════════════════════════════════════
  // SIGNAL 6: Sentence Length Autocorrelation
  // ═══════════════════════════════════════
  const slAuto = sentLens.length >= 4 ? autocorrelation(sentLens) : 0;
  const sig6 = sigmoidNorm(slAuto, 0.12, 5.0, false);

  // ═══════════════════════════════════════
  // SIGNAL 7: Paragraph Length Consistency
  // ═══════════════════════════════════════
  let sig7 = 0.5;
  if (paragraphs.length > 1) {
    const pLens = paragraphs.map(p => (p.match(/\b\w+\b/g) || []).length);
    const pCV = cv(pLens);
    sig7 = sigmoidNorm(pCV, 0.35, 5.0, true);
  }

  // ═══════════════════════════════════════
  // SIGNAL 8: Readability Grade Consistency
  // ═══════════════════════════════════════
  let sig8 = 0.5;
  if (paragraphs.length >= 3) {
    const grades = paragraphs.map(p => fkGrade(p));
    const validGrades = grades.filter(g => isFinite(g) && g > 0);
    if (validGrades.length >= 3) {
      const gradeCV = cv(validGrades);
      sig8 = sigmoidNorm(gradeCV, 0.22, 5.0, true);
    }
  }

  // ═══════════════════════════════════════
  // SIGNAL 9: Sentence Structure Repetition
  // ═══════════════════════════════════════
  const sentPats = sentLens.map(l => l < 8 ? 'S' : l <= 20 ? 'M' : 'L');
  let sig9 = 0.5;
  if (sentPats.length >= 4) {
    const patTri = {};
    let patTotal = 0;
    for (let i = 0; i < sentPats.length - 2; i++) {
      const p = sentPats[i] + sentPats[i + 1] + sentPats[i + 2];
      patTri[p] = (patTri[p] || 0) + 1;
      patTotal++;
    }
    const patDiv = patTotal > 0 ? Object.keys(patTri).length / patTotal : 1;
    sig9 = sigmoidNorm(patDiv, 0.6, 5.0, true);
  }

  // ═══════════════════════════════════════
  // SIGNAL 10: Transition Word Density
  // ═══════════════════════════════════════
  const singleTrans = [
    'however','furthermore','moreover','additionally','consequently',
    'nevertheless','therefore','thus','hence','accordingly','specifically',
    'importantly','significantly','essentially','particularly','notably',
    'indeed','certainly','undoubtedly','clearly','obviously','evidently',
    'interestingly','surprisingly','ultimately','fundamentally',
    'firstly','secondly','thirdly','finally','lastly','meanwhile'
  ];
  const multiTrans = [
    'in conclusion','to summarize','in summary','in addition',
    'on the other hand','in contrast','as a result','for example',
    'for instance','in particular','in fact','above all',
    'to begin with','in other words','that is to say',
    'as mentioned','it is worth noting','it is important to note',
    'it should be noted','on the contrary','by contrast',
    'as a consequence','in this regard','to that end'
  ];
  let transCount = words.filter(w => singleTrans.includes(w)).length;
  for (const phrase of multiTrans) {
    const re = new RegExp(phrase.replace(/\s+/g, '\\s+'), 'gi');
    const m = lowerClean.match(re);
    if (m) transCount += m.length;
  }
  const transDensity = transCount / Math.max(wc, 1);
  const sig10 = sigmoidNorm(transDensity, 0.015, 100.0, false);

  // ═══════════════════════════════════════
  // SIGNAL 11: Filler / Hedge Word Absence
  // ═══════════════════════════════════════
  const fillerWords = [
    'well','basically','actually','literally','honestly','like','kinda',
    'sorta','gonna','wanna','gotta','um','uh','hmm','oh','wow','yeah',
    'yep','nah','anyway','anyways','stuff','things','whatever','pretty',
    'really','very','quite','just','maybe','perhaps','probably','guess',
    'suppose','ok','okay','right','cool','sure','hey','huh','whoa',
    'damn','dude','totally','definitely','absolutely','seriously'
  ];
  const hedgePhrases = [
    'i think','i guess','i mean','you know','kind of','sort of',
    'i suppose','i feel like','to be honest','in my opinion',
    'if you ask me','not sure','i believe','i reckon'
  ];
  let fillerCount = words.filter(w => fillerWords.includes(w)).length;
  for (const phrase of hedgePhrases) {
    const re = new RegExp(phrase.replace(/\s+/g, '\\s+'), 'gi');
    const m = lowerClean.match(re);
    if (m) fillerCount += m.length;
  }
  const fillerDensity = fillerCount / Math.max(wc, 1);
  const sig11 = sigmoidNorm(fillerDensity, 0.02, 120.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 12: Punctuation Diversity
  // ═══════════════════════════════════════
  const punctPatterns = {
    comma: /,/g, semicolon: /;/g, colon: /:/g,
    dash: /[—–]|-{2}/g, parens: /[()]/g, exclamation: /!/g,
    question: /\?/g, ellipsis: /\.{3}|…/g, quotes: /["'"']/g,
  };
  let punctTypesUsed = 0;
  for (const re of Object.values(punctPatterns)) {
    if (clean.match(re)) punctTypesUsed++;
  }
  const punctDiv = punctTypesUsed / Object.keys(punctPatterns).length;
  const sig12 = sigmoidNorm(punctDiv, 0.4, 5.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 13: Question & Exclamation Ratio
  // ═══════════════════════════════════════
  const questionCount = (clean.match(/\?/g) || []).length;
  const exclamCount = (clean.match(/!/g) || []).length;
  const qeRatio = (questionCount + exclamCount) / Math.max(sentences.length, 1);
  const sig13 = sigmoidNorm(qeRatio, 0.08, 12.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 14: Sentence Type Variety
  // ═══════════════════════════════════════
  const imperativeStarters = new Set([
    'do','don\'t','please','let','try','make','keep','take','give','go',
    'come','look','see','get','put','use','find','tell','ask','stop',
    'start','run','read','write','think','consider','remember','note',
    'check','ensure','avoid','imagine','listen','watch','wait','be'
  ]);
  const sentTypes = sentences.map(s => {
    const t = s.trim();
    if (t.endsWith('?')) return 'Q';
    if (t.endsWith('!')) return 'E';
    const fw = t.split(/\s+/)[0].toLowerCase().replace(/[^a-z']/g, '');
    if (imperativeStarters.has(fw)) return 'I';
    return 'D';
  });
  const typeVariety = new Set(sentTypes).size / 4;
  const sig14 = sigmoidNorm(typeVariety, 0.35, 5.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 15: Passive Voice Estimation
  // ═══════════════════════════════════════
  const passiveRe = /\b(was|were|is|are|been|being|be|am)\s+\w+(ed|en|t)\b/gi;
  const passiveMatches = clean.match(passiveRe) || [];
  const passiveRatio = passiveMatches.length / Math.max(sentences.length, 1);
  const sig15 = sigmoidNorm(passiveRatio, 0.15, 7.0, false);

  // ═══════════════════════════════════════
  // SIGNAL 16: Contraction Usage
  // ═══════════════════════════════════════
  const contractionRe = /\b\w+'(t|re|ve|ll|d|m|s)\b/gi;
  // Exclude ambiguous words: well/ill/were/shell/hell/its have common non-contraction uses
  const contractionReNoApost = /\b(dont|cant|wont|isnt|wasnt|arent|werent|hasnt|havent|hadnt|shouldnt|wouldnt|couldnt|didnt|doesnt|neednt|aint|youre|theyre|hes|shes|im|youve|theyve|weve|ive|youll|theyll|itll|wouldve|shouldve|couldve|mustve|mightve|thats|theres|heres|whats|wheres|whos|lets|hed|shed|theyd|wed|youd|id)\b/gi;
  const contractionMatches = clean.match(contractionRe) || [];
  const contractionMatchesNoApost = clean.match(contractionReNoApost) || [];
  const totalContractions = contractionMatches.length + contractionMatchesNoApost.length;
  const contractionRate = totalContractions / Math.max(wc, 1);
  const sig16 = sigmoidNorm(contractionRate, 0.015, 80.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 17: First-Person Pronoun Density
  // ═══════════════════════════════════════
  const firstPerson = new Set(['i','me','my','mine','myself','we','us','our','ours','ourselves']);
  const fpCount = words.filter(w => firstPerson.has(w)).length;
  const fpDensity = fpCount / Math.max(wc, 1);
  const sig17 = sigmoidNorm(fpDensity, 0.015, 80.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 18: Lexical Sophistication
  // ═══════════════════════════════════════
  const rareCount = words.filter(w => !COMMON_WORDS.has(w)).length;
  const rareRatio = rareCount / Math.max(wc, 1);
  const distFromAI = Math.abs(rareRatio - 0.55);
  const sig18 = sigmoidNorm(distFromAI, 0.1, 10.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 19: Word Length Distribution
  // ═══════════════════════════════════════
  const wlHist = {};
  for (const w of words) {
    const len = Math.min(w.length, 15);
    wlHist[len] = (wlHist[len] || 0) + 1;
  }
  const wlCV = cv(Object.values(wlHist));
  const sig19 = sigmoidNorm(wlCV, 1.0, 2.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 20: Word Trigram Diversity
  // ═══════════════════════════════════════
  const wordTrigrams = [];
  for (let i = 0; i < wc - 2; i++) {
    wordTrigrams.push(words[i] + ' ' + words[i + 1] + ' ' + words[i + 2]);
  }
  const trigramDiv = wordTrigrams.length > 0
    ? new Set(wordTrigrams).size / wordTrigrams.length : 1;
  const sig20 = sigmoidNorm(trigramDiv, 0.95, 15.0, false);

  // ═══════════════════════════════════════
  // SIGNAL 21: AI Cliché Detection (HIGH IMPACT)
  // ═══════════════════════════════════════
  // Count AI-specific buzzwords
  let clicheWordHits = 0;
  for (const w of words) {
    if (AI_CLICHE_WORDS.has(w)) clicheWordHits++;
  }
  // Count AI-specific phrases
  let clichePhraseHits = 0;
  for (const phrase of AI_CLICHE_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi');
    const m = lowerClean.match(re);
    if (m) clichePhraseHits += m.length;
  }
  // Combined cliché density (phrases weighted 3x since they're more specific)
  const clicheScore = (clicheWordHits + clichePhraseHits * 3) / Math.max(wc, 1);
  const sig21 = sigmoidNorm(clicheScore, 0.015, 150.0, false);

  // ═══════════════════════════════════════
  // SIGNAL 22: Sentence Opener Analysis
  // ═══════════════════════════════════════
  const transitionStarters = new Set([
    'furthermore','moreover','additionally','consequently','nevertheless',
    'therefore','thus','hence','accordingly','specifically','importantly',
    'significantly','essentially','particularly','notably','indeed',
    'certainly','undoubtedly','clearly','obviously','evidently',
    'interestingly','surprisingly','ultimately','fundamentally',
    'firstly','secondly','thirdly','finally','lastly','meanwhile',
    'however','similarly','likewise','conversely','alternatively',
    'overall','subsequently',
  ]);
  const sentStarters = sentences.map(s => {
    const firstWord = s.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
    return firstWord;
  });
  // Count sentences that start with formal transition words (strong AI signal)
  const transStartCount = sentStarters.filter(w => transitionStarters.has(w)).length;
  const transStartRatio = transStartCount / Math.max(sentences.length, 1);
  // AI frequently starts sentences with transitions; human rarely does
  const transStartScore = sigmoidNorm(transStartRatio, 0.08, 20.0, false);

  // Also check starter word diversity
  const uniqueStarters = new Set(sentStarters).size;
  const starterDiversity = sentences.length > 1
    ? uniqueStarters / sentences.length : 1;
  const diversityScore = sigmoidNorm(starterDiversity, 0.7, 6.0, true);

  // Combined: transition starters are weighted more heavily
  const sig22final = transStartCount > 0
    ? transStartScore * 0.7 + diversityScore * 0.3
    : diversityScore;

  // ═══════════════════════════════════════
  // SIGNAL 23: Hapax Legomena Ratio
  // ═══════════════════════════════════════
  // Words that appear exactly once — human text has more hapax legomena
  // Only meaningful for longer texts (200+ words); short texts always have high hapax
  let sig23 = 0.5;
  if (wc >= 400) {
    const hapaxCount = Object.values(wordFreq).filter(c => c === 1).length;
    const hapaxRatio = hapaxCount / Math.max(uniqueWords.size, 1);
    sig23 = sigmoidNorm(hapaxRatio, 0.50, 8.0, true);
  }

  // ═══════════════════════════════════════
  // SIGNAL 24: Specificity / Concreteness
  // ═══════════════════════════════════════
  // Human text includes specific details: numbers, proper nouns, direct quotes
  // AI text tends to be vague and general
  let specificityPoints = 0;

  // Any digit sequences (dates, amounts, measurements, statistics)
  const allDigits = clean.match(/\d+([.,]\d+)*/g) || [];
  specificityPoints += Math.min(allDigits.length * 1.5, 15);

  // Mid-sentence proper nouns (capitalized words not at sentence start)
  let properNounCount = 0;
  for (const sent of sentences) {
    const ws = sent.trim().split(/\s+/);
    for (let j = 1; j < ws.length; j++) {
      if (/^[A-Z][a-z]{2,}/.test(ws[j])) properNounCount++;
    }
  }
  specificityPoints += Math.min(properNounCount * 1.5, 12);

  // Direct quotes (strong human signal)
  const directQuotes = clean.match(/[""\u201c][^""\u201d]{5,}[""\u201d]/g) || [];
  specificityPoints += directQuotes.length * 4;

  // Parenthetical data
  const parenData = clean.match(/\([^)]+\)/g) || [];
  specificityPoints += parenData.length * 2;

  // Written numbers with units ("six hours", "three years")
  const writtenNums = lowerClean.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand)\s+(hours?|minutes?|seconds?|days?|weeks?|months?|years?|miles?|feet|inches?|meters?|percent|people|students?|participants?|times?)\b/gi) || [];
  specificityPoints += writtenNums.length * 2;

  const specificityDensity = specificityPoints / Math.max(wc, 1);
  // HIGH specificity → human; LOW specificity → possibly AI
  const sig24 = sigmoidNorm(specificityDensity, 0.04, 30.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 25: Bigram Perplexity Estimation
  // ═══════════════════════════════════════
  // Uses bigram conditional probability for better perplexity estimation
  // AI text: low perplexity (statistically smooth, predictable word sequences)
  // Human text: higher perplexity (unexpected word choices, creative phrasing)
  let sig25 = 0.5;
  if (wc >= 50) {
    // Bigram-based conditional probability
    let totalLogProb = 0;
    let bigramCount = 0;
    for (let i = 1; i < wc; i++) {
      const bg = words[i - 1] + ' ' + words[i];
      const bgCount = bigramFreq[bg] || 0;
      const prevCount = wordFreq[words[i - 1]] || 1;
      // Smoothed conditional probability: P(w_i | w_{i-1})
      const condProb = (bgCount + 0.01) / (prevCount + 0.01 * uniqueWords.size);
      totalLogProb += -Math.log2(Math.max(condProb, 1e-10));
      bigramCount++;
    }
    const avgBigramPerplexity = bigramCount > 0 ? totalLogProb / bigramCount : 10;
    // Lower perplexity → more predictable → AI
    // Higher perplexity → more surprising → human
    sig25 = sigmoidNorm(avgBigramPerplexity, 8.0, 0.4, true);
  }

  // ═══════════════════════════════════════
  // SIGNAL 26: Per-Sentence Entropy Variance
  // ═══════════════════════════════════════
  // AI produces sentences with uniform complexity; humans vary
  let sig26 = 0.5;
  if (sentences.length >= 5) {
    const sentEntropies = sentences.map(s => {
      const sw = s.toLowerCase().match(/\b[a-z']+\b/g) || [];
      if (sw.length < 3) return 0;
      const sf = {};
      for (const w of sw) sf[w] = (sf[w] || 0) + 1;
      return shannonEntropy(sf, sw.length);
    }).filter(e => e > 0);
    if (sentEntropies.length >= 4) {
      const sentEntropyCV = cv(sentEntropies);
      sig26 = sigmoidNorm(sentEntropyCV, 0.20, 6.0, true);
    }
  }

  // ═══════════════════════════════════════
  // SIGNAL 27: Adverb Density
  // ═══════════════════════════════════════
  // AI overuses formal adverbs like "significantly", "effectively", etc.
  const adverbCount = words.filter(w => AI_ADVERBS.has(w)).length;
  const adverbDensity = adverbCount / Math.max(wc, 1);
  const sig27 = sigmoidNorm(adverbDensity, 0.008, 180.0, false);

  // ═══════════════════════════════════════
  // SIGNAL 28: List / Enumeration Pattern
  // ═══════════════════════════════════════
  // AI loves structured lists: "First... Second... Third..." or "1. ... 2. ... 3. ..."
  const listMarkers = lowerClean.match(/\b(firstly|secondly|thirdly|fourthly|fifthly|first|second|third|fourth|fifth)\b[,:]?\s/gi) || [];
  const numberedItems = clean.match(/^\s*\d+[\.\)]\s/gm) || [];
  const bulletItems = clean.match(/^\s*[-•*]\s/gm) || [];
  const listScore = (listMarkers.length + numberedItems.length + bulletItems.length) / Math.max(sentences.length, 1);
  const sig28 = sigmoidNorm(listScore, 0.05, 15.0, false);

  // ═══════════════════════════════════════
  // SIGNAL 29: Emotional Flatness
  // ═══════════════════════════════════════
  // AI text has flat emotional tone; humans show emotional peaks/valleys
  const emotionPositive = new Set([
    'love','happy','great','wonderful','amazing','excellent','fantastic',
    'beautiful','incredible','awesome','brilliant','delighted','thrilled',
    'excited','grateful','blessed','joyful','glad','proud','pleased'
  ]);
  const emotionNegative = new Set([
    'hate','terrible','horrible','awful','disgusting','angry','furious',
    'sad','miserable','depressed','frustrated','annoyed','disappointed',
    'worried','scared','afraid','devastated','heartbroken','painful','ugly'
  ]);
  let sig29 = 0.5;
  if (sentences.length >= 4) {
    const sentEmotions = sentences.map(s => {
      const sw = s.toLowerCase().match(/\b[a-z']+\b/g) || [];
      let score = 0;
      for (const w of sw) {
        if (emotionPositive.has(w)) score += 1;
        if (emotionNegative.has(w)) score -= 1;
      }
      return score;
    });
    const emotionCV = cv(sentEmotions.map(Math.abs));
    const emotionRange = Math.max(...sentEmotions) - Math.min(...sentEmotions);
    // Flat emotion (low range, low CV) → AI; varied emotion → human
    const flatnessScore = emotionRange < 2 && emotionCV < 0.5 ? 0.65 :
                          emotionRange < 3 ? 0.5 : 0.3;
    sig29 = flatnessScore;
  }

  // ═══════════════════════════════════════
  // SIGNAL 30: Vocabulary Sophistication Variance
  // ═══════════════════════════════════════
  // AI maintains constant vocabulary level; humans vary per paragraph
  let sig30 = 0.5;
  if (paragraphs.length >= 3) {
    const paraRareRatios = paragraphs.map(p => {
      const pw = p.toLowerCase().match(/\b[a-z']+\b/g) || [];
      if (pw.length < 5) return null;
      const rare = pw.filter(w => !COMMON_WORDS.has(w)).length;
      return rare / pw.length;
    }).filter(r => r !== null);
    if (paraRareRatios.length >= 3) {
      const rareCV = cv(paraRareRatios);
      sig30 = sigmoidNorm(rareCV, 0.15, 7.0, true);
    }
  }

  // ═══════════════════════════════════════
  // SIGNAL 31: Repetitive Discourse Structure
  // ═══════════════════════════════════════
  // AI often follows pattern: "X is important. Here's why. Y is important. Here's why."
  let sig31 = 0.5;
  if (sentences.length >= 6) {
    // Check for repeated sentence templates
    const templates = sentences.map(s => {
      const w = s.trim().split(/\s+/);
      if (w.length < 3) return '';
      // Template: first 2 words + last word structure
      return w.slice(0, 2).map(x => x.toLowerCase().replace(/[^a-z]/g, '')).join(' ') +
             '...' + w[w.length - 1].replace(/[^a-z.!?]/gi, '').slice(-1);
    }).filter(t => t.length > 0);
    const templateFreq = {};
    for (const t of templates) templateFreq[t] = (templateFreq[t] || 0) + 1;
    const repeatedTemplates = Object.values(templateFreq).filter(c => c >= 2).length;
    const templateRepeatRatio = repeatedTemplates / Math.max(templates.length, 1);
    sig31 = sigmoidNorm(templateRepeatRatio, 0.08, 15.0, false);
  }

  // ═══════════════════════════════════════
  // SIGNAL 32: Conjunction Pattern Analysis
  // ═══════════════════════════════════════
  // AI has distinctive conjunction patterns — overuses coordinating conjunctions at sentence start
  const conjunctionStarters = ['and','but','or','so','yet','for','nor'];
  const conjStartCount = sentences.filter(s => {
    const fw = s.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
    return conjunctionStarters.includes(fw);
  }).length;
  const conjStartRatio = conjStartCount / Math.max(sentences.length, 1);
  // Low conjunction starts → formal AI; some conjunction starts → natural human
  const sig32 = sigmoidNorm(conjStartRatio, 0.04, 20.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 33: Token Probability Smoothness
  // ═══════════════════════════════════════
  // AI selects high-probability tokens → smooth probability curves
  // Human writing has more unexpected word choices → jagged probability
  let sig33 = 0.5;
  if (wc >= 80) {
    // Compute per-word "surprise" and measure its variance
    const wordSurprises = [];
    const totalWords = Object.values(wordFreq).reduce((a, b) => a + b, 0);
    for (const w of words) {
      const p = wordFreq[w] / totalWords;
      wordSurprises.push(-Math.log2(p));
    }
    // Measure how smooth the surprise curve is using sliding window
    const windowSize = 10;
    const windowAvgs = [];
    for (let i = 0; i <= wordSurprises.length - windowSize; i++) {
      const windowSlice = wordSurprises.slice(i, i + windowSize);
      windowAvgs.push(windowSlice.reduce((a, b) => a + b, 0) / windowSize);
    }
    if (windowAvgs.length >= 5) {
      const smoothnessCV = cv(windowAvgs);
      // Low CV → very smooth probability → AI
      // High CV → jagged probability → human
      sig33 = sigmoidNorm(smoothnessCV, 0.18, 7.0, true);
    }
  }

  // ═══════════════════════════════════════
  // SIGNAL 34: Function Word Distribution (Stylometry)
  // ═══════════════════════════════════════
  // Function words (the, a, is, are, to, etc.) form an author's "fingerprint"
  // AI has a distinctive function word profile different from natural writing
  const functionWords = {
    articles: ['the','a','an'],
    prepositions: ['of','in','to','for','with','on','at','from','by','about','as','into','through','during','before','after','above','below','between','under'],
    pronouns: ['i','me','my','we','us','our','you','your','he','him','his','she','her','they','them','their','it','its'],
    auxiliaries: ['is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','shall','should','may','might','can','could','must'],
    conjunctions: ['and','but','or','nor','for','yet','so','because','although','while','if','when','that','which','who'],
    determiners: ['this','that','these','those','each','every','some','any','no','all','both','few','many','much','several'],
  };
  let sig34 = 0.5;
  if (wc >= 80) {
    const fwCounts = {};
    let totalFW = 0;
    for (const [category, wordList] of Object.entries(functionWords)) {
      const count = words.filter(w => wordList.includes(w)).length;
      fwCounts[category] = count / wc;
      totalFW += count;
    }
    const fwDensity = totalFW / wc;
    // AI tends to use slightly fewer function words and more content words
    // AI function word density typically 0.42-0.50; human 0.48-0.58
    const fwDeviation = Math.abs(fwDensity - 0.46);
    // Also check the balance between categories
    const catRatios = Object.values(fwCounts);
    const catCV = cv(catRatios);

    let fwScore = 0.5;
    // Function word density in AI sweet spot
    if (fwDensity >= 0.42 && fwDensity <= 0.50) fwScore += 0.1;
    if (fwDensity > 0.52) fwScore -= 0.08; // More function words → more human-like
    // Very balanced category ratios → AI
    if (catCV < 0.6) fwScore += 0.08;
    if (catCV > 0.9) fwScore -= 0.06;

    sig34 = clamp(fwScore, 0.1, 0.9);
  }

  // ═══════════════════════════════════════
  // SIGNAL 35: Grammar Perfection Score
  // ═══════════════════════════════════════
  // AI text has suspiciously perfect grammar — no typos, no fragments, no run-ons
  // Human text has minor imperfections: fragments, missing commas, informal spelling
  const grammarImperfections = [];

  // Sentence fragments (very short "sentences")
  const fragments = sentences.filter(s => {
    const w = s.trim().match(/\b\w+\b/g) || [];
    return w.length >= 1 && w.length <= 3;
  }).length;
  grammarImperfections.push(fragments);

  // Repeated words ("the the", "is is")
  let repeatedWords = 0;
  for (let i = 1; i < wc; i++) {
    if (words[i] === words[i - 1] && !['very','had','that'].includes(words[i])) repeatedWords++;
  }
  grammarImperfections.push(repeatedWords);

  // Informal spellings and internet slang
  const informalSpellings = (lowerClean.match(/\b(gonna|wanna|gotta|kinda|sorta|dunno|lemme|gimme|ya|yall|y'all|nope|yep|yup|haha|lol|omg|btw|imo|tbh|idk|smh|ngl|fr|bruh|bro|sis|fam|lowkey|highkey|sus|vibe|vibes|slay|lit|fire|cap|bet)\b/g) || []).length;
  grammarImperfections.push(informalSpellings);

  // Sentences starting with lowercase (informal)
  const lowercaseStarts = sentences.filter(s => {
    const first = s.trim()[0];
    return first && first === first.toLowerCase() && /[a-z]/.test(first);
  }).length;
  grammarImperfections.push(lowercaseStarts);

  // Ellipsis and dashes (informal punctuation)
  const informalPunct = (clean.match(/\.{2,}|—|--|…/g) || []).length;
  grammarImperfections.push(informalPunct);

  const totalImperfections = grammarImperfections.reduce((a, b) => a + b, 0);
  const imperfectionRate = totalImperfections / Math.max(sentences.length, 1);
  // No imperfections → suspiciously perfect → AI
  // Some imperfections → natural human writing
  const sig35 = sigmoidNorm(imperfectionRate, 0.12, 8.0, true);

  // ═══════════════════════════════════════
  // SIGNAL 36: Tonal Neutrality / Balance
  // ═══════════════════════════════════════
  // AI text sounds balanced and neutral — avoids strong opinions
  // Human text often has clear bias, strong opinions, personal takes
  const strongOpinion = [
    'terrible','amazing','horrible','incredible','disgusting','wonderful',
    'stupid','brilliant','garbage','genius','insane','ridiculous',
    'absolutely','definitely','obviously','clearly','unfortunately',
    'honestly','frankly','basically','literally','seriously',
    'best','worst','perfect','awful','rubbish','spectacular'
  ];
  const hedgingWords = [
    'however','although','nevertheless','on the other hand','while',
    'that said','admittedly','arguably','granted','regardless',
    'despite','notwithstanding','in contrast','conversely','yet'
  ];
  const opinionCount = words.filter(w => strongOpinion.includes(w)).length;
  let hedgeCount = 0;
  for (const h of hedgingWords) {
    const re = new RegExp('\\b' + h.replace(/\s+/g, '\\s+') + '\\b', 'gi');
    const m = lowerClean.match(re);
    if (m) hedgeCount += m.length;
  }

  const opinionDensity = opinionCount / Math.max(wc, 1);
  const hedgeDensity = hedgeCount / Math.max(wc, 1);
  // High hedging + low opinion → balanced/neutral → AI
  // Low hedging + high opinion → opinionated → human
  let neutralityScore = 0.5;
  if (opinionDensity < 0.005 && hedgeDensity > 0.005) neutralityScore = 0.68; // Very neutral + balanced → AI
  else if (opinionDensity < 0.005) neutralityScore = 0.58; // Just neutral
  else if (opinionDensity > 0.015) neutralityScore = 0.32; // Opinionated → human
  else if (opinionDensity > 0.01) neutralityScore = 0.40;
  const sig36 = neutralityScore;

  // ═══════════════════════════════════════
  // SIGNAL 37: N-gram Repetition Density
  // ═══════════════════════════════════════
  // AI sometimes reuses exact 4-gram and 5-gram phrases more than natural
  let sig37 = 0.5;
  if (wc >= 100) {
    // Count repeated 4-grams
    const fourGrams = {};
    let fourTotal = 0;
    for (let i = 0; i < wc - 3; i++) {
      const ng = words.slice(i, i + 4).join(' ');
      fourGrams[ng] = (fourGrams[ng] || 0) + 1;
      fourTotal++;
    }
    const repeated4 = Object.values(fourGrams).filter(c => c >= 2).length;

    // Count repeated 5-grams
    const fiveGrams = {};
    for (let i = 0; i < wc - 4; i++) {
      const ng = words.slice(i, i + 5).join(' ');
      fiveGrams[ng] = (fiveGrams[ng] || 0) + 1;
    }
    const repeated5 = Object.values(fiveGrams).filter(c => c >= 2).length;

    const repeatDensity = (repeated4 * 1 + repeated5 * 2) / Math.max(fourTotal, 1);
    // Some repetition is natural; excessive repetition can be either AI or human
    // AI tends to have moderate repetition from reusing structures
    sig37 = sigmoidNorm(repeatDensity, 0.02, 50.0, false);
  }

  // ═══════════════════════════════════════
  // WEIGHTED COMBINATION — 37 signals
  // ═══════════════════════════════════════

  // Weights emphasize empirically discriminative signals
  // 37 signals — weights sum to 1.0
  const signals = [
    { s: sig1,  w: 0.012, name: 'Character Entropy',     icon: 'hash',
      hi: 'Low character entropy — predictable patterns typical of AI',
      lo: 'High character entropy — natural unpredictability' },
    { s: sig2,  w: 0.012, name: 'Word Distribution',      icon: 'bar-chart',
      hi: 'Unusually uniform word distribution — suggests generation',
      lo: 'Natural word frequency distribution' },
    { s: sig3,  w: 0.012, name: "Zipf's Law Fit",         icon: 'trending-down',
      hi: "Word frequencies deviate from Zipf's law — AI pattern",
      lo: "Word frequencies follow natural Zipf's law distribution" },
    { s: sig4,  w: 0.012, name: 'Word Predictability',    icon: 'cpu',
      hi: 'Low conditional entropy — highly predictable word sequences',
      lo: 'Natural word sequence unpredictability' },
    { s: sig5,  w: 0.04, name: 'Sentence Burstiness',    icon: 'ruler',
      hi: 'Uniform sentence lengths — typical of AI writing',
      lo: 'Good variation in sentence lengths — natural writing' },
    { s: sig6,  w: 0.012, name: 'Sentence Autocorrelation', icon: 'repeat',
      hi: 'Adjacent sentences have similar lengths — templated pattern',
      lo: 'Natural variation between adjacent sentences' },
    { s: sig7,  w: 0.015, name: 'Paragraph Consistency',  icon: 'align-left',
      hi: 'Paragraphs are uniform in length — AI pattern',
      lo: 'Natural paragraph length variation' },
    { s: sig8,  w: 0.025, name: 'Readability Consistency', icon: 'book',
      hi: 'Uniform readability across paragraphs — AI pattern',
      lo: 'Natural readability variation across paragraphs' },
    { s: sig9,  w: 0.012, name: 'Structure Repetition',   icon: 'sliders',
      hi: 'Repetitive sentence structure patterns detected',
      lo: 'Diverse sentence structure patterns' },
    { s: sig10, w: 0.065, name: 'Transition Word Density', icon: 'link',
      hi: 'High transition word density — very common in AI text',
      lo: 'Natural transition word usage' },
    { s: sig11, w: 0.065, name: 'Filler Word Absence',    icon: 'message-circle',
      hi: 'No filler/hedge words — AI text avoids informal markers',
      lo: 'Natural use of filler and hedge words' },
    { s: sig12, w: 0.015, name: 'Punctuation Diversity',  icon: 'type',
      hi: 'Limited punctuation variety — AI typically uses few types',
      lo: 'Rich punctuation variety — natural writing style' },
    { s: sig13, w: 0.015, name: 'Questions & Exclamations', icon: 'edit',
      hi: 'No questions or exclamations — AI defaults to declarative',
      lo: 'Natural mix of sentence types' },
    { s: sig14, w: 0.015, name: 'Sentence Type Variety',  icon: 'file-text',
      hi: 'Only declarative sentences — AI pattern',
      lo: 'Mix of declarative, interrogative, imperative sentences' },
    { s: sig15, w: 0.025, name: 'Passive Voice Usage',    icon: 'settings',
      hi: 'Elevated passive voice usage — formal AI writing style',
      lo: 'Mostly active voice — natural writing style' },
    { s: sig16, w: 0.04, name: 'Contraction Usage',      icon: 'file',
      hi: 'No contractions used — AI formal writing pattern',
      lo: 'Natural use of contractions' },
    { s: sig17, w: 0.04, name: 'First-Person Pronouns',  icon: 'user',
      hi: 'No first-person pronouns — impersonal AI style',
      lo: 'Personal voice with first-person pronouns' },
    { s: sig18, w: 0.012, name: 'Lexical Sophistication', icon: 'book',
      hi: 'Vocabulary profile matches AI generation patterns',
      lo: 'Vocabulary profile suggests human authorship' },
    { s: sig19, w: 0.008, name: 'Word Length Distribution', icon: 'bar-chart',
      hi: 'Smooth word length distribution — algorithmically generated',
      lo: 'Natural word length distribution' },
    { s: sig20, w: 0.008, name: 'Phrase Uniqueness',      icon: 'repeat',
      hi: 'Extremely high phrase uniqueness — AI varied phrasing',
      lo: 'Natural phrase repetition patterns' },
    { s: sig21, w: 0.11, name: 'AI Cliché Detection',    icon: 'alert-triangle',
      hi: 'AI-typical buzzwords and phrases detected (delve, leverage, tapestry, etc.)',
      lo: 'No distinctive AI language patterns found' },
    { s: sig22final, w: 0.04, name: 'Sentence Opener Patterns', icon: 'list',
      hi: 'Transition-word sentence starters — formulaic AI pattern',
      lo: 'Natural sentence openings' },
    { s: sig23, w: 0.012, name: 'Vocabulary Uniqueness',  icon: 'feather',
      hi: 'Low hapax ratio — AI reuses words more uniformly',
      lo: 'High ratio of unique words — natural vocabulary' },
    { s: sig24, w: 0.055, name: 'Content Specificity',   icon: 'hash',
      hi: 'Vague, general statements without specific details — AI pattern',
      lo: 'Specific details, numbers, names, quotes — human authorship' },
    { s: sig25, w: 0.04, name: 'Bigram Perplexity',     icon: 'cpu',
      hi: 'Low perplexity — statistically smooth, AI-like word sequences',
      lo: 'High perplexity — unexpected word choices, human-like' },
    { s: sig26, w: 0.025, name: 'Sentence Complexity Variance', icon: 'bar-chart',
      hi: 'Uniform sentence complexity — AI maintains constant level',
      lo: 'Varying sentence complexity — natural writing pattern' },
    { s: sig27, w: 0.035, name: 'Formal Adverb Density',  icon: 'type',
      hi: 'Heavy use of formal adverbs (significantly, importantly, etc.) — AI pattern',
      lo: 'Natural adverb usage' },
    { s: sig28, w: 0.02, name: 'List/Enumeration Pattern', icon: 'list',
      hi: 'Structured enumeration detected — AI frequently uses numbered/ordered lists',
      lo: 'No excessive list patterns detected' },
    { s: sig29, w: 0.018, name: 'Emotional Flatness',     icon: 'message-circle',
      hi: 'Flat emotional tone throughout — AI lacks emotional variation',
      lo: 'Natural emotional variation present' },
    { s: sig30, w: 0.018, name: 'Vocabulary Level Variance', icon: 'book',
      hi: 'Constant vocabulary sophistication across paragraphs — AI pattern',
      lo: 'Natural variation in vocabulary sophistication' },
    { s: sig31, w: 0.018, name: 'Discourse Repetition',   icon: 'repeat',
      hi: 'Repetitive sentence templates detected — AI structural pattern',
      lo: 'Diverse sentence templates — natural writing' },
    { s: sig32, w: 0.012, name: 'Conjunction Patterns',   icon: 'link',
      hi: 'No informal conjunction starters — formal AI writing style',
      lo: 'Natural use of conjunctions to start sentences' },
    { s: sig33, w: 0.03, name: 'Probability Smoothness',  icon: 'trending-down',
      hi: 'Smooth token probability curve — AI selects high-probability tokens',
      lo: 'Jagged probability curve — human makes unexpected word choices' },
    { s: sig34, w: 0.02, name: 'Function Word Profile',   icon: 'feather',
      hi: 'Function word distribution matches AI generation patterns',
      lo: 'Function word distribution matches natural writing' },
    { s: sig35, w: 0.047, name: 'Grammar Perfection',      icon: 'edit',
      hi: 'Suspiciously perfect grammar — no typos, fragments, or informal usage',
      lo: 'Natural imperfections present — human writing characteristics' },
    { s: sig36, w: 0.025, name: 'Tonal Neutrality',       icon: 'sliders',
      hi: 'Balanced, neutral tone — AI avoids strong opinions',
      lo: 'Clear opinions and emotional expression — human voice' },
    { s: sig37, w: 0.015, name: 'N-gram Repetition',      icon: 'hash',
      hi: 'Repeated 4/5-gram phrases detected — AI structural repetition',
      lo: 'Low phrase repetition — diverse expression' },
  ];
  // Weights sum = 1.0

  // ─── Primary weighted sum ───
  let rawProb = 0;
  for (const sig of signals) rawProb += sig.s * sig.w;

  // ─── Enhanced Ensemble Correlation Boost ───
  // Four independent signal groups for cross-validation
  const styleSignals = [sig10, sig11, sig16, sig17, sig22final, sig27, sig36]; // writing style
  const vocabSignals = [sig21, sig18, sig24, sig25, sig30, sig34];            // vocabulary & content
  const structSignals = [sig5, sig8, sig26, sig28, sig31, sig33];             // structure & probability
  const surfaceSignals = [sig12, sig13, sig15, sig35, sig29, sig32];          // surface features

  const styleAI = styleSignals.filter(s => s > 0.6).length;
  const vocabAI = vocabSignals.filter(s => s > 0.6).length;
  const structAI = structSignals.filter(s => s > 0.6).length;
  const surfaceAI = surfaceSignals.filter(s => s > 0.6).length;
  const styleHuman = styleSignals.filter(s => s < 0.4).length;
  const vocabHuman = vocabSignals.filter(s => s < 0.4).length;
  const structHuman = structSignals.filter(s => s < 0.4).length;
  const surfaceHuman = surfaceSignals.filter(s => s < 0.4).length;

  // Cross-group agreement boost: if 2+ groups strongly agree, boost confidence
  const aiGroups = [styleAI >= 4, vocabAI >= 3, structAI >= 3, surfaceAI >= 3].filter(Boolean).length;
  const humanGroups = [styleHuman >= 4, vocabHuman >= 3, structHuman >= 3, surfaceHuman >= 3].filter(Boolean).length;

  if (aiGroups >= 2) {
    rawProb += 0.035 * aiGroups;
  } else if (humanGroups >= 2) {
    rawProb -= 0.035 * humanGroups;
  }

  // Strong single-signal overrides
  if (sig21 > 0.85) rawProb += 0.03; // Very strong AI clichés
  if (sig21 < 0.15) rawProb -= 0.02; // Zero AI clichés
  if (sig35 < 0.2 && sig11 < 0.2) rawProb -= 0.03; // Imperfect grammar + fillers → very human
  if (sig35 > 0.8 && sig11 > 0.8) rawProb += 0.02; // Perfect grammar + no fillers → very AI

  // ─── Short text penalty (mild) ───
  if (wc < 50) {
    rawProb = rawProb * 0.65 + 0.5 * 0.35;
  } else if (wc < 100) {
    rawProb = rawProb * 0.9 + 0.5 * 0.1;
  }
  // No penalty for 100+ words

  rawProb = clamp(rawProb);

  const aiPercent = Math.round(rawProb * 100);
  const v = verdictFromPercent(aiPercent);
  const conf = computeConfidence(wc, rawProb);

  const details = signals.map(sig => ({
    name: sig.name,
    score: Math.round(sig.s * 100),
    description: sig.s > 0.5 ? sig.hi : sig.lo,
    icon: sig.icon,
  }));

  return {
    type: 'text',
    aiProbability: aiPercent,
    humanProbability: 100 - aiPercent,
    ...v,
    confidence: conf,
    details,
    stats: {
      wordCount: wc,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      uniqueWords: uniqueWords.size,
      avgSentenceLength: Math.round(avgSL * 10) / 10,
      avgWordLength: Math.round(
        (words.reduce((s, w) => s + w.length, 0) / wc) * 10
      ) / 10,
      vocabularyRichness: `${((uniqueWords.size / wc) * 100).toFixed(1)}%`,
    }
  };
}

// ═══════════════════════════════════════════════════════════
//  IMAGE ANALYSIS (Enhanced with Pixel-Level Analysis)
// ═══════════════════════════════════════════════════════════

async function analyzeImage(filePath, fileInfo) {
  const data = readFileHead(filePath);
  const dataStr = data.toString('latin1');

  // ─── EXIF check ───
  const hasExif = data.includes(Buffer.from([0x45, 0x78, 0x69, 0x66]));

  // ─── Parse dimensions ───
  let imgW = 0, imgH = 0;
  if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50) {
    imgW = data.readUInt32BE(16);
    imgH = data.readUInt32BE(20);
  }
  if (data.length > 10 && data[0] === 0xFF && data[1] === 0xD8) {
    let off = 2;
    while (off < data.length - 10) {
      if (data[off] === 0xFF) {
        const marker = data[off + 1];
        if (marker === 0xC0 || marker === 0xC2) {
          imgH = data.readUInt16BE(off + 5);
          imgW = data.readUInt16BE(off + 7);
          break;
        }
        if (marker === 0xD9 || marker === 0xDA) break;
        const segLen = data.readUInt16BE(off + 2);
        off += 2 + segLen;
      } else {
        off++;
      }
    }
  }

  // AI-typical resolutions (expanded)
  const aiResolutions = new Set([
    '256x256','512x512','768x768','1024x1024','2048x2048',
    '1024x1792','1792x1024','1344x768','768x1344',
    '1152x896','896x1152','1216x832','832x1216',
    '640x640','960x960','1536x1536',
    '1024x576','576x1024','1280x720','720x1280',
    '1536x640','640x1536','1344x896','896x1344',
    '1152x832','832x1152','1024x768','768x1024',
  ]);
  const isAIRes = (imgW > 0 && imgH > 0) && aiResolutions.has(`${imgW}x${imgH}`);

  // ─── AI tool signatures (expanded) ───
  const sigs = {
    'Stable Diffusion': /stable.?diffusion|sd.?model|civitai|a1111|automatic1111|sdxl|sd.?xl|comfyui|dreamstudio/i.test(dataStr),
    'Midjourney': /midjourney|mj.?v[4-6]/i.test(dataStr),
    'DALL-E': /dall.?e|openai/i.test(dataStr),
    'Adobe Firefly': /firefly|adobe.?ai/i.test(dataStr),
    'Flux': /flux|black.?forest.?labs/i.test(dataStr),
    'Leonardo AI': /leonardo\.ai|leonardo/i.test(dataStr),
    'Ideogram': /ideogram/i.test(dataStr),
    'Playground AI': /playground\.ai/i.test(dataStr),
    'Stability AI': /stability\.ai|stability/i.test(dataStr),
    'Bing Image Creator': /bing.*image|image.*creator/i.test(dataStr),
    'Invoke AI': /invokeai|invoke/i.test(dataStr),
    'Fooocus': /fooocus/i.test(dataStr),
    'Craiyon': /craiyon|dall-e mini/i.test(dataStr),
    'Kandinsky': /kandinsky/i.test(dataStr),
    'Tensor.Art': /tensor\.art/i.test(dataStr),
    'NightCafe': /nightcafe/i.test(dataStr),
    'Artbreeder': /artbreeder/i.test(dataStr),
    'Wombo Dream': /wombo|dream/i.test(dataStr),
    'Jasper Art': /jasper.?art/i.test(dataStr),
    'Canva AI': /canva.*ai|ai.*canva/i.test(dataStr),
    'Glide': /glide/i.test(dataStr),
    'Imagen': /imagen/i.test(dataStr),
  };
  const hasAISig = Object.values(sigs).some(v => v);
  const aiToolName = Object.entries(sigs).find(([, v]) => v)?.[0] || null;

  // Camera metadata
  const camPat = /canon|nikon|sony|fujifilm|olympus|panasonic|leica|hasselblad|iphone|samsung|pixel|huawei|xiaomi|gopro|oneplus|motorola|lg\s|ricoh|pentax|sigma/i;
  const hasCamera = camPat.test(dataStr);

  // Editing software
  const editPat = /photoshop|lightroom|gimp|affinity|capture one|darktable|rawtherapee|snapseed|pixelmator|luminar|on1|dxo/i;
  const hasEditor = editPat.test(dataStr);

  // PNG generation parameters
  const hasPNGParams = data.includes(Buffer.from('tEXt')) &&
    (dataStr.includes('parameters') || dataStr.includes('prompt') || dataStr.includes('negative_prompt')
     || dataStr.includes('steps') || dataStr.includes('sampler') || dataStr.includes('cfg_scale'));

  // C2PA / Content Credentials
  const hasC2PA = /c2pa|content.?credentials|content.?authenticity/i.test(dataStr) ||
    data.includes(Buffer.from('jumb'));

  // ─── PIXEL-LEVEL ANALYSIS (using sharp) ───
  let pixelAnalysis = {
    elaScore: 0.5,
    elaDesc: 'Pixel analysis unavailable',
    colorUniformity: 0.5,
    colorDesc: 'Color analysis unavailable',
    noiseUniformity: 0.5,
    noiseDesc: 'Noise analysis unavailable',
    saturationProfile: 0.5,
    saturationDesc: 'Saturation analysis unavailable',
    edgeDensity: 0.5,
    edgeDesc: 'Edge analysis unavailable',
    available: false,
  };

  if (sharp) {
    try {
      const img = sharp(filePath);
      const meta = await img.metadata();
      if (meta.width && meta.height) {
        imgW = imgW || meta.width;
        imgH = imgH || meta.height;

        // === Error Level Analysis (ELA) ===
        // Resave at quality 95, compare with original
        try {
          const origBuf = await sharp(filePath).resize(512, 512, { fit: 'inside' }).raw().toBuffer();
          const resavedBuf = await sharp(filePath)
            .resize(512, 512, { fit: 'inside' })
            .jpeg({ quality: 95 })
            .toBuffer();
          const resavedRaw = await sharp(resavedBuf).raw().toBuffer();

          const minLen = Math.min(origBuf.length, resavedRaw.length);
          let totalDiff = 0;
          let maxDiff = 0;
          const regionDiffs = [];
          const regionSize = Math.floor(minLen / 16);
          for (let r = 0; r < 16; r++) {
            let rDiff = 0;
            const start = r * regionSize;
            const end = Math.min(start + regionSize, minLen);
            for (let i = start; i < end; i++) {
              const d = Math.abs(origBuf[i] - resavedRaw[i]);
              totalDiff += d;
              if (d > maxDiff) maxDiff = d;
              rDiff += d;
            }
            regionDiffs.push(rDiff / (end - start));
          }
          const avgDiff = totalDiff / minLen;
          const elaCV = cv(regionDiffs);

          // AI images: more uniform ELA (low CV), real photos: varied ELA (high CV)
          // AI images also tend to have lower average error (cleaner compression)
          let elaAI = 0.5;
          if (elaCV < 0.15) elaAI = 0.72; // very uniform → likely AI
          else if (elaCV < 0.25) elaAI = 0.58;
          else if (elaCV > 0.5) elaAI = 0.3; // highly varied → likely real
          else if (elaCV > 0.35) elaAI = 0.38;

          // Low average diff also suggests AI (too clean)
          if (avgDiff < 2.0) elaAI += 0.08;
          else if (avgDiff > 8.0) elaAI -= 0.08;

          pixelAnalysis.elaScore = clamp(elaAI, 0.1, 0.9);
          pixelAnalysis.elaDesc = `ELA uniformity: ${elaCV.toFixed(3)} (${elaCV < 0.2 ? 'uniform — AI pattern' : elaCV > 0.35 ? 'varied — natural photo pattern' : 'moderate'}), avg error: ${avgDiff.toFixed(1)}`;
        } catch (_) {}

        // === Color Channel Statistics ===
        try {
          const stats = await sharp(filePath).stats();
          const channels = stats.channels;
          if (channels.length >= 3) {
            const means = channels.map(c => c.mean);
            const stds = channels.map(c => c.stdev);
            const meanRange = Math.max(...means) - Math.min(...means);
            const stdRange = Math.max(...stds) - Math.min(...stds);

            // AI images tend to have more balanced channel means (smaller range)
            // and more uniform standard deviations across channels
            let colorAI = 0.5;
            if (meanRange < 15) colorAI += 0.12; // very balanced → AI
            if (stdRange < 10) colorAI += 0.10; // uniform stds → AI
            if (meanRange > 40) colorAI -= 0.10; // unbalanced → real
            if (stdRange > 25) colorAI -= 0.08;

            // AI images tend to have moderate-high saturation
            const avgStd = stds.reduce((a, b) => a + b, 0) / stds.length;
            if (avgStd > 50 && avgStd < 75) colorAI += 0.05; // AI sweet spot

            pixelAnalysis.colorUniformity = clamp(colorAI, 0.1, 0.9);
            pixelAnalysis.colorDesc = `Channel balance: ${meanRange.toFixed(1)} (${meanRange < 20 ? 'very balanced — AI pattern' : meanRange > 35 ? 'natural imbalance' : 'moderate'}), std range: ${stdRange.toFixed(1)}`;
          }
        } catch (_) {}

        // === Noise Uniformity Analysis ===
        try {
          const smallSize = 256;
          const originalRaw = await sharp(filePath)
            .resize(smallSize, smallSize, { fit: 'fill' })
            .greyscale()
            .raw()
            .toBuffer();
          const blurredRaw = await sharp(filePath)
            .resize(smallSize, smallSize, { fit: 'fill' })
            .greyscale()
            .blur(2)
            .raw()
            .toBuffer();

          // Noise = original - blurred
          const blockSize = 32;
          const blocks = smallSize / blockSize;
          const noiseStds = [];
          for (let by = 0; by < blocks; by++) {
            for (let bx = 0; bx < blocks; bx++) {
              let sum = 0, sum2 = 0, count = 0;
              for (let y = by * blockSize; y < (by + 1) * blockSize; y++) {
                for (let x = bx * blockSize; x < (bx + 1) * blockSize; x++) {
                  const idx = y * smallSize + x;
                  if (idx < originalRaw.length && idx < blurredRaw.length) {
                    const noise = originalRaw[idx] - blurredRaw[idx];
                    sum += noise;
                    sum2 += noise * noise;
                    count++;
                  }
                }
              }
              if (count > 0) {
                const mean = sum / count;
                const std = Math.sqrt(sum2 / count - mean * mean);
                noiseStds.push(std);
              }
            }
          }

          if (noiseStds.length >= 4) {
            const noiseCV = cv(noiseStds);
            // AI images: very uniform noise (low CV)
            // Real photos: varied noise (high CV) due to different textures/surfaces
            let noiseAI = 0.5;
            if (noiseCV < 0.2) noiseAI = 0.7;
            else if (noiseCV < 0.3) noiseAI = 0.58;
            else if (noiseCV > 0.5) noiseAI = 0.3;
            else if (noiseCV > 0.4) noiseAI = 0.38;

            pixelAnalysis.noiseUniformity = clamp(noiseAI, 0.1, 0.9);
            pixelAnalysis.noiseDesc = `Noise CV: ${noiseCV.toFixed(3)} (${noiseCV < 0.25 ? 'uniform — AI-generated pattern' : noiseCV > 0.4 ? 'varied — natural photo pattern' : 'moderate'})`;
          }
        } catch (_) {}

        // === Saturation Profile ===
        try {
          const stats = await sharp(filePath).stats();
          const channels = stats.channels;
          if (channels.length >= 3) {
            // Check if saturation is in the "AI sweet spot"
            // AI images tend to have higher saturation and less tonal range in shadows
            const minVals = channels.map(c => c.min);
            const maxVals = channels.map(c => c.max);
            const hasDeepBlack = minVals.some(v => v <= 5);
            const hasPureWhite = maxVals.some(v => v >= 250);
            const hasFullRange = hasDeepBlack && hasPureWhite;

            let satAI = 0.5;
            // AI images often lack true blacks and whites
            if (!hasFullRange) satAI += 0.1;
            if (!hasDeepBlack && !hasPureWhite) satAI += 0.08;
            if (hasFullRange) satAI -= 0.08;

            pixelAnalysis.saturationProfile = clamp(satAI, 0.1, 0.9);
            pixelAnalysis.saturationDesc = `Tonal range: ${hasFullRange ? 'full range — natural photo' : 'limited range — possible AI generation'}`;
          }
        } catch (_) {}

        // === Edge Density Analysis ===
        try {
          const edgeSize = 256;
          const greyBuf = await sharp(filePath)
            .resize(edgeSize, edgeSize, { fit: 'fill' })
            .greyscale()
            .raw()
            .toBuffer();

          // Simple Sobel-like edge detection
          let edgeSum = 0;
          let edgeCount = 0;
          const edgeVals = [];
          for (let y = 1; y < edgeSize - 1; y++) {
            for (let x = 1; x < edgeSize - 1; x++) {
              const idx = y * edgeSize + x;
              const gx = Math.abs(
                greyBuf[idx + 1] - greyBuf[idx - 1] +
                2 * (greyBuf[idx + edgeSize + 1] - greyBuf[idx + edgeSize - 1])
              );
              const gy = Math.abs(
                greyBuf[idx + edgeSize] - greyBuf[idx - edgeSize] +
                2 * (greyBuf[idx + edgeSize + 1] - greyBuf[idx - edgeSize + 1])
              );
              const magnitude = Math.sqrt(gx * gx + gy * gy);
              edgeSum += magnitude;
              edgeVals.push(magnitude);
              edgeCount++;
            }
          }

          if (edgeCount > 0) {
            const avgEdge = edgeSum / edgeCount;
            const edgeStd = Math.sqrt(edgeVals.reduce((s, v) => s + (v - avgEdge) ** 2, 0) / edgeCount);
            const edgeCV2 = avgEdge > 0 ? edgeStd / avgEdge : 0;

            // AI images tend to have either very smooth (low edge) or overly detailed (high edge)
            // with more uniform edge distribution (low CV)
            let edgeAI = 0.5;
            if (edgeCV2 < 0.8) edgeAI += 0.1; // uniform edges → AI
            if (avgEdge < 10) edgeAI += 0.08; // very smooth → AI
            if (edgeCV2 > 1.2) edgeAI -= 0.08; // varied edges → real
            if (avgEdge > 30 && edgeCV2 > 1.0) edgeAI -= 0.05; // detailed + varied → real

            pixelAnalysis.edgeDensity = clamp(edgeAI, 0.1, 0.9);
            pixelAnalysis.edgeDesc = `Avg edge: ${avgEdge.toFixed(1)}, uniformity: ${edgeCV2.toFixed(2)} (${edgeCV2 < 0.9 ? 'uniform — AI pattern' : edgeCV2 > 1.1 ? 'varied — natural photo' : 'moderate'})`;
          }
        } catch (_) {}

        pixelAnalysis.available = true;
      }
    } catch (_) {
      // sharp analysis failed — fall back to metadata-only
    }
  }

  // ─── Scoring (metadata + pixel analysis) ───
  let aiProb = 0.40;

  // Metadata signals (strong)
  if (hasAISig) aiProb += 0.35;
  if (hasPNGParams) aiProb += 0.22;
  if (hasC2PA) aiProb += 0.05;

  // Metadata counter-signals
  if (hasExif) aiProb -= 0.10;
  if (hasCamera) aiProb -= 0.28;
  if (hasEditor) aiProb -= 0.05;
  if (!hasExif && !hasCamera) aiProb += 0.06;

  // Dimension signal
  if (isAIRes) aiProb += 0.08;

  // Pixel analysis signals (weighted)
  if (pixelAnalysis.available) {
    const pixelWeight = 0.25; // pixel analysis contributes up to 25% of the score
    const pixelAvg = (
      pixelAnalysis.elaScore * 0.35 +
      pixelAnalysis.colorUniformity * 0.20 +
      pixelAnalysis.noiseUniformity * 0.25 +
      pixelAnalysis.saturationProfile * 0.10 +
      pixelAnalysis.edgeDensity * 0.10
    );
    // Shift score toward pixel analysis result
    aiProb = aiProb * (1 - pixelWeight) + pixelAvg * pixelWeight;
  }

  const aiPercent = Math.round(clamp(aiProb) * 100);
  const v = verdictFromPercent(aiPercent);

  const details = [
    {
      name: 'EXIF Metadata',
      found: hasExif,
      score: hasExif ? 18 : 65,
      description: hasExif
        ? 'EXIF data present — common in real photographs'
        : 'No EXIF data — may indicate AI generation or heavy editing',
      icon: 'file-text'
    },
    {
      name: 'AI Tool Signatures',
      found: hasAISig,
      score: hasAISig ? 95 : 12,
      description: hasAISig
        ? `${aiToolName} signature detected in file metadata`
        : 'No known AI tool signatures found',
      icon: 'cpu'
    },
    {
      name: 'Camera Information',
      found: hasCamera,
      score: hasCamera ? 8 : 55,
      description: hasCamera
        ? 'Camera/device metadata found — likely a real photograph'
        : 'No camera information found',
      icon: 'camera'
    },
    {
      name: 'Editing Software',
      found: hasEditor,
      score: hasEditor ? 22 : 48,
      description: hasEditor
        ? 'Photo editing software metadata detected'
        : 'No editing software signatures',
      icon: 'sliders'
    },
    {
      name: 'Generation Parameters',
      found: hasPNGParams,
      score: hasPNGParams ? 95 : 15,
      description: hasPNGParams
        ? 'AI generation parameters (prompt/negative_prompt) found in file chunks'
        : 'No generation parameters detected',
      icon: 'settings'
    },
    {
      name: 'Image Dimensions',
      found: imgW > 0,
      score: isAIRes ? 72 : (imgW > 0 ? 25 : 40),
      description: imgW > 0
        ? `${imgW}x${imgH}px${isAIRes ? ' — common AI generation resolution' : ''}`
        : 'Could not determine image dimensions',
      icon: 'ruler'
    },
    {
      name: 'Content Credentials',
      found: hasC2PA,
      score: hasC2PA ? 62 : 30,
      description: hasC2PA
        ? 'C2PA Content Credentials metadata found'
        : 'No content credentials detected',
      icon: 'file-text'
    },
  ];

  // Add pixel analysis details if available
  if (pixelAnalysis.available) {
    details.push(
      {
        name: 'Error Level Analysis (ELA)',
        found: true,
        score: Math.round(pixelAnalysis.elaScore * 100),
        description: pixelAnalysis.elaDesc,
        icon: 'bar-chart'
      },
      {
        name: 'Color Channel Balance',
        found: true,
        score: Math.round(pixelAnalysis.colorUniformity * 100),
        description: pixelAnalysis.colorDesc,
        icon: 'sliders'
      },
      {
        name: 'Noise Pattern Analysis',
        found: true,
        score: Math.round(pixelAnalysis.noiseUniformity * 100),
        description: pixelAnalysis.noiseDesc,
        icon: 'hash'
      },
      {
        name: 'Tonal Range / Saturation',
        found: true,
        score: Math.round(pixelAnalysis.saturationProfile * 100),
        description: pixelAnalysis.saturationDesc,
        icon: 'type'
      },
      {
        name: 'Edge Density & Coherence',
        found: true,
        score: Math.round(pixelAnalysis.edgeDensity * 100),
        description: pixelAnalysis.edgeDesc,
        icon: 'trending-down'
      }
    );
  }

  const hasStrongSignal = hasAISig || hasPNGParams || hasCamera || pixelAnalysis.available;

  return {
    type: 'image',
    ...fileInfo,
    aiProbability: aiPercent,
    humanProbability: 100 - aiPercent,
    ...v,
    confidence: hasAISig || hasPNGParams || hasCamera ? 'High' : (pixelAnalysis.available ? 'Medium' : 'Low'),
    details,
    note: pixelAnalysis.available
      ? 'Analysis includes both metadata examination and pixel-level analysis (ELA, color, noise, edge detection).'
      : 'Image analysis is based on metadata examination. Pixel-level analysis was not available for this file format.'
  };
}

// ═══════════════════════════════════════════════════════════
//  VIDEO ANALYSIS (Enhanced)
// ═══════════════════════════════════════════════════════════

function analyzeVideo(filePath, fileInfo) {
  const data = readFileHead(filePath, 2 * 1024 * 1024); // Read more for better detection
  const dataStr = data.toString('latin1');

  // Expanded AI video tool signatures
  const aiToolSigs = {
    'Runway': /runway|gen-2|gen-3/i.test(dataStr),
    'Pika': /pika/i.test(dataStr),
    'OpenAI Sora': /sora|openai/i.test(dataStr),
    'Synthesia': /synthesia/i.test(dataStr),
    'D-ID': /d-id|d\.id/i.test(dataStr),
    'HeyGen': /heygen/i.test(dataStr),
    'Luma': /luma|dream.?machine/i.test(dataStr),
    'Kling': /kling|kuaishou/i.test(dataStr),
    'Stable Video': /stable.?video|svd/i.test(dataStr),
    'AnimateDiff': /animate.?diff/i.test(dataStr),
    'ModelScope': /modelscope/i.test(dataStr),
    'Deepfake Tool': /deepfake|faceswap|face.?swap|reface/i.test(dataStr),
    'Wav2Lip': /wav2lip/i.test(dataStr),
    'Vidu': /vidu/i.test(dataStr),
    'Minimax': /minimax|hailuo/i.test(dataStr),
    'Genmo': /genmo/i.test(dataStr),
    'Kaiber': /kaiber/i.test(dataStr),
  };
  const hasAISig = Object.values(aiToolSigs).some(v => v);
  const aiToolName = Object.entries(aiToolSigs).find(([, v]) => v)?.[0] || null;

  const hasCamera = /canon|nikon|sony|gopro|iphone|samsung|dji|insta360|pixel|huawei|xiaomi|osmo|hero|blackmagic|red\s|arri/i.test(dataStr);
  const hasEditor = /premiere|davinci|final.?cut|avid|vegas|capcut|imovie|filmora|shotcut|kdenlive|blender|after.?effects|resolve|handbrake/i.test(dataStr);

  // Check for video codec metadata patterns
  const hasStandardCodec = /avc1|hevc|h\.264|h\.265|prores|dnxh|x264|x265|libx264/i.test(dataStr);
  const hasScreenRecording = /obs|screen.?record|camtasia|bandicam|fraps|streamlabs/i.test(dataStr);

  // Check audio track presence and characteristics
  const hasAudioTrack = /mp4a|aac|pcm|opus|vorbis|flac/i.test(dataStr);

  // Duration/timestamp analysis (real videos have proper timestamps)
  const hasMoovAtom = dataStr.includes('moov') || dataStr.includes('mdat');
  const hasCreationTime = /creation_time|date|mvhd/i.test(dataStr);

  let aiProb = 0.42;
  if (hasAISig) aiProb += 0.38;
  if (hasCamera) aiProb -= 0.28;
  if (hasEditor) aiProb -= 0.05;
  if (hasScreenRecording) aiProb -= 0.10;
  if (!hasAudioTrack) aiProb += 0.06; // AI videos often lack audio
  if (!hasCreationTime && !hasCamera) aiProb += 0.04;
  if (hasCreationTime && hasMoovAtom) aiProb -= 0.05;

  const aiPercent = Math.round(clamp(aiProb) * 100);
  const v = verdictFromPercent(aiPercent);

  return {
    type: 'video',
    ...fileInfo,
    aiProbability: aiPercent,
    humanProbability: 100 - aiPercent,
    ...v,
    confidence: hasAISig || hasCamera ? 'Medium' : 'Low',
    details: [
      { name: 'AI Tool Signatures', found: hasAISig, score: hasAISig ? 92 : 18,
        description: hasAISig ? `${aiToolName} AI video tool signature detected` : 'No known AI video tool signatures', icon: 'cpu' },
      { name: 'Camera Information', found: hasCamera, score: hasCamera ? 8 : 52,
        description: hasCamera ? 'Camera/recording device metadata found — likely real footage' : 'No camera metadata found', icon: 'video' },
      { name: 'Editing Software', found: hasEditor, score: hasEditor ? 22 : 50,
        description: hasEditor ? 'Video editing software detected' : 'No editing software signatures', icon: 'film' },
      { name: 'Audio Track', found: hasAudioTrack, score: hasAudioTrack ? 25 : 62,
        description: hasAudioTrack ? 'Audio track present — common in real recordings' : 'No audio track detected — AI-generated videos often lack audio', icon: 'settings' },
      { name: 'File Structure', found: hasCreationTime, score: hasCreationTime ? 20 : 55,
        description: hasCreationTime ? 'Valid creation timestamps found — typical of real recordings' : 'No creation timestamps — may indicate AI generation', icon: 'file-text' },
      { name: 'Screen Recording', found: hasScreenRecording, score: hasScreenRecording ? 10 : 50,
        description: hasScreenRecording ? 'Screen recording software detected — human-captured content' : 'No screen recording metadata', icon: 'sliders' }
    ],
    note: 'Video analysis examines metadata patterns, audio presence, and file structure. For frame-level deepfake detection, specialized deep-learning tools are recommended.'
  };
}

// ═══════════════════════════════════════════════════════════
//  DOCUMENT ANALYSIS (Enhanced)
// ═══════════════════════════════════════════════════════════

function analyzeDocument(filePath, fileInfo, ext) {
  if (ext === '.txt') {
    const text = fs.readFileSync(filePath, 'utf8');
    const result = analyzeText(text);
    if (result.error) return { ...fileInfo, type: 'document', ...result };
    return { ...fileInfo, ...result, type: 'document' };
  }

  const data = readFileHead(filePath);
  const dataStr = data.toString('latin1');

  // Expanded AI writing tool signatures
  const aiToolSigs = {
    'ChatGPT': /chatgpt|gpt-4|gpt-3\.5|gpt-4o/i.test(dataStr),
    'Claude': /claude|anthropic/i.test(dataStr),
    'Gemini': /gemini|bard|google.?ai/i.test(dataStr),
    'Copilot': /copilot|bing.?ai/i.test(dataStr),
    'Jasper': /jasper\.ai|jasper/i.test(dataStr),
    'WriteSonic': /writesonic/i.test(dataStr),
    'Grammarly AI': /grammarly/i.test(dataStr),
    'QuillBot': /quillbot/i.test(dataStr),
    'Copy.ai': /copy\.ai/i.test(dataStr),
    'Notion AI': /notion.?ai/i.test(dataStr),
    'Rytr': /rytr/i.test(dataStr),
    'Wordtune': /wordtune/i.test(dataStr),
    'Sudowrite': /sudowrite/i.test(dataStr),
    'Perplexity': /perplexity/i.test(dataStr),
  };
  const hasAISig = Object.values(aiToolSigs).some(v => v);
  const aiToolName = Object.entries(aiToolSigs).find(([, v]) => v)?.[0] || null;

  const hasAuthor = /author|creator|producer/i.test(dataStr);
  const hasOffice = /microsoft|word|excel|powerpoint|libreoffice|google.?docs|pages|keynote/i.test(dataStr);

  // Try to extract text from PDF for linguistic analysis
  let extractedTextResult = null;
  if (ext === '.pdf') {
    try {
      // Basic text extraction from PDF streams
      const textChunks = [];
      const textMatches = dataStr.match(/\(([^)]{10,})\)/g) || [];
      for (const m of textMatches) {
        const t = m.slice(1, -1);
        if (/[a-zA-Z]{3,}/.test(t)) textChunks.push(t);
      }
      // Also try BT...ET text blocks
      const btMatches = dataStr.match(/BT\s[\s\S]{10,}?\sET/g) || [];
      for (const bt of btMatches) {
        const tjMatches = bt.match(/\(([^)]+)\)\s*Tj/g) || [];
        for (const tj of tjMatches) {
          const t = tj.replace(/\)\s*Tj/, '').replace(/^\(/, '');
          if (t.length > 5) textChunks.push(t);
        }
      }
      const combinedText = textChunks.join(' ').trim();
      if (combinedText.length >= 100) {
        extractedTextResult = analyzeText(combinedText);
      }
    } catch (_) {}
  }

  // Try to extract text from DOCX (ZIP-based XML)
  if (ext === '.docx') {
    try {
      // DOCX files are ZIP archives; look for XML text patterns
      const xmlText = dataStr.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
      const texts = xmlText.map(t => t.replace(/<[^>]+>/g, '')).filter(t => t.length > 0);
      const combinedText = texts.join(' ').trim();
      if (combinedText.length >= 100) {
        extractedTextResult = analyzeText(combinedText);
      }
    } catch (_) {}
  }

  let aiProb = 0.40;
  if (hasAISig) aiProb += 0.35;
  if (hasAuthor) aiProb -= 0.10;
  if (hasOffice) aiProb -= 0.05;

  // Blend with text analysis if we extracted text
  if (extractedTextResult && !extractedTextResult.error) {
    const textProb = extractedTextResult.aiProbability / 100;
    aiProb = aiProb * 0.3 + textProb * 0.7; // Text analysis is more reliable
  }

  const aiPercent = Math.round(clamp(aiProb) * 100);
  const v = verdictFromPercent(aiPercent);

  const details = [
    { name: 'AI Tool Signatures', found: hasAISig, score: hasAISig ? 90 : 18,
      description: hasAISig ? `${aiToolName} signature detected in metadata` : 'No AI tool signatures found', icon: 'cpu' },
    { name: 'Author Metadata', found: hasAuthor, score: hasAuthor ? 22 : 52,
      description: hasAuthor ? 'Author information found in document' : 'No author metadata', icon: 'user' },
    { name: 'Application Info', found: hasOffice, score: hasOffice ? 22 : 50,
      description: hasOffice ? 'Office application metadata detected' : 'No application metadata', icon: 'file' },
  ];

  // Add text analysis details if available
  if (extractedTextResult && !extractedTextResult.error && extractedTextResult.details) {
    details.push({
      name: 'Extracted Text Analysis',
      found: true,
      score: extractedTextResult.aiProbability,
      description: `Linguistic analysis of extracted text: ${extractedTextResult.verdict} (${extractedTextResult.aiProbability}% AI probability)`,
      icon: 'edit'
    });
  }

  return {
    type: 'document',
    ...fileInfo,
    aiProbability: aiPercent,
    humanProbability: 100 - aiPercent,
    ...v,
    confidence: hasAISig ? 'High' : (extractedTextResult && !extractedTextResult.error ? 'Medium' : 'Low'),
    details,
    note: extractedTextResult && !extractedTextResult.error
      ? 'Document analyzed with both metadata inspection and linguistic analysis of extracted text.'
      : 'For more accurate analysis, paste the document text directly in the Text Analysis tab.',
    ...(extractedTextResult && !extractedTextResult.error ? { textAnalysisDetails: extractedTextResult.details } : {})
  };
}

// ═══════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════

app.post('/api/analyze/text', (req, res) => {
  try {
    const result = analyzeText(req.body.text);
    if (result.error) return res.json(result);

    // ─── Behavioral signals (from frontend) ───
    const behavior = req.body.behavior;
    if (behavior && typeof behavior === 'object') {
      const behavioralDetails = [];
      let behavioralShift = 0;

      // Paste detection
      if (typeof behavior.pasteRatio === 'number') {
        const pasteScore = behavior.pasteRatio > 0.8 ? 75 :
                          behavior.pasteRatio > 0.5 ? 60 :
                          behavior.pasteRatio > 0.2 ? 45 : 20;
        behavioralDetails.push({
          name: 'Paste Detection',
          score: pasteScore,
          description: behavior.pasteRatio > 0.5
            ? `${Math.round(behavior.pasteRatio * 100)}% of text was pasted — AI text is often pasted in`
            : `${Math.round(behavior.pasteRatio * 100)}% of text was pasted — text appears to be typed`,
          icon: 'file',
        });
        if (behavior.pasteRatio > 0.8) behavioralShift += 0.05;
        else if (behavior.pasteRatio < 0.2) behavioralShift -= 0.03;
      }

      // Typing speed
      if (typeof behavior.avgCharsPerSecond === 'number' && behavior.avgCharsPerSecond > 0) {
        // Normal typing: 3-8 chars/sec; fast pasting: 100+
        const speed = behavior.avgCharsPerSecond;
        const speedScore = speed > 50 ? 80 : speed > 20 ? 65 : speed > 10 ? 50 : speed > 5 ? 35 : 20;
        behavioralDetails.push({
          name: 'Input Speed',
          score: speedScore,
          description: speed > 20
            ? `${speed.toFixed(1)} chars/sec — abnormally fast, suggests paste/auto-fill`
            : `${speed.toFixed(1)} chars/sec — consistent with manual typing`,
          icon: 'settings',
        });
        if (speed > 50) behavioralShift += 0.04;
        else if (speed < 8) behavioralShift -= 0.02;
      }

      // Edit patterns
      if (typeof behavior.editCount === 'number') {
        const edits = behavior.editCount;
        const editScore = edits === 0 ? 60 : edits < 3 ? 45 : edits < 10 ? 30 : 20;
        behavioralDetails.push({
          name: 'Edit Patterns',
          score: editScore,
          description: edits === 0
            ? 'No edits detected — text entered without revision'
            : `${edits} edit(s) detected — text was revised during input`,
          icon: 'edit',
        });
        if (edits === 0 && behavior.pasteRatio > 0.5) behavioralShift += 0.02;
        else if (edits > 5) behavioralShift -= 0.02;
      }

      // Typing consistency
      if (typeof behavior.typingBurstiness === 'number') {
        const burst = behavior.typingBurstiness;
        const burstScore = burst < 0.3 ? 65 : burst < 0.5 ? 50 : burst < 0.8 ? 35 : 20;
        behavioralDetails.push({
          name: 'Typing Rhythm',
          score: burstScore,
          description: burst < 0.3
            ? 'Very consistent input speed — not typical of manual typing'
            : 'Natural typing rhythm with pauses and bursts',
          icon: 'ruler',
        });
      }

      // Apply behavioral shift to the AI probability
      if (behavioralShift !== 0) {
        const adjustedProb = clamp(result.aiProbability / 100 + behavioralShift) * 100;
        result.aiProbability = Math.round(adjustedProb);
        result.humanProbability = 100 - result.aiProbability;
        const v = verdictFromPercent(result.aiProbability);
        result.verdict = v.verdict;
        result.verdictColor = v.verdictColor;
      }

      if (behavioralDetails.length > 0) {
        result.behavioralDetails = behavioralDetails;
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Analysis failed: ' + err.message });
  }
});

app.post('/api/analyze/file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    const info = { fileName: req.file.originalname, fileSize: req.file.size, mimeType: req.file.mimetype };
    let result;
    if (['.jpg','.jpeg','.png','.gif','.webp','.bmp'].includes(ext)) result = await analyzeImage(req.file.path, info);
    else if (['.mp4','.avi','.mov','.webm','.mkv'].includes(ext)) result = analyzeVideo(req.file.path, info);
    else if (['.pdf','.doc','.docx','.txt','.rtf'].includes(ext)) result = analyzeDocument(req.file.path, info, ext);
    else result = { ...info, error: 'Unsupported file type' };
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.json(result);
  } catch (err) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({ error: 'Analysis failed: ' + err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'build')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'build', 'index.html')));
}

app.listen(PORT, () => console.log(`AI Detector server running on port ${PORT}`));
