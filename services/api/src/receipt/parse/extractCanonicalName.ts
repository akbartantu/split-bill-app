/**
 * Extract Canonical Item Name (Server-Side)
 * 
 * Same logic as client-side for consistency.
 */

export function extractCanonicalName(originalLine: string): string {
  let name = originalLine.trim();
  
  // Step 1: Remove leading quantity tokens
  const quantityPatterns = [
    /^\s*\d+\s*[xX]\s+/i,
    /^\s*[Ii]x\s+/i,
    /^\s*[Ii]\s+x\s+/i,
    /^\s*l\s+x\s+/i,
    /^\s*\d+\s*x\s+/i,
  ];
  
  for (const pattern of quantityPatterns) {
    if (pattern.test(name)) {
      name = name.replace(pattern, '').trim();
      break;
    }
  }
  
  // Step 2: Remove ALL money tokens
  const pricePattern = /\$?\s*\d{1,3}[\.\-]\d{2}\b/g;
  name = name.replace(pricePattern, '').trim();
  name = name.replace(/\$\s*\d+\.\d{2}\b/g, '').trim();
  
  // Step 3: Remove trailing tax code "A"
  name = name.replace(/\s+A\s*$/, '').trim();
  
  // Step 4: Remove trailing garbage tokens
  const garbagePatterns = [
    /\s+[a-z]{1,2}\s*$/i,
    /\s+"\d+\s*S\d+\s*"\s*$/,
    /\s+[A-Z]\d+\s*$/,
    /\s+\d+\.\d{3,}\s*$/,
    /\s+\d+\s*x\s+\$\d+\.\d+\s*$/,
  ];
  
  for (const pattern of garbagePatterns) {
    const before = name;
    name = name.replace(pattern, '').trim();
    if (before !== name) {
      break;
    }
  }
  
  // Step 5: Clean up quotes and spaces
  name = name
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Step 6: Validate minimum length with fallback
  if (name.length < 3) {
    const fallbackMatch = originalLine.match(/^([a-zA-Z\s&]+?)(?:\s+\d+[\.\-]\d{2}|\s+\$)/);
    if (fallbackMatch && fallbackMatch[1].trim().length >= 3) {
      name = fallbackMatch[1].trim();
    } else {
      name = originalLine
        .replace(/^\s*\d+\s*[xX]\s+/i, '')
        .replace(/\s+[a-z]{1,2}\s*$/i, '')
        .trim();
    }
  }
  
  name = name.replace(/\s+[a-z]{1,2}\s*$/i, '').trim();
  
  return name;
}
