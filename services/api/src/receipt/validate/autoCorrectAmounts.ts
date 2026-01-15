/**
 * Auto-Correction for OCR Amount Errors (Server-Side)
 */

export interface CorrectionResult {
  corrected: boolean;
  originalValue: number;
  correctedValue: number;
  correctionType: 'extra_digit' | 'missing_decimal' | 'shifted_decimal' | 'none';
  confidence: number;
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

export function autoCorrectAmount(
  value: number,
  context: ReceiptContext
): CorrectionResult {
  const originalValue = value;
  
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

  if (value > avgTotal * 8 && value > 100) {
    const valueStr = value.toFixed(2);
    // Check if it has 3+ digits before decimal (e.g., "529.95" has 3 digits)
    const digitsBeforeDecimal = valueStr.split('.')[0].length;
    if (digitsBeforeDecimal >= 3) {
      // Remove first digit: "529.95" -> "29.95"
      const withoutFirstDigit = parseFloat(valueStr.substring(1));
      const ratio = withoutFirstDigit / avgTotal;
      
      if (ratio > 0.3 && ratio < 3.0 && Math.abs(withoutFirstDigit - medianTotal) < Math.abs(value - medianTotal)) {
        return {
          corrected: true,
          originalValue,
          correctedValue: withoutFirstDigit,
          correctionType: 'extra_digit',
          confidence: 0.7,
        };
      }
    }
  }

  if (value === Math.floor(value) && value > 10 && value < 10000) {
    const valueStr = Math.floor(value).toString();
    
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
          confidence: 0.6,
        };
      }
    }
  }

  const valueStr = value.toFixed(2);
  if (valueStr.includes('.') && value < 100 && value > 0) {
    const parts = valueStr.split('.');
    if (parts[1] && parts[1].length >= 2) {
      const shifted = parseFloat(parts[0] + parts[1].substring(0, 1) + '.' + parts[1].substring(1));
      const ratio = shifted / avgTotal;
      
      if (ratio > 0.5 && ratio < 2.0 && Math.abs(shifted - medianTotal) < Math.abs(value - medianTotal)) {
        return {
          corrected: true,
          originalValue,
          correctedValue: shifted,
          correctionType: 'shifted_decimal',
          confidence: 0.5,
        };
      }
    }
  }

  return {
    corrected: false,
    originalValue,
    correctedValue: value,
    correctionType: 'none',
    confidence: 0,
  };
}
