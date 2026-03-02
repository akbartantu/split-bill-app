import OpenAI from 'openai';
import { createError } from '../../middleware/errorHandler.js';
let openaiClient = null;
function getOpenAIClient() {
    if (!process.env.OPENAI_API_KEY) {
        throw createError('OPENAI_API_KEY is not configured. Set it in your environment.', 500, 'OPENAI_NOT_CONFIGURED');
    }
    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openaiClient;
}
/**
 * Use OpenAI to turn raw OCR text into structured receipt data.
 *
 * Pipeline context (high‑level):
 *
 * 1) Text Detection        – handled upstream by document detection + Sharp
 * 2) Text Recognition      – handled by runOpenAIOCR (vision model → raw text)
 * 3) Layout Understanding  – done by the model over OCR text (group lines, find items & summary)
 * 4) Semantic Parsing      – produce deterministic JSON with items + summary fields
 *
 * This function is responsible for stages (3) and (4) and for applying a
 * lightweight validation layer with an optional single retry.
 */
export async function parseReceiptWithOpenAI(ocrText, requestId) {
    if (!process.env.OPENAI_API_KEY) {
        throw createError('OPENAI_API_KEY is not configured. Set it in your environment.', 500, 'OPENAI_NOT_CONFIGURED');
    }
    if (!ocrText || !ocrText.trim()) {
        throw createError('OCR text is empty', 400, 'EMPTY_OCR_TEXT');
    }
    if (process.env.LOG_LEVEL === 'debug') {
        console.log('[OpenAI Parser]', {
            requestId,
            textLength: ocrText.length,
        });
    }
    try {
        const client = getOpenAIClient();
        /**
         * Helper that calls OpenAI once with a deterministic JSON schema.
         * This function only concerns itself with layout understanding +
         * semantic parsing over the OCR text.
         */
        const callOnce = async (purpose, previousJson) => {
            const systemPurpose = purpose === 'initial'
                ? 'You are a receipt parser. Given messy OCR text, extract clean structured data.'
                : 'You are a receipt parser fixing inconsistencies between line items and summary totals.';
            const userPrompt = purpose === 'initial'
                ? `
Here is OCR text from a shopping or restaurant receipt. It may contain noise, line breaks, and OCR mistakes.

Return ONLY valid JSON with this shape (no extra keys, no comments):

{
  "items": [
    {
      "name": "string",
      "quantity": number | null,
      "unitPrice": number | null,
      "totalPrice": number | null
    }
  ],
  "subtotal": number | null,
  "gst": number | null,
  "tax": number | null,
  "total": number | null,
  "totalPaid": number | null
}

Rules:
- Do not invent items that clearly do not exist.
- If quantity is not explicit, use null.
- Use numbers (not strings) for money values.
- Prefer the final total printed on the receipt for \"total\" / \"totalPaid\".
- If subtotal, gst, tax, total, or totalPaid cannot be confidently determined, set them to null.
- If a line is unreadable, set its numeric fields to null instead of guessing.

OCR TEXT:
---
${ocrText}
---
`
                : `
You previously produced this JSON for the receipt:
${JSON.stringify(previousJson ?? {}, null, 2)}

Recalculate and correct any inconsistencies between:
- the sum of item totalPrice values
- subtotal / gst / tax / total / totalPaid

Return ONLY corrected JSON in the exact same shape as before (no explanations, no comments).
`;
            const response = await client.chat.completions.create({
                model: 'gpt-4.1-mini',
                temperature: 0,
                max_tokens: 800,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: systemPurpose,
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: userPrompt,
                            },
                        ],
                    },
                ],
            });
            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw createError('OpenAI parser returned empty content', 500, 'OPENAI_PARSE_EMPTY');
            }
            const parsed = JSON.parse(content);
            if (!parsed.items || !Array.isArray(parsed.items)) {
                throw createError('OpenAI parser returned invalid structure (missing items array)', 500, 'OPENAI_PARSE_INVALID');
            }
            return parsed;
        };
        // First pass: let the model propose items + summary.
        let parsed = await callOnce('initial');
        // Lightweight validation – if clearly inconsistent, attempt one correction pass.
        const { isValid, shouldRequery } = validateReceiptTotals(parsed);
        if (shouldRequery) {
            parsed = await callOnce('correction', parsed);
        }
        return parsed;
    }
    catch (error) {
        if (process.env.LOG_LEVEL === 'debug') {
            console.error('[OpenAI Parser] Failed', {
                requestId,
                error: error?.message || String(error),
            });
        }
        if (error.statusCode) {
            throw error;
        }
        throw createError(`OpenAI receipt parsing failed: ${error.message || String(error)}`, 500, 'OPENAI_PARSE_ERROR', { originalError: error.message || String(error) });
    }
}
/**
 * Validate basic numeric consistency of an AI‑parsed receipt.
 *
 * This is intentionally conservative – it only flags obviously inconsistent
 * totals and tells the caller whether a second OpenAI pass is warranted.
 */
export function validateReceiptTotals(receipt, tolerance = 0.05) {
    if (!receipt.items || receipt.items.length === 0) {
        return { isValid: true, difference: 0, shouldRequery: false };
    }
    const sumOfItems = receipt.items.reduce((sum, item) => {
        const value = typeof item.totalPrice === 'number' ? item.totalPrice : 0;
        return sum + value;
    }, 0);
    const subtotal = typeof receipt.subtotal === 'number'
        ? receipt.subtotal
        : typeof receipt.totalPaid === 'number'
            ? receipt.totalPaid
            : typeof receipt.total === 'number'
                ? receipt.total
                : null;
    if (subtotal == null) {
        return { isValid: true, difference: 0, shouldRequery: false };
    }
    const difference = Math.abs(sumOfItems - subtotal);
    const isValid = difference <= tolerance;
    return {
        isValid,
        difference,
        shouldRequery: !isValid,
    };
}
