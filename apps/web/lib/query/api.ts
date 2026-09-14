export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`${status} ${path}`);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new ApiError(res.status, path);
  }
  return res.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE", headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new ApiError(res.status, path);
  }
  return res.json() as Promise<T>;
}
