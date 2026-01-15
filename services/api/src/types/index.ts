/**
 * API Types
 */

export interface ApiErrorResponse {
  ok: false;
  code: string;
  message: string;
  details?: any;
}

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
