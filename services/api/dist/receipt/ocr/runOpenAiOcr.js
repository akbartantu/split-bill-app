import OpenAI from 'openai';
import { createError } from '../../middleware/errorHandler';
let openAiClient = null;
function getClient() {
    if (!process.env.OPENAI_API_KEY) {
        throw createError('OPENAI_API_KEY is not configured. Please set it in your environment.', 500, 'OPENAI_NOT_CONFIGURED');
    }
    if (!openAiClient) {
        openAiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openAiClient;
}
/**
 * Run OCR using OpenAI vision models.
 *
 * DESIGN NOTE:
 *  - We deliberately send the **entire receipt image** to OpenAI in one go.
 *  - We do NOT crop into regions or bounding boxes, because web-style / digital
 *    receipts depend heavily on full-layout context (line wrapping, alignment,
 *    multi-line items). Manual region-based cropping can truncate words like
 *    "GARLIC SAUCE" into "GAR" / "SAUCE" and break model understanding.
 *  - Thermal paper receipts sometimes tolerate aggressive cropping, but for a
 *    unified pipeline (thermal + web), we keep the full image and let the model
 *    perform its own layout understanding internally.
 *
 * The function returns a raw text transcription suitable for downstream
 * structured parsing.
 */
export async function runOpenAIOCR(imageBuffer, timeout) {
    if (!imageBuffer || imageBuffer.length === 0) {
        throw createError('Image buffer is empty', 400, 'EMPTY_BUFFER');
    }
    const client = getClient();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeout);
    try {
        // Entire image is base64-encoded and sent as a single input_image.
        const base64 = imageBuffer.toString('base64');
        const response = await client.responses.create({
            model: 'gpt-4.1-mini',
            input: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: 'You are an OCR engine for receipts. Transcribe all visible text as accurately as possible. ' +
                                'Return ONLY the raw text, preserving line breaks. Do not add explanations, labels, or formatting.',
                        },
                        {
                            type: 'input_image',
                            image_url: `data:image/jpeg;base64,${base64}`,
                            detail: 'high',
                        },
                    ],
                },
            ],
            max_output_tokens: 2048,
        }, {
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const raw = response;
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/99008303-f723-4305-84a5-02cdad73559b', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: `log_${Date.now()}_openai_ocr`,
                timestamp: Date.now(),
                runId: 'ocr',
                hypothesisId: 'H1',
                location: 'runOpenAiOcr.ts:response',
                message: 'Raw OpenAI OCR response received',
                data: {
                    hasOutput: !!raw.output,
                    outputLength: Array.isArray(raw.output) ? raw.output.length : 0,
                },
            }),
        }).catch(() => { });
        // #endregion
        const output0 = raw.output?.[0];
        const content0 = output0?.content?.[0];
        // Prefer structured JSON (response_format JSON) when available.
        const parsed = content0?.parsed ?? raw.output_parsed ?? content0?.parsed_output ?? null;
        let textBlock = '';
        let itemsEmpty = false;
        if (parsed != null) {
            const items = parsed.items;
            if (Array.isArray(items) && items.length === 0) {
                itemsEmpty = true;
            }
            textBlock = JSON.stringify(parsed);
        }
        else {
            // Fallback to plain text; missing text is NOT considered a failure.
            textBlock = content0?.text?.value ?? '';
        }
        const content = (textBlock || '').trim();
        // Only treat as "empty OCR" if there is no output object at all,
        // or if the structured JSON explicitly has an empty items array.
        if (!output0 || !content0 || itemsEmpty) {
            throw createError('OpenAI OCR returned no usable content', 500, 'OPENAI_OCR_EMPTY');
        }
        return {
            text: content,
            // Confidence is approximate – OpenAI does not return a numeric score.
            confidence: 0.9,
            rawData: null,
        };
    }
    catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw createError('OpenAI OCR timeout - processing took too long', 408, 'OPENAI_OCR_TIMEOUT');
        }
        // If this is already an API error from our error handler, rethrow it.
        if (error.statusCode) {
            throw error;
        }
        throw createError(`OpenAI OCR failed: ${error.message || String(error)}`, 500, 'OPENAI_OCR_ERROR');
    }
}
