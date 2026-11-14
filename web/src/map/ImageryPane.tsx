import { useId, useState } from "react";
import { Info } from "../shared/info/Info";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { baseMapStore } from "./baseMaps";
import { IMAGERY, imageryFault, imageryStore, utcDay, type ImageryId } from "./imagery";

const DAY = 24 * 60 * 60 * 1000;

/**
 * The pane of the button Imagery of a date: the instrument and satellite, and the day. The image of that day
 * from NASA GIBS becomes the background map. The two buttons under the day step to the day before and after.
 */
export function ImageryPane() {
  const id = useId();
  const choice = useStore(imageryStore);
  const [layer, setLayer] = useState<ImageryId>(choice.layer);
  const [date, setDate] = useState(choice.date);
  const [run, setRun] = useState<ToolPaneRun | null>(null);
  const today = utcDay(new Date());
  const { title, first } = IMAGERY.find((image) => image.id === layer) ?? IMAGERY[0];

  const show = (day: string) => {
    const fault = imageryFault({ layer, date: day }, utcDay(new Date()));
    if (fault) {
      setRun({ state: "error", text: fault });
      return;
    }
    imageryStore.set({ layer, date: day });
    baseMapStore.set("imagery");
    setRun({ state: "success", text: `The background map is the image of ${day} (${title}).` });
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
    <ToolPane id="imagery-of-a-date" title="Imagery of a date" runLabel="Show" onRun={() => show(date)} run={run}>
      <div className="info-title">
        <label className="usa-label" htmlFor={`${id}-layer`}>
          Instrument and satellite
        </label>
        <Info id={`${id}-layer-info`} about="Instrument and satellite">
          The instrument and the satellite that took the image. The image shows corrected reflectance in true colour and
          serves as supplementary data. The images reach zoom level 9, at which one pixel covers about 306 metres at the
          equator.
        </Info>
      </div>
      <select
        className="usa-select"
        id={`${id}-layer`}
        aria-describedby={`${id}-layer-info`}
        value={layer}
        onChange={(event) => setLayer(event.target.value as ImageryId)}
      >
        {IMAGERY.map((image) => (
          <option key={image.id} value={image.id}>
            {image.title}
          </option>
        ))}
      </select>
      <div className="info-title">
        <label className="usa-label" htmlFor={`${id}-date`}>
          Day
        </label>
        <Info id={`${id}-hint`} about="Day">
          The day of the image in Coordinated Universal Time, from {first} to {today}. The image of the present day is
          still incomplete.
        </Info>
      </div>
      <input
        className="usa-input"
        id={`${id}-date`}
        type="date"
        min={first}
        max={today}
        aria-describedby={`${id}-hint`}
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      <p className="map-pane-line">
        <button type="button" className="usa-button usa-button--unstyled" onClick={() => step(-1)}>
          Day before
        </button>
        <button type="button" className="usa-button usa-button--unstyled" onClick={() => step(1)}>
          Day after
        </button>
      </p>
    </ToolPane>
  );
}
