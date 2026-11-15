// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId, useState } from "react";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { baseMapStore } from "./baseMaps";
import { formatDate } from "./day";
import { describedBy, FieldError } from "./FieldError";
import { IMAGERY, imageryFault, imageryStore, utcDay, type ImageryId } from "./imagery";

const DAY = 24 * 60 * 60 * 1000;

/**
 * The pane of the button Imagery of a date: the instrument and satellite, and the day. The image of that day
 * from NASA GIBS becomes the basemap. The two links under the day show the image of the day before and of the
 * day after. A day without an image is refused under its field.
 */
export function ImageryPane() {
  const id = useId();
  const choice = useStore(imageryStore);
  const [layer, setLayer] = useState<ImageryId>(choice.layer);
  const [date, setDate] = useState(choice.date);
  const [fault, setFault] = useState<string | null>(null);
  const [run, setRun] = useState<ToolPaneRun | null>(null);
  const today = utcDay(new Date());
  const { title, first } = IMAGERY.find((image) => image.id === layer) ?? IMAGERY[0];
  const layerId = `${id}-layer`;
  const dateId = `${id}-date`;

  const show = (day: string) => {
    const found = imageryFault({ layer, date: day }, utcDay(new Date()));
    setFault(found);
    if (found) {
      setRun(null);
      return;
    }
    imageryStore.set({ layer, date: day });
    baseMapStore.set("imagery");
    setRun({ state: "success", text: `The basemap is the image of ${formatDate(day)} (${title}).` });
  };

  const step = (days: number) => {
    const from = Date.parse(date);
    if (Number.isNaN(from)) {
      show(date);
      return;
    }
    const day = utcDay(new Date(from + days * DAY));
    setDate(day);
    show(day);
  };

  return (
    <ToolPane
      id="imagery-of-a-date"
      title="Imagery of a date"
      runLabel="Show image"
      onRun={() => show(date)}
      ready={date !== ""}
      missing="Enter the day of the image."
      run={run}
    >
      <FieldTitle field={layerId} title="Instrument and satellite">
        The instrument and the satellite that took the image. The image shows corrected reflectance in true colour and
        serves as supplementary data. The images reach zoom level 9, at which one pixel covers about 306 metres at the
        equator.
      </FieldTitle>
      <select
        className="usa-select"
        id={layerId}
        aria-describedby={infoId(layerId)}
        value={layer}
        onChange={(event) => {
          setLayer(event.target.value as ImageryId);
          setFault(null);
        }}
      >
        {IMAGERY.map((image) => (
          <option key={image.id} value={image.id}>
            {image.title}
          </option>
        ))}
      </select>
      <FieldTitle field={dateId} title="Day">
        {`The day of the image in Coordinated Universal Time, from ${formatDate(first)} to ${formatDate(today)}. The image of the present day is still incomplete.`}
      </FieldTitle>
      <input
        className={fault ? "usa-input usa-input--error" : "usa-input"}
        id={dateId}
        type="date"
        min={first}
        max={today}
        aria-invalid={fault ? true : undefined}
        aria-describedby={describedBy(infoId(dateId), fault && `${dateId}-error`)}
        value={date}
        onChange={(event) => {
          setDate(event.target.value);
          setFault(null);
        }}
      />
      <FieldError id={`${dateId}-error`}>{fault}</FieldError>
      <div className="map-links">
        <button type="button" className="usa-button usa-button--unstyled" onClick={() => step(-1)}>
          Show day before
        </button>
        <button type="button" className="usa-button usa-button--unstyled" onClick={() => step(1)}>
          Show day after
        </button>
      </div>
    </ToolPane>
  );
}
