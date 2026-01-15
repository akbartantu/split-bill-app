/**
 * Extract Canonical Item Name
 * 
 * Produces a clean, canonical item name from OCR lines by:
 * - Removing quantity tokens
 * - Removing all money tokens
 * - Removing trailing garbage
 * - Preserving full name (no truncation)
 */

/**
 * Extract canonical item name from OCR line
 * 
 * Rules:
 * 1. Remove leading quantity tokens (1x, 2x, Ix, ix, etc.)
 * 2. Remove ALL money tokens (prices with decimals)
 * 3. Remove trailing tax codes (A)
 * 4. Remove trailing garbage (or, gg, aa, S405, etc.)
 * 5. Collapse whitespace, trim
 * 6. Preserve full name - never truncate
 */
export function extractCanonicalName(originalLine: string): string {
  let name = originalLine.trim();
  
  // Step 1: Remove leading quantity tokens
  // Pattern: ^\s*(\d+|[Ii]x?|ix?|lx?)\s*[xX]?\s*
  const quantityPatterns = [
    /^\s*\d+\s*[xX]\s+/i,      // "2x " or "2X "
    /^\s*[Ii]x\s+/i,            // "Ix " or "ix "
    /^\s*[Ii]\s+x\s+/i,         // "I x " or "i x "
    /^\s*l\s+x\s+/i,            // "l x "
    /^\s*\d+\s*x\s+/i,          // "2 x " (with space)
  ];
  
  for (const pattern of quantityPatterns) {
    if (pattern.test(name)) {
      name = name.replace(pattern, '').trim();
      break; // Only remove first match
    }
  }
  
  // Step 2: Remove ALL money tokens (prices)
  // Pattern: \b\d{1,3}[\.\-]\d{2}\b (handles 10.50, 10-50, 529.95, etc.)
  const pricePattern = /\$?\s*\d{1,3}[\.\-]\d{2}\b/g;
  name = name.replace(pricePattern, '').trim();
  
  // Also remove standalone dollar amounts
  name = name.replace(/\$\s*\d+\.\d{2}\b/g, '').trim();
  
  // Step 3: Remove trailing tax code "A"
  name = name.replace(/\s+A\s*$/, '').trim();
  
  // Step 4: Remove trailing garbage tokens
  const garbagePatterns = [
    /\s+[a-z]{1,2}\s*$/i,           // Single/double letters: "or", "aa", "gg"
    /\s+"\d+\s*S\d+\s*"\s*$/,       // Quoted codes: "7 S405"
    /\s+[A-Z]\d+\s*$/,              // Letter+digits: "S405"
    /\s+\d+\.\d{3,}\s*$/,           // Malformed prices: "95.954"
    /\s+\d+\s*x\s+\$\d+\.\d+\s*$/,  // Duplicate price info: "7 × $4.28"
  ];
  
  for (const pattern of garbagePatterns) {
    const before = name;
    name = name.replace(pattern, '').trim();
    if (before !== name) {
      break; // Only remove first match
    }
  }
  
  // Step 5: Clean up quotes and punctuation
  name = name
    .replace(/^["']+|["']+$/g, '')  // Remove leading/trailing quotes
    .replace(/\s+/g, ' ')            // Collapse multiple spaces
    .trim();
  
  // Step 6: Validate minimum length
  // If name becomes too short, try a safer extraction
  if (name.length < 3) {
    // Fallback: extract letters-only tokens before first price
    const fallbackMatch = originalLine.match(/^([a-zA-Z\s&]+?)(?:\s+\d+[\.\-]\d{2}|\s+\$)/);
    if (fallbackMatch && fallbackMatch[1].trim().length >= 3) {
      name = fallbackMatch[1].trim();
    } else {
      // Last resort: keep original but remove obvious garbage
      name = originalLine
        .replace(/^\s*\d+\s*[xX]\s+/i, '')
        .replace(/\s+[a-z]{1,2}\s*$/i, '')
        .trim();
    }
  }
  
  // Final cleanup: remove any remaining trailing junk
  name = name.replace(/\s+[a-z]{1,2}\s*$/i, '').trim();
  
  return name;
}
