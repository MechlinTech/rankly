import { describe, it, expect, vi, afterEach } from "vitest";
import { extractErrorMessage, postJson, UnauthorizedError } from "./api-client";

describe("api-client", () => {
  describe("extractErrorMessage", () => {
    it("extracts error from string property", () => {
      expect(extractErrorMessage({ error: "Something went wrong" })).toBe("Something went wrong");
    });

    it("extracts error from message property", () => {
      expect(extractErrorMessage({ message: "Invalid payload" })).toBe("Invalid payload");
    });

    it("extracts error from detail property", () => {
      expect(extractErrorMessage({ detail: "Gateway timeout from upstream" })).toBe("Gateway timeout from upstream");
    });

    it("extracts nested object error message", () => {
      expect(extractErrorMessage({ error: { message: "Internal provider error" } })).toBe("Internal provider error");
    });

    it("extracts formErrors from zod flattening", () => {
      expect(extractErrorMessage({ error: { formErrors: ["Field is required"] } })).toBe("Field is required");
    });

    it("extracts fieldErrors from zod flattening", () => {
      expect(extractErrorMessage({ error: { fieldErrors: { term: ["Term too short"] } } })).toBe("Term too short");
    });

    it("falls back gracefully when data is null or unknown", () => {
      expect(extractErrorMessage(null, "Custom fallback")).toBe("Custom fallback");
      expect(extractErrorMessage({}, "Custom fallback")).toBe("Custom fallback");
    });
  });

  describe("postJson", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("throws UnauthorizedError on 401", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
      } as Response);

      await expect(postJson("/api/test", {})).rejects.toThrow(UnauthorizedError);
    });

    it("formats 502 Bad Gateway responses with an informative message when response is HTML", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 502,
        ok: false,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
      } as unknown as Response);

      await expect(postJson("/api/test", {})).rejects.toThrow(/502 Bad Gateway/);
    });

    it("formats 504 Gateway Timeout responses with an informative message when response is HTML", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 504,
        ok: false,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
      } as unknown as Response);

      await expect(postJson("/api/test", {})).rejects.toThrow(/504 Gateway Timeout/);
    });

    it("returns JSON on 200 OK", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ success: true }),
      } as unknown as Response);

      const res = await postJson<{ success: boolean }>("/api/test", {});
      expect(res.success).toBe(true);
    });
  });
});
