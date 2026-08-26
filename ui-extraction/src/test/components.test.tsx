import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NumberField, SelectField, TextField, Toggle } from "../components";
import { SidebarSection } from "../layout";

describe("SidebarSection", () => {
  it("renderiza children e abre/fecha a seção", async () => {
    const user = userEvent.setup();
    render(<SidebarSection title="Filtros"><span>Conteúdo genérico</span></SidebarSection>);
    const button = screen.getByRole("button", { name: "Filtros" });
    expect(screen.getByText("Conteúdo genérico")).toBeVisible();
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Conteúdo genérico").parentElement).toHaveAttribute("hidden");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("não dispara eventos quando está disabled", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<SidebarSection title="Avançado" disabled onOpenChange={onOpenChange}>Opções</SidebarSection>);
    await user.click(screen.getByRole("button", { name: "Avançado" }));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("controles", () => {
  it("propaga o estado do toggle", async () => {
    const user = userEvent.setup();
    function Example() {
      const [checked, setChecked] = useState(false);
      return <Toggle label="Ativar" checked={checked} onChange={setChecked} />;
    }
    render(<Example />);
    const toggle = screen.getByRole("switch", { name: "Ativar" });
    await user.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("propaga eventos de input, número e select", () => {
    const onText = vi.fn();
    const onNumber = vi.fn();
    const onSelect = vi.fn();
    render(<>
      <TextField label="Nome" value="" onChange={onText} />
      <NumberField label="Prioridade" value={1} onChange={onNumber} />
      <SelectField label="Status" value="active" onChange={onSelect} options={[{ value: "active", label: "Ativo" }, { value: "paused", label: "Pausado" }]} />
    </>);
    fireEvent.change(screen.getByRole("textbox", { name: "Nome" }), { target: { value: "Painel" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Prioridade" }), { target: { value: "4" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "paused" } });
    expect(onText).toHaveBeenCalled();
    expect(onNumber).toHaveBeenCalledWith(4);
    expect(onSelect).toHaveBeenCalledWith("paused");
  });

  it("preserva o estado disabled nativo", () => {
    render(<><TextField label="Bloqueado" value="x" disabled onChange={() => undefined} /><Toggle label="Alternância bloqueada" checked={false} disabled onChange={() => undefined} /></>);
    expect(screen.getByRole("textbox", { name: "Bloqueado" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Alternância bloqueada" })).toBeDisabled();
  });
});
