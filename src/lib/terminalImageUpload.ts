import { apiFetch } from "./api";

type UploadResponse = {
  success?: boolean;
  saved?: Array<{ path?: string }>;
  errors?: Array<{ reason?: string }>;
};

export async function uploadTerminalImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await apiFetch("/api/file", { method: "POST", body: form });
  const data: UploadResponse | null = await response.json().catch(() => null);
  const path = data?.saved?.[0]?.path;
  if (!response.ok || !data?.success || !path) {
    throw new Error(data?.errors?.[0]?.reason || `HTTP ${response.status}`);
  }
  return path;
}
