/**
 * OCR Result Scoring and Selection
 * 
 * Scores OCR results to select the best output for receipt parsing.
 */

import type { OCRResult } from './engine';

export interface ScoredResult {
  result: OCRResult;
  score: number;
  itemLineCount: number;
  keywordCount: number;
  reasons: string[];
}

/**
 * Receipt keywords that indicate valid receipt text
 */
const RECEIPT_KEYWORDS = [
  'SUBTOTAL', 'TOTAL', 'GST', 'TAX', 'EFTPOS', 'BILL', 'INVOICE',
  'RECEIPT', 'AMOUNT', 'DUE', 'BALANCE', 'PAYMENT', 'CASH', 'CARD',
  'DATE', 'TIME', 'MERCHANT', 'RESTAURANT', 'CAFE', 'STORE'
];

/**
 * Score OCR results to find the best one
 */
export function scoreOCRResults(results: OCRResult[]): ScoredResult[] {
  return results.map(result => {
    const score = calculateScore(result);
    return {
      result,
      score: score.total,
      itemLineCount: score.itemLineCount,
      keywordCount: score.keywordCount,
      reasons: score.reasons,
    };
  }).sort((a, b) => b.score - a.score); // Highest score first
}

/**
 * Calculate score for a single OCR result
 */
function calculateScore(result: OCRResult): {
  total: number;
  itemLineCount: number;
  keywordCount: number;
  reasons: string[];
} {
  const text = result.text;
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const reasons: string[] = [];
  let score = 0;
  
  // 1. Item-like lines count
  let itemLineCount = 0;
  const quantityPattern = /^\s*\d+\s*[xX]?\s+/;
  const pricePattern = /\d+\.\d{2}|\$\d+\.\d{2}/;
  
  for (const line of lines) {
    const hasQuantity = quantityPattern.test(line);
    const hasPrice = pricePattern.test(line);
    
    if (hasQuantity && hasPrice) {
      itemLineCount++;
      score += 20; // Bonus for lines with both quantity and price
      reasons.push(`Item line with qty and price: ${line.substring(0, 30)}`);
    } else if (hasQuantity) {
      score += 10; // Has quantity but no price
    } else if (hasPrice) {
      score += 10; // Has price but no quantity
    }
  }
  
  if (itemLineCount > 0) {
    reasons.push(`Found ${itemLineCount} item-like lines`);
  }
  
  // 2. Receipt keywords bonus
  const upperText = text.toUpperCase();
  let keywordCount = 0;
  for (const keyword of RECEIPT_KEYWORDS) {
    if (upperText.includes(keyword)) {
      keywordCount++;
      score += 10;
    }
  }
  
  if (keywordCount > 0) {
    reasons.push(`Found ${keywordCount} receipt keywords`);
  }
  
  // 3. Text quality
  let linesWithLettersAndNumbers = 0;
  for (const line of lines) {
    const hasLetters = /[A-Za-z]/.test(line);
    const hasNumbers = /\d/.test(line);
    if (hasLetters && hasNumbers) {
      linesWithLettersAndNumbers++;
      score += 5;
    }
  }
  
  if (linesWithLettersAndNumbers > 0) {
    reasons.push(`${linesWithLettersAndNumbers} lines with letters and numbers`);
  }
  
  // 4. Structure bonus
  if (lines.length > 0) {
    score += Math.min(lines.length * 2, 40); // Up to 40 points for line count
    reasons.push(`${lines.length} lines detected`);
  }
  
  // Check for consistent formatting (similar patterns)
  const priceLines = lines.filter(l => pricePattern.test(l));
  if (priceLines.length >= 3) {
    score += 10;
    reasons.push('Consistent price formatting detected');
  }
  
  // 5. Penalties
  if (text.length < 50) {
    score -= 20;
    reasons.push('Text too short (penalty)');
  }
  
  // Check for garbage symbols (>50% non-alphanumeric)
  const alphanumericCount = (text.match(/[A-Za-z0-9]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars > 0) {
    const alphanumericRatio = alphanumericCount / totalChars;
    if (alphanumericRatio < 0.5) {
      score -= 30;
      reasons.push('Too many non-alphanumeric characters (penalty)');
    }
  }
  
  // Confidence bonus
  score += result.confidence * 10; // Up to 10 points for confidence
  if (result.confidence > 0.8) {
    reasons.push('High OCR confidence');
  }
  
  return {
    total: Math.max(0, score), // Don't go negative
    itemLineCount,
    keywordCount,
    reasons,
  };
}

/**
 * Select best OCR result
 */
export function selectBestOCRResult(
  scoredResults: ScoredResult[]
): ScoredResult | null {
  if (scoredResults.length === 0) {
    return null;
  }
  
  // Return highest scoring result
  return scoredResults[0];
}

/**
 * Check if result is low confidence
 */
export function isLowConfidence(scoredResult: ScoredResult): boolean {
  return scoredResult.score < 50;
}
