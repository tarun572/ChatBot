export type ApiError = Error & {
  status?: number;
  code?: string;
};

export function getApiUrl(): string {
  return process.env.VITE_API_URL ?? 'http://localhost:3000';
}

export function createApiError(message: string, status = 500, code = 'api_error'): ApiError {
  const error = new Error(message) as ApiError;
  error.status = status;
  error.code = code;
  return error;
}
