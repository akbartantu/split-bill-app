/**
 * OCR Line Normalization (Client-Side)
 *
 * Mirrors server-side normalization for consistency.
 */

export interface NormalizedLine {
  normalized: string;
  original: string;
  changes: string[];
}

export function normalizeOcrLine(line: string): NormalizedLine {
  const original = line.trim();
  let normalized = original;
  const changes: string[] = [];

  // Step 1: Fix quantity token confusions
  const quantityFixes = [
    { pattern: /\b[Ii]x\b/g, replacement: '1x', desc: 'Ix → 1x' },
    { pattern: /\b[Ii]\s+x\b/g, replacement: '1x', desc: 'I x → 1x' },
    { pattern: /\bl\s+x\b/gi, replacement: '1x', desc: 'l x → 1x' },
    { pattern: /\bZx\b/g, replacement: '2x', desc: 'Zx → 2x' },
  ];

  for (const fix of quantityFixes) {
    if (fix.pattern.test(normalized)) {
      normalized = normalized.replace(fix.pattern, fix.replacement);
      changes.push(fix.desc);
    }
  }

  // Step 2: Standardize hyphen decimals
  const hyphenDecimalPattern = /\b(\d{1,3})-(\d{2})\b/g;
  if (hyphenDecimalPattern.test(normalized)) {
    normalized = normalized.replace(hyphenDecimalPattern, (match, before, after) => {
      if (before.length <= 3 && after.length === 2) {
        changes.push(`${match} → ${before}.${after}`);
        return `${before}.${after}`;
      }
      return match;
    });
  }

  // Step 3: Remove trailing garbage tokens
  const garbagePatterns = [
    /\s+[a-z]{1,2}\s*$/i,
    /\s+"\d+\s*S\d+\s*"$/,
    /\s+[A-Z]\d+\s*$/,
    /\s+\d+\s*x\s+\$\d+\.\d+\s*$/,
  ];

  for (const pattern of garbagePatterns) {
    if (pattern.test(normalized)) {
      const before = normalized;
      normalized = normalized.replace(pattern, '').trim();
      if (before !== normalized) {
        changes.push('Removed trailing garbage');
      }
    }
  }

  // Step 4: Strip tax code "A"
  normalized = normalized.replace(/\s+A\s*$/, '').trim();
  if (normalized !== original && original.endsWith(' A')) {
    changes.push('Removed tax code "A"');
  }

  // Step 5: Normalize currency tokens
  const beforeCurrency = normalized;
  normalized = normalized
    .replace(/\bAU\$/gi, '$')
    .replace(/\b(AUD|USD|NZD)\b/gi, '')
    .replace(/\((AUD|USD|NZD)\)/gi, '')
    .trim();
  if (beforeCurrency !== normalized) {
    changes.push('Normalized currency tokens');
  }

  // Step 6: Clean up quotes and spaces
  normalized = normalized
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    normalized,
    original,
    changes: changes.length > 0 ? changes : [],
  };
}
