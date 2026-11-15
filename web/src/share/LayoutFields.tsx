// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId } from "react";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import { Notice } from "../shared/notice/Notice";
import { Section } from "../shared/section/Section";
import { TITLE_LENGTH, type LayoutForm } from "./layout";
import { resolutionLabel, RESOLUTIONS } from "./pictureForm";

interface LayoutFieldsProps {
  form: LayoutForm;
  /** Whether the map shows a layer with a legend. The choice of the legend is offered only then. */
  hasLegend: boolean;
  /** What the user must know before the page is printed, for example that a basemap will be left out. */
  notes: readonly string[];
  onChange: (form: LayoutForm) => void;
}

/** The elements that a page may carry beside the legend: the name of the choice in the form, and its label. */
const ELEMENTS = [
  ["scaleBar", "Scale bar"],
  ["northArrow", "North arrow"],
  ["frame", "Coordinate frame"],
] as const;

/**
 * The fields of the layout, in two groups: the title, the paper and the resolution of the map, and the elements
 * of the page. The explanation of a field stands behind the "i" beside its title. Under the groups, a notice
 * states what every page carries, and one more for each note. The fields fill the container that holds them.
 */
export function LayoutFields({ form, hasLegend, notes, onChange }: LayoutFieldsProps) {
  const id = useId();
  return (
    <>
      <Section title="Page">
        <FieldTitle field={`${id}-title`} title="Title">
          {`The title stands at the top of the page and has at most ${String(TITLE_LENGTH)} characters. A page without a title begins with the map.`}
        </FieldTitle>
        <input
          className="usa-input"
          id={`${id}-title`}
          type="text"
          maxLength={TITLE_LENGTH}
          value={form.title}
          aria-describedby={infoId(`${id}-title`)}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
        />

        <label className="usa-label" htmlFor={`${id}-paper`}>
          Paper size
        </label>
        <select
          className="usa-select"
          id={`${id}-paper`}
          value={form.paper}
          onChange={(event) => onChange({ ...form, paper: event.target.value === "A3" ? "A3" : "A4" })}
        >
          <option value="A4">A4, 210 by 297 mm</option>
          <option value="A3">A3, 297 by 420 mm</option>
        </select>

        <label className="usa-label" htmlFor={`${id}-orientation`}>
          Orientation
        </label>
        <select
          className="usa-select"
          id={`${id}-orientation`}
          value={form.orientation}
          onChange={(event) =>
            onChange({ ...form, orientation: event.target.value === "portrait" ? "portrait" : "landscape" })
          }
        >
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
        </select>

        <FieldTitle field={`${id}-resolution`} title="Map resolution">
          With the pixels of the screen, the page shows the largest part of the map on the screen that has the
          proportions of the map frame, and no other image is requested from the service of the basemap. With a
          resolution in dots per inch, the map is drawn again for the page at that resolution.
        </FieldTitle>
        <select
          className="usa-select"
          id={`${id}-resolution`}
          value={String(form.resolution)}
          aria-describedby={infoId(`${id}-resolution`)}
          onChange={(event) =>
            onChange({ ...form, resolution: event.target.value === "screen" ? "screen" : Number(event.target.value) })
          }
        >
          <option value="screen">Pixels of the screen</option>
          {RESOLUTIONS.slice(1).map((resolution) => (
            <option key={resolution} value={String(resolution)}>
              {resolutionLabel(resolution)}
            </option>
          ))}
        </select>
      </Section>

      <Section
        title="Elements"
        info={
          hasLegend
            ? "The legend stands under the map and lists the visible layers. The coordinate frame writes longitudes and latitudes around the map."
            : "The legend is offered while the map shows a layer. The coordinate frame writes longitudes and latitudes around the map."
        }
      >
        {hasLegend ? (
          <div className="usa-checkbox">
            <input
              className="usa-checkbox__input"
              id={`${id}-legend`}
              type="checkbox"
              checked={form.legend}
              onChange={(event) => onChange({ ...form, legend: event.target.checked })}
            />
            <label className="usa-checkbox__label" htmlFor={`${id}-legend`}>
              Legend
            </label>
          </div>
        ) : null}
        {ELEMENTS.map(([name, label]) => (
          <div className="usa-checkbox" key={name}>
            <input
              className="usa-checkbox__input"
              id={`${id}-${name}`}
              type="checkbox"
              checked={form[name]}
              onChange={(event) => onChange({ ...form, [name]: event.target.checked })}
            />
            <label className="usa-checkbox__label" htmlFor={`${id}-${name}`}>
              {label}
            </label>
          </div>
        ))}
      </Section>

      <Notice kind="info">
        The page always states the scale, the projection, the date and the sources of the map.
      </Notice>
      {notes.map((note) => (
        <Notice kind="warning" key={note}>
          {note}
        </Notice>
      ))}
    </>
  );
}
