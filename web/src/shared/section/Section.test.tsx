import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { Section } from "./Section";

const header = (name: string) => screen.getByRole("button", { name });

test("a section shows its title as a heading, the count of its items and its content", () => {
  render(
    <Section title="Layers" count={3}>
      <p>Three layers</p>
    </Section>,
  );
  expect(screen.getByRole("heading", { level: 3, name: "Layers (3)" })).toBeDefined();
  expect(header("Layers (3)").getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("group", { name: "Layers (3)" }).textContent).toBe("Three layers");
});

test("the header closes and opens the section, and a closed section keeps its content in the page", async () => {
  render(
    <Section title="Jobs">
      <input aria-label="Name" defaultValue="First" />
    </Section>,
  );
  const body = document.getElementById(header("Jobs").getAttribute("aria-controls") ?? "");
  await userEvent.type(screen.getByRole("textbox", { name: "Name" }), " job");
  await userEvent.click(header("Jobs"));
  expect(header("Jobs").getAttribute("aria-expanded")).toBe("false");
  expect(body?.hidden).toBe(true);
  await userEvent.click(header("Jobs"));
  expect(body?.hidden).toBe(false);
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Name" }).value).toBe("First job");
});

test("the keyboard opens and closes the section with Enter and with Space", async () => {
  render(<Section title="Jobs">Content</Section>);
  header("Jobs").focus();
  await userEvent.keyboard("{Enter}");
  expect(header("Jobs").getAttribute("aria-expanded")).toBe("false");
  await userEvent.keyboard(" ");
  expect(header("Jobs").getAttribute("aria-expanded")).toBe("true");
});

test("a section may start closed", () => {
  render(
    <Section title="Files" defaultOpen={false}>
      Content
    </Section>,
  );
  expect(header("Files").getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("group")).toBeNull();
});

test("a command of the header runs and leaves the section as it is", async () => {
  const add = vi.fn();
  render(
    <Section
      title="Layers"
      actions={
        <button type="button" onClick={add}>
          Add
        </button>
      }
    >
      Content
    </Section>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(add).toHaveBeenCalledTimes(1);
  expect(header("Layers").getAttribute("aria-expanded")).toBe("true");
  expect(header("Layers").contains(screen.getByRole("button", { name: "Add" }))).toBe(false);
});

test("the explanation stands behind the button beside the title and describes the content", () => {
  render(
    <Section title="Jobs" info="The requests of this session.">
      Content
    </Section>,
  );
  const info = screen.getByRole("button", { name: "Information about Jobs" });
  const body = screen.getByRole("group", { name: "Jobs" });
  expect(header("Jobs").contains(info)).toBe(false);
  expect(document.getElementById(body.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    "The requests of this session.",
  );
});

test("a component that holds the state of the section opens and closes it", async () => {
  const onToggle = vi.fn();
  function Held() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Show the products
        </button>
        <Section
          title="Products"
          open={open}
          onToggle={(next) => {
            onToggle(next);
            setOpen(next);
          }}
        >
          Content
        </Section>
      </>
    );
  }
  render(<Held />);
  expect(header("Products").getAttribute("aria-expanded")).toBe("false");
  await userEvent.click(screen.getByRole("button", { name: "Show the products" }));
  expect(header("Products").getAttribute("aria-expanded")).toBe("true");
  await userEvent.click(header("Products"));
  expect(onToggle).toHaveBeenCalledWith(false);
  expect(header("Products").getAttribute("aria-expanded")).toBe("false");
});
