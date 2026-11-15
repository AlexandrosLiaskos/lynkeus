import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedBy, FieldError } from "./FieldError";

test("the error of a field is announced as an alert, and a field without an error shows nothing", () => {
  const { rerender } = render(<FieldError id="side-error">{null}</FieldError>);
  expect(screen.queryByRole("alert")).toBeNull();
  rerender(<FieldError id="side-error">Enter a number.</FieldError>);
  expect(screen.getByRole("alert").textContent).toBe("Enter a number.");
  expect(screen.getByRole("alert").id).toBe("side-error");
});

test("a field is described by the ids that are present", () => {
  expect(describedBy("side-info", "side-error")).toBe("side-info side-error");
  expect(describedBy("side-info", null)).toBe("side-info");
  expect(describedBy(null, "")).toBeUndefined();
});
