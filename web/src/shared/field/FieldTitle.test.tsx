import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FieldTitle, infoId } from "./FieldTitle";

test("the title names its field, and the explanation behind the button describes the field", () => {
  render(
    <>
      <FieldTitle field="distance" title="Distance (m)">
        The width of the buffer, as a number greater than zero.
      </FieldTitle>
      <input className="usa-input" id="distance" aria-describedby={infoId("distance")} />
    </>,
  );
  const field = screen.getByRole("textbox", { name: "Distance (m)" });
  expect(field.getAttribute("aria-describedby")).toBe("distance-info");
  expect(document.getElementById("distance-info")?.textContent).toBe(
    "The width of the buffer, as a number greater than zero.",
  );
  const button = screen.getByRole("button", { name: "Information about Distance (m)" });
  expect(screen.getByText("Distance (m)").contains(button)).toBe(false);
});
