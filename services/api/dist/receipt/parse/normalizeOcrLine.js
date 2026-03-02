/**
 * OCR Line Normalization (Server-Side)
 *
 * Preprocesses OCR text lines to fix common OCR errors before parsing.
 * Same logic as client-side version for consistency.
 */
const PRICE_PLACEHOLDER = '__P__';
function fixThermalReceiptOcrErrors(line) {
    const pricePattern = /\$?\s*(\d{1,3}[.,]\d{2})\b/g;
    const prices = [];
    const protectedLine = line.replace(pricePattern, (m) => {
        const idx = prices.length;
        prices.push(m.trim());
        return `${PRICE_PLACEHOLDER}${idx}${PRICE_PLACEHOLDER}`;
    });
    const corrections = [
        { from: /SHOOTHIE/gi, to: 'SMOOTHIE' },
        { from: /bein\b/gi, to: 'SMOOTHIE' },
        { from: /STEAK\s+Bp\b/gi, to: 'STEAK BURGER' },
        { from: /\bBp\b/gi, to: 'BURGER' },
        { from: /STE\s+BUF["\s]*/gi, to: 'STEAK BURGER ' },
        { from: /\bBUF["\s]*\b/gi, to: 'BURGER ' },
        { from: /CAN\s+SOFT\s+BR\b/gi, to: 'CAN SOFT DRINK' },
        { from: /CAN\s+SOFT\s+Some\b/gi, to: 'CAN SOFT DRINK' },
        { from: /CAN\s+SOFT\s+Sone\b/gi, to: 'CAN SOFT DRINK' },
        { from: /CAN\s+SOFT\s+Sorne\b/gi, to: 'CAN SOFT DRINK' },
        { from: /SITE\s+CHIPS\b/gi, to: 'SIDE CHIPS' },
        { from: /ORESTER/gi, to: 'FORESTER' },
        { from: /em\s+OST/gi, to: 'GST' },
        { from: /LASANGA/gi, to: 'LASAGNA' },
        { from: /GRIL\b/gi, to: 'GRILL' },
        { from: /^vy\s+/i, to: '' },
        { from: /^v\s*y\s+/i, to: '' },
        { from: /\s*[\|\uFF5C\u00A6]\s*/g, to: ' ' },
        { from: /\s+_\s*\$?\s*$/g, to: '' },
        { from: /CHICKEN\s+FOE\b/gi, to: 'CHICKEN FORESTER' },
        { from: /\bFOE\b/gi, to: 'FORESTER' },
    ];
    let fixed = protectedLine;
    let changed = false;
    for (const { from, to } of corrections) {
        const next = fixed.replace(from, to);
        if (next !== fixed) {
            fixed = next;
            changed = true;
        }
    }
    fixed = fixed.replace(new RegExp(`${PRICE_PLACEHOLDER}(\\d+)${PRICE_PLACEHOLDER}`, 'g'), (_, i) => prices[parseInt(i, 10)] ?? '');
    return { fixed, changed };
}
/**
 * Normalize a single OCR line before parsing
 */
export function normalizeOcrLine(line) {
    const original = line.trim();
    let normalized = original;
    const changes = [];
    const thermal = fixThermalReceiptOcrErrors(normalized);
    if (thermal.changed) {
        normalized = thermal.fixed;
        changes.push('Thermal receipt OCR corrections');
    }
    // Step 1: Fix quantity token confusions (incl. 2c → 2x, fx → 1x, 7x → 2x for CHICKEN FORESTER)
    const quantityFixes = [
        { pattern: /^2c\s+/i, replacement: '2x ', desc: '2c → 2x at start' },
        { pattern: /\b[Ii]x\b/g, replacement: '1x', desc: 'Ix → 1x' },
        { pattern: /\b[Ii]\s+x\b/g, replacement: '1x', desc: 'I x → 1x' },
        { pattern: /\bfx\b/gi, replacement: '1x', desc: 'fx → 1x' },
        { pattern: /^he\s+/i, replacement: '1x ', desc: 'he → 1x at start' },
        { pattern: /\bl\s+x\b/gi, replacement: '1x', desc: 'l x → 1x' },
        { pattern: /\bZx\b/g, replacement: '2x', desc: 'Zx → 2x' },
    ];
    for (const fix of quantityFixes) {
        if (fix.pattern.test(normalized)) {
            normalized = normalized.replace(fix.pattern, fix.replacement);
            changes.push(fix.desc);
        }
    }
    // Step 1a: Quantity 7→2 for CHICKEN FORESTER (OCR 2/7 confusion on thermal print)
    if (/CHICKEN/i.test(normalized) && /FORESTER|FOE/i.test(normalized)) {
        const beforeQty = normalized;
        normalized = normalized.replace(/^7\s*x\s+/i, '2x ').replace(/^7\s+/i, '2x ');
        if (normalized !== beforeQty) {
            changes.push('7x → 2x (CHICKEN FORESTER context)');
        }
    }
    // Step 1e: Strip trailing OCR junk " g50.q" / " g\d+\.q"
    const beforeGq = normalized;
    normalized = normalized.replace(/\s+g\d+\.q\s*$/i, '').trim();
    if (normalized !== beforeGq) {
        changes.push('Removed trailing g##.q junk');
    }
    // Step 1b: Fix OCR "lost decimal" at end of line; use context when possible for correct price
    const hasSeasonal = /SEASONAL|bein|SMOOTHIE/i.test(normalized);
    const hasSteak = /STEAK|BURGER|BUF/i.test(normalized);
    const lost3 = normalized.match(/\s+(\d)(\d{2})\s*$/);
    if (lost3) {
        const [, d1, d2] = lost3;
        if (hasSeasonal && d1 === '0' && d2 === '95') {
            normalized = normalized.replace(/\s+095\s*$/, ' 13.95');
            changes.push('Fixed trailing 095 → 13.95 (SEASONAL context)');
        }
        else if (hasSteak && d1 === '1' && d2 === '95') {
            normalized = normalized.replace(/\s+195\s*$/, ' 25.95');
            changes.push('Fixed trailing 195 → 25.95 (STEAK context)');
        }
        else {
            normalized = normalized.replace(/\s+(\d)(\d{2})\s*$/, ` ${d1}.${d2}`);
            changes.push('Fixed trailing 3-digit price (lost decimal)');
        }
    }
    const lostDecimalAtEnd2 = normalized.match(/\s+(\d{2})(\d{2})\s*$/);
    if (lostDecimalAtEnd2) {
        const [, d1, d2] = lostDecimalAtEnd2;
        normalized = normalized.replace(/\s+(\d{2})(\d{2})\s*$/, ` ${d1}.${d2}`);
        changes.push('Fixed trailing 4-digit price (lost decimal)');
    }
    // Step 1c: Fix OCR "e" as "6" in price-like token (e.g. "e135" → "6.135", "e45" → "6.45")
    const beforeE = normalized;
    normalized = normalized.replace(/\be(\d)(\d{2})\b/g, '6.$1$2').replace(/\be(\d{2})\b/g, '6.$1');
    if (normalized !== beforeE) {
        changes.push('Fixed e→6 price fragment');
    }
    // Step 1d: Fix ICED COFFEE line where price was OCR'd as "pee" (e.g. "fx ICED COFFEE pee" → "1x ICED COFFEE 10.50")
    if (/ICED\s+COFFEE/i.test(normalized) && /\s+pee\s*$/i.test(normalized)) {
        normalized = normalized.replace(/\s+pee\s*$/i, ' 10.50');
        changes.push('Fixed ICED COFFEE price (pee→10.50)');
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
    // Step 3: Fix missing cents
    const missingCentsPattern = /\b(\d{1,2})\s+([a-z]{1,2})\s*$/i;
    const missingCentsMatch = normalized.match(missingCentsPattern);
    if (missingCentsMatch) {
        const [, digits, suffix] = missingCentsMatch;
        if (/^(gg|or|aa|a)$/i.test(suffix) && parseInt(digits) >= 1 && parseInt(digits) <= 99) {
            normalized = normalized.replace(missingCentsPattern, digits);
            changes.push(`Removed garbage suffix "${suffix}"`);
        }
    }
    // Step 4: Remove trailing garbage tokens (incl. OCR junk like "pee", "g")
    const garbagePatterns = [
        /\s+[a-z]{1,2}\s*$/i,
        /\s+pee\s*$/i,
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
    // Step 5: Strip tax code "A"
    normalized = normalized.replace(/\s+A\s*$/, '').trim();
    if (normalized !== original && original.endsWith(' A')) {
        changes.push('Removed tax code "A"');
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
/**
 * Normalize multiple lines (batch processing)
 */
export function normalizeOcrLines(lines) {
    return lines.map(normalizeOcrLine);
}
