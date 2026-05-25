import { NextRequest, NextResponse } from 'next/server';
import type { ApiResponse } from '@/types';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(
  message: string,
  status = 400
): NextResponse<ApiResponse> {
  // Never expose internal errors to client
  const safeMessage = status >= 500 ? 'Internal server error' : message;
  return NextResponse.json(
    { success: false, error: safeMessage },
    { status }
  );
}

/** Wrap API route handler with error catching */
export function withErrorHandler<TArgs extends unknown[]>(
  handler: (req: NextRequest, ...args: TArgs) => Promise<NextResponse>
) {
  return async (req: NextRequest, ...args: TArgs): Promise<NextResponse> => {
    try {
      return await handler(req, ...args);
    } catch (error) {
      if (error instanceof AppError) {
        return apiError(error.message, error.statusCode);
      }

      console.error('[API Error]', {
        path: new URL(req.url).pathname,
        method: req.method,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      return apiError('Internal server error', 500);
    }
  };
}
