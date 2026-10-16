const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
let memoryToken: string | null = null;
export function getToken() {
  try { return sessionStorage.getItem('ic-session') || memoryToken; } catch { return memoryToken; }
}
export function setToken(token: string | null) {
  memoryToken = token;
  try { if (token) sessionStorage.setItem('ic-session', token); else sessionStorage.removeItem('ic-session'); } catch { /* Memory-only session when storage is unavailable. */ }
}
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const token = getToken();
    const response = await fetch(`${base}/api/v1${path}`, {
      ...options, signal: controller.signal,
      headers: { ...(options.body instanceof Blob ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(typeof body.detail === 'string' ? body.detail : 'Проверьте заполненные поля и попробуйте ещё раз.', response.status);
    }
    return response.status === 204 ? undefined as T : response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Не удалось связаться с сервером. Проверьте соединение и повторите действие.', 0);
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
}

export async function fileBlob(id: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(`${base}/api/v1/files/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${getToken() || ''}` }, signal,
  });
  if (!response.ok) throw new ApiError(response.status === 401 ? 'Сеанс завершён. Войдите снова.' : 'Не удалось открыть файл. Попробуйте ещё раз.', response.status);
  return response.blob();
}
