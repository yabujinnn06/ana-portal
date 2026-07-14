import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BarkodInput from "./BarkodInput";


describe("BarkodInput", () => {
  it("busy iken ikinci submit gondermez", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <BarkodInput onSubmit={onSubmit} busy />,
    );
    fireEvent.change(screen.getByPlaceholderText("Barkod veya seri numarası"), {
      target: { value: "RW313131" },
    });
    fireEvent.submit(container.querySelector("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("aktif ve bos degilse barkodu gonderir", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <BarkodInput onSubmit={onSubmit} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Barkod veya seri numarası"), {
      target: { value: "1132xRW313131" },
    });
    fireEvent.submit(container.querySelector("form")!);
    expect(onSubmit).toHaveBeenCalledWith("1132xRW313131");
  });
});
