/**
 * Auto-Correction for OCR Amount Errors
 * 
 * Attempts to correct common OCR errors in prices:
 * - Extra leading digit (529.95 -> 29.95)
 * - Missing decimal (2995 -> 29.95)
 * - Shifted decimal (2.995 -> 29.95)
 * 
 * IMPORTANT: Never silently fix - always track corrections with metadata
 */

export interface CorrectionResult {
  corrected: boolean;
  originalValue: number;
  correctedValue: number;
  correctionType: 'extra_digit' | 'missing_decimal' | 'shifted_decimal' | 'none';
  confidence: number; // 0-1, how confident we are in the correction
}

export interface ReceiptContext {
  items: Array<{
    lineTotal: number;
    quantity: number;
    unitPrice: number | null;
  }>;
  receiptTotal?: number;
  subtotal?: number;
}

/**
 * Attempt to auto-correct a suspicious price
 * 
 * Returns correction if confident, otherwise returns original
 */
export function autoCorrectAmount(
  value: number,
  context: ReceiptContext
): CorrectionResult {
  const originalValue = value;
  
  // Only attempt correction if we have context
  if (context.items.length === 0) {
    return {
      corrected: false,
      originalValue,
      correctedValue: value,
      correctionType: 'none',
      confidence: 0,
    };
  }

  const otherItems = context.items.filter(i => i.lineTotal !== value);
  if (otherItems.length === 0) {
    return {
      corrected: false,
      originalValue,
      correctedValue: value,
      correctionType: 'none',
      confidence: 0,
    };
  }

  const avgTotal = otherItems.reduce((sum, i) => sum + i.lineTotal, 0) / otherItems.length;
  const medianTotal = [...otherItems]
    .map(i => i.lineTotal)
    .sort((a, b) => a - b)[Math.floor(otherItems.length / 2)];

  // Strategy 1: Extra leading digit
  // If value is ~10x larger than average, try removing first digit
  if (value > avgTotal * 8 && value > 100) {
    const valueStr = value.toFixed(2);
    // Check if it has 3+ digits before decimal (e.g., "529.95" has 3 digits)
    const digitsBeforeDecimal = valueStr.split('.')[0].length;
    if (digitsBeforeDecimal >= 3) {
      // Remove first digit: "529.95" -> "29.95"
      const withoutFirstDigit = parseFloat(valueStr.substring(1));
      const ratio = withoutFirstDigit / avgTotal;
      
      // If removing first digit brings it closer to average
      if (ratio > 0.3 && ratio < 3.0 && Math.abs(withoutFirstDigit - medianTotal) < Math.abs(value - medianTotal)) {
        return {
          corrected: true,
          originalValue,
          correctedValue: withoutFirstDigit,
          correctionType: 'extra_digit',
          confidence: 0.7, // Medium confidence
        };
      }
    }
  }

  // Strategy 2: Missing decimal (integer that should have decimal)
  // e.g., 2995 should be 29.95
  if (value === Math.floor(value) && value > 10 && value < 10000) {
    // Try inserting decimal at different positions
    const valueStr = Math.floor(value).toString();
    
    // Try 2 decimal places (most common)
    if (valueStr.length >= 3) {
      const withDecimal = parseFloat(
        valueStr.slice(0, -2) + '.' + valueStr.slice(-2)
      );
      const ratio = withDecimal / avgTotal;
      
      if (ratio > 0.3 && ratio < 3.0 && Math.abs(withDecimal - medianTotal) < Math.abs(value - medianTotal)) {
        return {
          corrected: true,
          originalValue,
          correctedValue: withDecimal,
          correctionType: 'missing_decimal',
          confidence: 0.6, // Lower confidence - could be wrong
        };
      }
    }
  }

  // Strategy 3: Shifted decimal (e.g., 2.995 -> 29.95)
  // This is less common, so lower confidence
  const valueStr = value.toFixed(2);
  if (valueStr.includes('.') && value < 100 && value > 0) {
    // If value is small but has many decimal places, might be shifted
    const parts = valueStr.split('.');
    if (parts[1] && parts[1].length >= 2) {
      // Try moving decimal one place right
      const shifted = parseFloat(parts[0] + parts[1].substring(0, 1) + '.' + parts[1].substring(1));
      const ratio = shifted / avgTotal;
      
      if (ratio > 0.5 && ratio < 2.0 && Math.abs(shifted - medianTotal) < Math.abs(value - medianTotal)) {
        return {
          corrected: true,
          originalValue,
          correctedValue: shifted,
          correctionType: 'shifted_decimal',
          confidence: 0.5, // Low confidence - risky correction
        };
      }
    }
  }

  // No correction applied
  return {
    corrected: false,
    originalValue,
    correctedValue: value,
    correctionType: 'none',
    confidence: 0,
  };
}
