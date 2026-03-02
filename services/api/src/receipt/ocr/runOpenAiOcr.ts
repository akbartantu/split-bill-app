import OpenAI from 'openai';
import { createError } from '../../middleware/errorHandler.js';
import type { OCRResult } from './runOcr.js';

let openAiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw createError(
      'OPENAI_API_KEY is not configured. Please set it in your environment.',
      500,
      'OPENAI_NOT_CONFIGURED'
    );
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
 * Returns plain text transcription suitable for existing parsing pipeline.
 */
export async function runOpenAIOCR(
  imageBuffer: Buffer,
  timeout: number
): Promise<OCRResult> {
  if (!imageBuffer || imageBuffer.length === 0) {
    throw createError('Image buffer is empty', 400, 'EMPTY_BUFFER');
  }

  const client = getClient();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const base64 = imageBuffer.toString('base64');

    const response = await client.chat.completions.create(
      {
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an OCR engine for receipts. Transcribe all visible text as accurately as possible. Return ONLY the raw text, preserving line breaks. Do not add explanations, labels, or formatting.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Transcribe this receipt image. Return only the text.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64}`,
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 2048,
      },
      {
        signal: controller.signal as any,
      }
    );

    clearTimeout(timeoutId);

    const content = response.choices[0]?.message?.content?.trim() ?? '';
    if (!content) {
      throw createError(
        'OpenAI OCR returned empty text',
        500,
        'OPENAI_OCR_EMPTY'
      );
    }

    return {
      text: content,
      // Confidence is approximate – OpenAI does not return a numeric score.
      confidence: 0.9,
      rawData: null,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw createError(
        'OpenAI OCR timeout - processing took too long',
        408,
        'OPENAI_OCR_TIMEOUT'
      );
    }

    // If this is already an API error from our error handler, rethrow it.
    if (error.statusCode) {
      throw error;
    }

    throw createError(
      `OpenAI OCR failed: ${error.message || String(error)}`,
      500,
      'OPENAI_OCR_ERROR'
    );
  }
}

