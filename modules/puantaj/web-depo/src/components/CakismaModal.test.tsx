import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tarama } from "../lib/api";
import CakismaModal from "./CakismaModal";


const sonuc: Tarama = {
  durum: "cakisma",
  mesaj: "Bu seri birden fazla stokta var.",
  seri: "RW313131",
  raw_input: "RW313131",
  resolved_serial: "RW313131",
  cakisan_secenekler: [
    {
      seri_id: 10,
      stok_id: 20,
      stok_kodu: "1132",
      urun_adi: "Test urun",
      sayildi: false,
      eslesme_tipi: "seri",
      barkod_stokuyla_uyumlu_mu: null,
    },
  ],
};


describe("CakismaModal", () => {
  it("cakisma detaylarini gosterir ve secimi dondurur", () => {
    const onSec = vi.fn();
    render(
      <CakismaModal sonuc={sonuc} onSec={onSec} onClose={vi.fn()} />,
    );
    expect(screen.getByText("Stok seçimi gerekli")).toBeInTheDocument();
    expect(screen.getAllByText("RW313131")).toHaveLength(2);
    fireEvent.click(screen.getByText("1132"));
    expect(onSec).toHaveBeenCalledWith(sonuc.cakisan_secenekler?.[0]);
  });
});
