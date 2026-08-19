import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const source = (file: string) => readFileSync(resolve(import.meta.dir, file), "utf8");

describe("terminal image attach", () => {
  test("uploads multipart images through apiFetch and exposes both attach controls", () => {
    const modal = source("TerminalModal.tsx");
    const view = source("TerminalView.tsx");
    const upload = source("../lib/terminalImageUpload.ts");

    expect(modal).toContain("uploadTerminalImage");
    expect(view).toContain("uploadTerminalImage");
    expect(modal).toContain('accept="image/png,image/jpeg,image/webp,image/gif"');
    expect(view).toContain('accept="image/png,image/jpeg,image/webp,image/gif"');
    expect(upload).toContain('apiFetch("/api/file", { method: "POST", body: form })');
    expect(upload).not.toMatch(/\bfetch\s*\(/);
    expect(upload).not.toMatch(/Content-Type|localStorage|sessionStorage|document\.cookie|location\.|console\./);
  });
});
