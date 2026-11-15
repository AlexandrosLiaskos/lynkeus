// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId, useState } from "react";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import { Notice } from "../shared/notice/Notice";
import { PropertyList } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { paperSize, pictureFault, PICTURE_LIMITS, sidesFault } from "./mapImage";
import {
  pictureSides,
  resolutionLabel,
  RESOLUTIONS,
  withResolution,
  withSide,
  withSize,
  type PictureForm,
} from "./pictureForm";

interface MapImageFieldsProps {
  form: PictureForm;
  /** Width and height of the map on the screen, in pixels. */
  screen: readonly [number, number];
  /** Whether the map shows a layer with a legend. The choice of the legend is offered only then. */
  hasLegend: boolean;
  /** What the user must know before the picture is made, for example that a basemap will be left out. */
  notes: readonly string[];
  onChange: (form: PictureForm) => void;
}

const { smallestSide, largestSide } = PICTURE_LIMITS;

/** The two sides of a custom size: the name of the side, its title, and the side that follows it. */
const SIDES = [
  ["width", "Width (px)", "height"],
  ["height", "Height (px)", "width"],
] as const;

/** The elements that a picture may carry: the name of the choice in the form, and its label. */
const ELEMENTS = [
  ["scaleBar", "Scale bar"],
  ["northArrow", "North arrow"],
] as const;

/**
 * The fields of the map image, in two groups: the resolution and the size of the picture, and the elements drawn
 * on it. The explanation of a field stands behind the "i" beside its title. The error of a side is written under
 * its field after the user has left one of the two sides. Under the groups, a notice states what holds for every
 * picture, and one more for each note. The fields fill the container that holds them.
 */
export function MapImageFields({ form, screen, hasLegend, notes, onChange }: MapImageFieldsProps) {
  const id = useId();
  const [sidesLeft, setSidesLeft] = useState(false);
  const [width, height] = pictureSides(form, screen);
  const fault = pictureFault({ width, height, resolution: form.resolution });
  const [paperWidth, paperHeight] = paperSize(width, height, form.resolution);
  // Each side is judged alone, beside a side that is always accepted.
  const faults = {
    width: sidesFault({ width, height: smallestSide }),
    height: sidesFault({ width: smallestSide, height }),
  };

  return (
    <>
      <Section title="Picture">
        <FieldTitle field={`${id}-resolution`} title="Resolution">
          The resolution gives the size of the picture on paper. With a custom size, a change of the resolution changes
          the width and the height in proportion, so that the picture keeps its size on paper.
        </FieldTitle>
        <select
          className="usa-select"
          id={`${id}-resolution`}
          value={String(form.resolution)}
          aria-describedby={infoId(`${id}-resolution`)}
          onChange={(event) => onChange(withResolution(form, Number(event.target.value)))}
        >
          {RESOLUTIONS.map((resolution) => (
            <option key={resolution} value={String(resolution)}>
              {resolutionLabel(resolution)}
            </option>
          ))}
        </select>

        <FieldTitle field={`${id}-size`} title="Size">
          With the size of the screen, the picture shows the whole map of the screen, and a higher resolution gives it
          more pixels in proportion. A custom size takes a width and a height in pixels.
        </FieldTitle>
        <select
          className="usa-select"
          id={`${id}-size`}
          value={form.size}
          aria-describedby={infoId(`${id}-size`)}
          onChange={(event) => onChange(withSize(form, event.target.value === "custom" ? "custom" : "screen", screen))}
        >
          <option value="screen">As on the screen</option>
          <option value="custom">Custom</option>
        </select>

        {form.size === "custom" ? (
          <>
            {SIDES.map(([side, title, other]) => {
              const field = `${id}-${side}`;
              const error = sidesLeft ? faults[side] : null;
              return (
                <div key={side}>
                  <FieldTitle field={field} title={title}>
                    {`A whole number between ${String(smallestSide)} and ${String(largestSide)}. While the proportions are kept, the ${other} follows the ${side} in the proportions of the map on the screen.`}
                  </FieldTitle>
                  <input
                    className="usa-input"
                    id={field}
                    type="number"
                    inputMode="numeric"
                    min={smallestSide}
                    max={largestSide}
                    step={1}
                    value={form[side]}
                    aria-invalid={error === null ? undefined : true}
                    aria-describedby={error === null ? infoId(field) : `${field}-error ${infoId(field)}`}
                    onBlur={() => setSidesLeft(true)}
                    onChange={(event) => onChange(withSide(form, side, event.target.value, screen))}
                  />
                  {error === null ? null : (
                    <p className="usa-error-message" id={`${field}-error`} role="alert">
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
            <div className="usa-checkbox share-choice">
              <input
                className="usa-checkbox__input"
                id={`${id}-proportions`}
                type="checkbox"
                checked={form.proportions}
                onChange={(event) => onChange({ ...form, proportions: event.target.checked })}
              />
              <label className="usa-checkbox__label" htmlFor={`${id}-proportions`}>
                Keep proportions
              </label>
            </div>
          </>
        ) : null}

        {fault === null ? (
          <div className="share-facts">
            <PropertyList
              groups={[
                {
                  rows: [
                    { name: "Pixels", value: `${String(width)} by ${String(height)}` },
                    {
                      name: "On paper",
                      value: `${String(Math.round(paperWidth))} by ${String(Math.round(paperHeight))} mm`,
                      info: "The size of the picture when it is printed at the chosen resolution.",
                    },
                  ],
                },
              ]}
            />
          </div>
        ) : null}
      </Section>

      <Section
        title="Elements"
        info={
          hasLegend
            ? "The north arrow is drawn only when the map is rotated. The legend lists the visible layers."
            : "The north arrow is drawn only when the map is rotated. The legend is offered while the map shows a layer."
        }
      >
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
      </Section>

      <Notice kind="info">
        The sources of the map are always written on the picture, as the services of the basemaps ask.
      </Notice>
      {notes.map((note) => (
        <Notice kind="warning" key={note}>
          {note}
        </Notice>
      ))}
    </>
  );
}
