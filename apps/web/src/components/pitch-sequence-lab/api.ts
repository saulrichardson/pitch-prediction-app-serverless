export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "request_failed") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw await apiError(response);
  return response.json() as Promise<T>;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw await apiError(response);
  return response.json() as Promise<T>;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

async function apiError(response: Response): Promise<ApiError> {
  const payload = await response.json().catch(() => null) as unknown;
  const message = isErrorPayload(payload) && typeof payload.error === "string" ? payload.error : `Request failed: ${response.status}`;
  const code = isErrorPayload(payload) && typeof payload.code === "string" ? payload.code : "request_failed";
  return new ApiError(response.status, message, code);
}

function isErrorPayload(payload: unknown): payload is { error?: unknown; code?: unknown } {
  return Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
}
