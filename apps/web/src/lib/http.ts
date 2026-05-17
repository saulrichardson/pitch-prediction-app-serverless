import { NextResponse } from "next/server";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "http_error") {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function ok<T>(body: T): NextResponse<T> {
  return NextResponse.json(body);
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function requestError(message: string, code = "bad_request") {
  return new HttpError(400, message, code);
}

export function unauthorized(message: string, code = "unauthorized") {
  return new HttpError(401, message, code);
}

export function notFound(message: string, code = "not_found") {
  return new HttpError(404, message, code);
}

export function conflict(message: string, code = "conflict") {
  return new HttpError(409, message, code);
}

export function gone(message: string, code = "gone") {
  return NextResponse.json({ error: message, code }, { status: 410 });
}

export function serviceUnavailable(message: string, code = "service_unavailable") {
  return new HttpError(503, message, code);
}

export async function readJson(request: Request, options: { optional?: boolean } = {}): Promise<unknown> {
  const body = await request.text();
  if (!body.trim()) {
    if (options.optional) return {};
    throw requestError("Request body must be valid JSON.");
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw requestError("Request body must be valid JSON.");
  }
}

export async function readJsonObject(request: Request, options: { optional?: boolean } = {}): Promise<Record<string, unknown>> {
  const value = await readJson(request, options);
  if (!isJsonObject(value)) {
    throw requestError("Request body must be a JSON object.", "invalid_json_object");
  }
  return value;
}

export function serverError(error: unknown) {
  if (error instanceof HttpError) {
    if (error.status >= 500) {
      console.error(JSON.stringify({ level: "error", code: error.code, message: error.message, status: error.status }));
    }
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }

  console.error(JSON.stringify({ level: "error", error: serializeError(error) }));
  return NextResponse.json({ error: "Unexpected server error.", code: "unexpected_server_error" }, { status: 500 });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return { message: String(error) };
}
