import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";


describe("api.tara", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stok ve seri secimini backend payloadina ekler", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ durum: "basarili", mesaj: "ok", seri: "RW313131" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.tara(7, "RW313131", {
      secilen_seri_id: 10,
      secilen_stok_id: 20,
    }, "scan-123");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      oturum_id: 7,
      seri: "RW313131",
      client_scan_id: "scan-123",
      secilen_seri_id: 10,
      secilen_stok_id: 20,
    });
    vi.unstubAllGlobals();
  });
});
