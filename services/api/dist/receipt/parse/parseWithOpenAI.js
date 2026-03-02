import OpenAI from 'openai';
import { createError } from '../../middleware/errorHandler';
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
function parseMoney(input) {
    if (input == null)
        return null;
    if (typeof input === 'number' && Number.isFinite(input)) {
        return parseFloat(input.toFixed(2));
    }
    if (typeof input !== 'string')
        return null;
    const cleaned = input.replace(/[^0-9.,-]/g, '').replace(',', '');
    if (!cleaned)
        return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? parseFloat(num.toFixed(2)) : null;
}
function sumTotalPrices(items) {
    return items.reduce((sum, item) => sum + item.totalPrice, 0);
}
function findLargestMoneyInText(text) {
    const moneyRegex = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2}))/g;
    let match;
    let max = null;
    while ((match = moneyRegex.exec(text)) !== null) {
        const value = parseMoney(match[1]);
        if (value != null && (max == null || value > max)) {
            max = value;
        }
    }
    return max;
}
function extractTextSummary(ocrText) {
    const lines = ocrText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    let subtotalFromTotalLine = null;
    let gstIncluded = null;
    const totalLineRegex = /Total\s*\(\s*\d+\s+items?\s*\)\s*\$?\s*([0-9.,]+)\b/i;
    const gstIncludedRegex = /Taxes\s+included\s+in\s+total\s*\$?\s*([0-9.,]+)\b/i;
    for (const line of lines) {
        const totalMatch = totalLineRegex.exec(line);
        if (totalMatch) {
            subtotalFromTotalLine = parseMoney(totalMatch[1]);
        }
        const gstMatch = gstIncludedRegex.exec(line);
        if (gstMatch) {
            gstIncluded = parseMoney(gstMatch[1]);
        }
    }
    const largestOnPage = findLargestMoneyInText(ocrText);
    return { subtotalFromTotalLine, gstIncluded, largestOnPage };
}
function filterModelItems(items) {
    if (!Array.isArray(items))
        return [];
    return items.filter((item) => {
        const name = (item.name || '').trim();
        if (!name)
            return false;
        if (!/[A-Za-z0-9]/.test(name))
            return false;
        const upper = name.toUpperCase();
        if (upper === '*BILL*')
            return false;
        if (upper.includes('SUBTOTAL'))
            return false;
        if (upper.includes('GST'))
            return false;
        if (upper.includes('TOTAL'))
            return false;
        if (name.length < 3)
            return false;
        return true;
    });
}
function normalizeQuantities(items) {
    const qtyRegex = /^(\d+)\s*x\s+/i;
    return items.map((item) => {
        let name = item.name || '';
        let quantity = item.quantity;
        const match = qtyRegex.exec(name);
        if (match) {
            const q = Number(match[1]);
            if (Number.isFinite(q) && q > 0) {
                quantity = q;
                name = name.replace(qtyRegex, '');
            }
        }
        if (quantity == null || quantity <= 0) {
            quantity = 1;
        }
        return {
            ...item,
            name,
            quantity,
        };
    });
}
function reconstructPrices(items) {
    return items.map((item) => {
        const q = item.quantity && item.quantity > 0 ? item.quantity : 1;
        let unit = parseMoney(item.unit_price);
        let total = parseMoney(item.total_price);
        if (unit != null && total == null && q > 1) {
            total = parseFloat((unit * q).toFixed(2));
        }
        if (total != null && unit == null && q > 1) {
            unit = parseFloat((total / q).toFixed(2));
        }
        return {
            ...item,
            unit_price: unit,
            total_price: total,
        };
    });
}
function cleanupNames(items) {
    return items.map((item) => {
        let name = (item.name || '').trim();
        name = name.replace(/^[^A-Za-z0-9]+/, '');
        return { ...item, name };
    });
}
function normalizeToAiParsedItems(items) {
    return items.map((item) => {
        const quantity = typeof item.quantity === 'number' && item.quantity > 0
            ? item.quantity
            : 1;
        let unit = parseMoney(item.unit_price);
        let total = parseMoney(item.total_price);
        if (unit == null && total != null) {
            unit = parseFloat((total / quantity).toFixed(2));
        }
        if (total == null && unit != null) {
            total = parseFloat((unit * quantity).toFixed(2));
        }
        unit = unit ?? 0;
        total = total ?? parseFloat((unit * quantity).toFixed(2));
        return {
            name: (item.name || '').trim(),
            quantity,
            unitPrice: unit,
            totalPrice: total,
        };
    });
}
export async function parseReceiptWithOpenAI(ocrText, requestId) {
    if (!ocrText || !ocrText.trim()) {
        return {
            success: false,
            data: {
                items: [],
                subtotal: null,
                gst: null,
                total_paid: null,
            },
            error: 'OCR text is empty',
        };
    }
    const client = getOpenAIClient();
    const systemPrompt = `
You are a high-accuracy receipt extraction engine.

Rules:
- Ignore decorative headers like '*BILL*'
- Ignore restaurant name, address, ABN, phone number
- Extract only line items that represent purchased goods
- Line item pattern usually:
    [quantity]x [item name] [unit price] [total price]
- If quantity missing, assume 1.
- Use spatial reasoning: item name is left-aligned, prices are right-aligned.
- If two prices exist on the same line:
    first is unit_price
    second is total_price
- Do NOT truncate item names.
- Do NOT guess missing characters.
- If unsure, return null.
- Return only valid JSON.
`.trim();
    const userPrompt = `
You will receive OCR text from a receipt. It may contain noise, line breaks, and OCR mistakes.

Return ONLY valid JSON in this exact shape (no extra keys, no comments):

{
  "items": [
    {
      "name": "string",
      "quantity": number | null,
      "unit_price": number | null,
      "total_price": number | null
    }
  ],
  "subtotal": number | null,
  "gst": number | null,
  "total_paid": number | null
}

If a value cannot be confidently read, set it to null instead of guessing.

OCR TEXT:
---
${ocrText}
---
`.trim();
    try {
        const completion = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            temperature: 0,
            response_format: { type: 'json_object' },
            max_tokens: 800,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt,
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
        const rawContent = completion.choices[0]?.message?.content ?? '';
        if (process.env.LOG_LEVEL === 'debug') {
            try {
                console.log('[OpenAI Raw Receipt JSON]', {
                    requestId,
                    raw: rawContent,
                });
            }
            catch {
                // ignore logging failures
            }
        }
        let model;
        try {
            model = JSON.parse(rawContent);
        }
        catch (err) {
            return {
                success: false,
                data: {
                    items: [],
                    subtotal: null,
                    gst: null,
                    total_paid: null,
                },
                error: `Failed to parse OpenAI JSON: ${err.message}`,
            };
        }
        const filtered = filterModelItems(model.items);
        const withQty = normalizeQuantities(filtered);
        const withPrices = reconstructPrices(withQty);
        const cleaned = cleanupNames(withPrices);
        const items = normalizeToAiParsedItems(cleaned);
        if (items.length === 0) {
            return {
                success: false,
                data: {
                    items: [],
                    subtotal: null,
                    gst: null,
                    total_paid: null,
                },
                error: 'No items extracted from receipt.',
            };
        }
        const summaryFromText = extractTextSummary(ocrText);
        const subtotalFromModel = parseMoney(model.subtotal);
        const subtotalFromTotalLine = summaryFromText.subtotalFromTotalLine;
        const calculatedSubtotal = sumTotalPrices(items);
        let subtotal = subtotalFromModel ??
            subtotalFromTotalLine ??
            (Number.isFinite(calculatedSubtotal)
                ? parseFloat(calculatedSubtotal.toFixed(2))
                : null);
        const gstFromModel = parseMoney(model.gst);
        const gstFromText = summaryFromText.gstIncluded;
        const gst = gstFromModel ?? gstFromText ?? null;
        const totalPaidFromModel = parseMoney(model.total_paid);
        const largestOnPage = summaryFromText.largestOnPage;
        let total_paid = totalPaidFromModel ??
            largestOnPage ??
            (subtotal != null ? subtotal : null);
        if (subtotal != null) {
            const diff = Math.abs(calculatedSubtotal - subtotal);
            if (diff > 0.05) {
                subtotal = parseFloat(calculatedSubtotal.toFixed(2));
            }
        }
        else {
            subtotal = parseFloat(calculatedSubtotal.toFixed(2));
        }
        if (total_paid == null && subtotal != null) {
            total_paid = subtotal;
        }
        return {
            success: true,
            data: {
                items,
                subtotal,
                gst,
                total_paid,
            },
        };
    }
    catch (error) {
        return {
            success: false,
            data: {
                items: [],
                subtotal: null,
                gst: null,
                total_paid: null,
            },
            error: `OpenAI receipt parsing failed: ${error.message || String(error)}`,
        };
    }
}
