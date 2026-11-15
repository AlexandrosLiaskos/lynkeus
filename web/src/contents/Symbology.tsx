// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useId, useMemo, useState } from "react";
import { EmptyState } from "../shared/empty/EmptyState";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { Notice } from "../shared/notice/Notice";
import { setPaneOpen } from "../shared/panes";
import { PropertyList } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { decibels, type Cog } from "./cog";
import { COLOUR_SCALES, colourScale, scaleKind, type ScaleKind } from "./colours";
import { formatDates } from "./dates";
import { fileOf } from "./files";
import { formatNumber, formatUnit, rampImage } from "./legendValues";
import { fromDecibels, isLinearPower } from "./scaling";
import { SYMBOLOGY_PANE, displayOf, resetDisplay, setDisplay, symbologyStore, type Stretch } from "./state";
import { histogram, readSample, stretchRange, summarise, type Sample, type Summary } from "./statistics";
import {
  changeOf,
  draftOf,
  numberOf,
  numberText,
  stretchOf,
  type Draft,
  type Field,
  type Problem,
} from "./symbologyDraft";

/** The number of classes of the histogram. */
const CLASSES = 48;

/** The groups of the list of colour scales, by the use of a scale. */
const KINDS: readonly { kind: ScaleKind; label: string }[] = [
  { kind: "sequential", label: "From low to high" },
  { kind: "diverging", label: "Two sides of a middle value" },
  { kind: "cyclic", label: "Angles" },
  { kind: "classes", label: "Classes" },
];

/** The ways in which the range of the colour scale is set. */
const STRETCHES: readonly { kind: Stretch["kind"]; label: string }[] = [
  { kind: "typed", label: "Typed values" },
  { kind: "extremes", label: "Lowest and highest value" },
  { kind: "percent", label: "Percent clip" },
  { kind: "deviations", label: "Standard deviations" },
];

/** The groups of the pane. Each one opens and closes. */
type Group = "colours" | "range" | "statistics" | "noData" | "mask";

/** The group that holds each field in which a value can be wrong. */
const GROUP_OF: Readonly<Record<Field, Group>> = {
  colours: "colours",
  percent: "range",
  deviations: "range",
  lowest: "range",
  highest: "range",
  noDataColour: "noData",
  maskLowest: "mask",
  maskHighest: "mask",
};

/** The fields whose title carries an explanation, which a screen reader reads with the field. */
const EXPLAINED: readonly Field[] = ["colours", "percent", "deviations"];

/** What the pane has read of the file of the layer: its header and the values of its most reduced copy. */
interface Read {
  cog: Cog;
  sample: Sample;
}

/** The values of a sample in the unit in which the layer is shown, in order, with their statistics. */
interface Values {
  values: ArrayLike<number>;
  /** The statistics of these values. */
  sampled: Summary | null;
  /** The statistics that the pane states and uses for a stretch. */
  summary: Summary | null;
  /** Whether those are the statistics of all the cells, which the file states, and not those of the sample. */
  ofFile: boolean;
}

/** Return the values that the statistics of the pane use. A power of zero or below has no decibels and is left out. */
function valuesOf({ cog, sample }: Read, inDb: boolean): Values {
  const values = inDb ? sample.values.filter((value) => value > 0).map(decibels) : sample.values;
  const sampled = summarise(values);
  return !inDb && cog.statistics
    ? { values, sampled, summary: cog.statistics, ofFile: true }
    : { values, sampled, summary: sampled, ofFile: false };
}

interface HistogramProps {
  values: ArrayLike<number>;
  summary: Summary;
  /** The range of the colour scale, drawn as two lines. */
  lowest: number;
  highest: number;
  unit: string;
}

/** The histogram of the values, with a line at each end of the range of the colour scale. */
function Histogram({ values, summary, lowest, highest, unit }: HistogramProps) {
  const { minimum, maximum } = summary;
  const counts = useMemo(() => histogram(values, minimum, maximum, CLASSES), [values, minimum, maximum]);
  const most = Math.max(...counts, 1);
  const place = (value: number) => ((value - minimum) / (maximum - minimum)) * CLASSES;
  const lines = [lowest, highest].filter((value) => value >= minimum && value <= maximum);
  const ends = `from ${formatNumber(minimum)} to ${formatNumber(maximum)}${unit && ` ${unit}`}`;
  return (
    <svg
      className="symbology-histogram"
      viewBox={`0 0 ${String(CLASSES)} 100`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Histogram of ${String(values.length)} values, ${ends}`}
    >
      {counts.map((count, index) => (
        <rect key={index} x={index} y={100 - (count / most) * 100} width={1} height={(count / most) * 100} />
      ))}
      {lines.map((value) => (
        <line key={value} x1={place(value)} x2={place(value)} y1={0} y2={100} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/**
 * The Symbology pane of one layer. It starts again each time it opens. Its fields stand in five groups: the
 * colours, the range of the colour scale, the statistics of the values with their histogram, the cells without
 * data and the mask. A layer of classes has two groups instead: its classes with their colours, which the pane
 * shows and does not change, and the cells without data; a scale, a range, statistics and a mask by value have no
 * meaning for classes. The Apply button is the one filled button, and the link under the groups returns the layer
 * to its first display.
 */
function SymbologyOf({ layer }: { layer: LayerDescription }) {
  const [draft, setDraft] = useState(() => draftOf(layer, displayOf(layer)));
  const [read, setRead] = useState<Read | "reading" | "failed">("reading");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [run, setRun] = useState<ToolPaneRun | null>(null);
  // The groups that are open. A group that is in use when the pane opens starts open.
  const [open, setOpen] = useState<Readonly<Record<Group, boolean>>>({
    colours: true,
    range: true,
    statistics: true,
    noData: draft.noData,
    mask: draft.masked,
  });
  const id = useId();
  const power = isLinearPower(layer);
  const inDb = power && draft.decibels;
  const unit = inDb ? "dB" : formatUnit(layer.unit);
  const inUnit = unit && ` (${unit})`;
  const classes = scaleKind(draft.colours) === "classes";
  // The table of a layer of classes, whose cells take the colours of their classes.
  const table = layer.classes ?? null;

  useEffect(() => {
    let current = true;
    fileOf(layer.url)
      .then(async (cog) => ({ cog, sample: await readSample(cog) }))
      .then(
        (result) => {
          if (current) {
            setRead(result);
          }
        },
        () => {
          if (current) {
            setRead("failed");
          }
        },
      );
    return () => {
      current = false;
    };
  }, [layer.url]);

  // The field with a wrong value receives the focus after its group has opened.
  useEffect(() => {
    if (problem) {
      document.getElementById(`${id}-${problem.field}`)?.focus();
    }
  }, [problem, id]);

  const shown = useMemo(() => (typeof read === "string" ? null : valuesOf(read, inDb)), [read, inDb]);

  /** Change the draft and, when a stretch is chosen, give the range that the stretch gives. */
  const change = (part: Partial<Draft>, values: Values | null = shown) => {
    const next = { ...draft, ...part };
    const stretch = stretchOf(next);
    if (values?.summary && !("field" in stretch)) {
      const range = stretchRange(stretch, values.values, values.summary);
      if (range) {
        next.lowest = numberText(range[0]);
        next.highest = numberText(range[1]);
      }
    }
    setDraft(next);
    setProblem(null);
  };

  /** Change the unit in which the range and the mask are typed, and write their values in the new unit. */
  const changeDecibels = (checked: boolean) => {
    const convert = (text: string) => {
      const value = numberOf(text);
      if (!Number.isFinite(value) || (checked && value <= 0)) {
        return text;
      }
      return numberText(checked ? decibels(value) : fromDecibels(value));
    };
    const values = typeof read === "string" ? null : valuesOf(read, checked);
    change(
      {
        decibels: checked,
        lowest: convert(draft.lowest),
        highest: convert(draft.highest),
        maskLowest: convert(draft.maskLowest),
        maskHighest: convert(draft.maskHighest),
      },
      values,
    );
  };

  const apply = () => {
    const result = changeOf(layer, draft);
    if ("field" in result) {
      setOpen({ ...open, [GROUP_OF[result.field]]: true });
      setProblem(result);
      setRun({ state: "error", text: "The display was not changed. Correct the value of the marked field." });
    } else {
      setDisplay(layer, result);
      setProblem(null);
      setRun({ state: "success", text: `The display of ${layer.title} was changed.` });
    }
  };

  const reset = () => {
    resetDisplay(layer.id);
    setDraft(draftOf(layer, displayOf(layer)));
    setProblem(null);
    setRun({ state: "success", text: `${layer.title} has its first display again.` });
  };

  /** The properties of a group: whether it is open, and the call that opens and closes it. */
  const group = (name: Group) => ({
    open: open[name],
    onToggle: (next: boolean) => setOpen({ ...open, [name]: next }),
  });

  /** The properties that tie a field to the explanation of its title and to the sentence about its wrong value. */
  const field = (name: Field) => {
    const wrong = problem?.field === name;
    const described = [
      ...(EXPLAINED.includes(name) ? [infoId(`${id}-${name}`)] : []),
      ...(wrong ? [`${id}-problem`] : []),
    ];
    return {
      id: `${id}-${name}`,
      "aria-invalid": wrong ? true : undefined,
      "aria-describedby": described.length > 0 ? described.join(" ") : undefined,
    };
  };
  const message = (name: Field) =>
    problem?.field === name ? (
      <p className="usa-error-message" id={`${id}-problem`}>
        {problem.text}
      </p>
    ) : null;

  const text = (name: "lowest" | "highest" | "maskLowest" | "maskHighest" | "percent" | "deviations") => ({
    ...field(name),
    className: "usa-input",
    inputMode: "decimal" as const,
    value: draft[name],
  });

  /** The statistics as rows of names and values, each value with the unit in which the layer is shown. */
  const statistic = (name: string, value: number) => ({ name, value: `${formatNumber(value)}${unit && ` ${unit}`}` });

  return (
    <ToolPane
      id={SYMBOLOGY_PANE}
      title="Symbology"
      info={
        table
          ? "The pane shows the classes of the layer with their colours and sets the colour of the cells without data. The Apply button changes the display of the layer on the map."
          : "The pane sets how the layer is drawn: its colour scale, the range of the scale, the colour of the cells without data and a mask. The Apply button changes the display of the layer on the map."
      }
      runLabel="Apply"
      onRun={apply}
      run={run}
      secondary={{
        label: "Reset display",
        onClick: reset,
        info: "The layer returns at once to the display with which it was added to the map.",
      }}
    >
      <div className="symbology-layer">
        <p className="item-title">{layer.title}</p>
        <p className="item-line">{formatDates(layer.dates)}</p>
      </div>

      {table ? (
        <Section title="Classes" info="Each class has the colour that the method of the layer gives it." {...group("colours")}>
          <ul className="legend-classes">
            {table.map(({ value, name, colour }) => (
              <li key={value}>
                <span className="legend-swatch" style={{ background: colour }} aria-hidden="true" />
                {name}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {table ? null : (
        <>
      <Section title="Colours" {...group("colours")}>
        <FieldTitle field={`${id}-colours`} title="Colour scale">
          The colours that the values of the layer receive, from the lowest value of the range to the highest. The list
          groups the scales by their use.
        </FieldTitle>
        <select
          {...field("colours")}
          className="usa-select"
          value={draft.colours}
          onChange={(event) => change({ colours: event.target.value })}
        >
          {KINDS.map(({ kind, label }) => (
            <optgroup key={kind} label={label}>
              {COLOUR_SCALES.filter((scale) => scale.kind === kind).map(({ name }) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {message("colours")}
        <div
          className="symbology-ramp"
          role="img"
          aria-label={`Colours of the scale ${draft.colours}${draft.inverted && !classes ? ", inverted" : ""}`}
          style={{
            background: rampImage(
              draft.inverted && !classes ? [...colourScale(draft.colours)].reverse() : colourScale(draft.colours),
              scaleKind(draft.colours),
              "right",
            ),
          }}
        />
        <div className="usa-checkbox symbology-option">
          <input
            className="usa-checkbox__input"
            id={`${id}-inverted`}
            type="checkbox"
            checked={draft.inverted}
            disabled={classes}
            onChange={(event) => change({ inverted: event.target.checked })}
          />
          <label className="usa-checkbox__label" htmlFor={`${id}-inverted`}>
            Invert the colour scale
          </label>
        </div>
      </Section>

      <Section
        title="Range"
        info="The lowest and the highest value receive the first and the last colour of the scale. A value outside the range receives the colour of the nearer end."
        {...group("range")}
      >
        {power ? (
          <div className="usa-checkbox symbology-option">
            <input
              className="usa-checkbox__input"
              id={`${id}-decibels`}
              type="checkbox"
              checked={draft.decibels}
              onChange={(event) => changeDecibels(event.target.checked)}
            />
            <label className="usa-checkbox__label" htmlFor={`${id}-decibels`}>
              Show in decibels
            </label>
          </div>
        ) : null}
        <FieldTitle field={`${id}-stretch`} title="Method">
          The way in which the range is set. Its two values are typed, or they are taken from the values of the layer:
          the lowest and the highest value, a percent clip, or the mean and a number of standard deviations.
        </FieldTitle>
        <select
          className="usa-select"
          id={`${id}-stretch`}
          aria-describedby={infoId(`${id}-stretch`)}
          value={draft.stretch}
          onChange={(event) => {
            const chosen = STRETCHES.find(({ kind }) => kind === event.target.value);
            if (chosen) {
              change({ stretch: chosen.kind });
            }
          }}
        >
          {STRETCHES.map(({ kind, label }) => (
            <option key={kind} value={kind} disabled={kind !== "typed" && !shown?.summary}>
              {label}
            </option>
          ))}
        </select>
        {draft.stretch === "percent" ? (
          <>
            <FieldTitle field={`${id}-percent`} title="Clip (%)">
              The percent of the cells that is left out at each end of the values, as a number from 0 to below 50, for
              example 2.
            </FieldTitle>
            <input {...text("percent")} onChange={(event) => change({ percent: event.target.value })} />
            {message("percent")}
          </>
        ) : null}
        {draft.stretch === "deviations" ? (
          <>
            <FieldTitle field={`${id}-deviations`} title="Standard deviations">
              The number of standard deviations on each side of the mean, as a number above 0, for example 2.
            </FieldTitle>
            <input {...text("deviations")} onChange={(event) => change({ deviations: event.target.value })} />
            {message("deviations")}
          </>
        ) : null}
        <div className="symbology-pair">
          <div>
            <label className="usa-label" htmlFor={`${id}-lowest`}>
              Lowest value{inUnit}
            </label>
            <input {...text("lowest")} onChange={(event) => change({ lowest: event.target.value, stretch: "typed" })} />
          </div>
          <div>
            <label className="usa-label" htmlFor={`${id}-highest`}>
              Highest value{inUnit}
            </label>
            <input
              {...text("highest")}
              onChange={(event) => change({ highest: event.target.value, stretch: "typed" })}
            />
          </div>
        </div>
        {message("lowest")}
        {message("highest")}
      </Section>

      <Section
        title="Statistics"
        info={
          typeof read !== "string" && shown?.summary
            ? `${
                shown.ofFile
                  ? "The file of the layer states these statistics for all its cells."
                  : "The statistics are computed from the cells that the histogram counts."
              } The histogram and the percent clip use ${
                read.sample.full
                  ? "all the cells of the file"
                  : `the most reduced copy of the file, of ${String(read.sample.size[0])} by ${String(read.sample.size[1])} cells`
              }. The two lines of the histogram mark the range.`
            : undefined
        }
        {...group("statistics")}
      >
        {read === "reading" ? <Notice kind="info">Reading the values of the layer.</Notice> : null}
        {read === "failed" ? (
          <Notice kind="warning">
            The values of the layer could not be read. Type the lowest and the highest value of the range.
          </Notice>
        ) : null}
        {typeof read !== "string" && !(shown?.summary && shown.sampled) ? (
          <Notice kind="info">The layer holds no values for a histogram and for statistics.</Notice>
        ) : null}
        {typeof read !== "string" && shown?.summary && shown.sampled ? (
          <>
            <Histogram
              values={shown.values}
              summary={shown.sampled}
              lowest={numberOf(draft.lowest)}
              highest={numberOf(draft.highest)}
              unit={unit}
            />
            <PropertyList
              groups={[
                {
                  rows: [
                    statistic("Lowest value", shown.summary.minimum),
                    statistic("Highest value", shown.summary.maximum),
                    statistic("Mean", shown.summary.mean),
                    statistic("Standard deviation", shown.summary.deviation),
                  ],
                },
              ]}
            />
          </>
        ) : null}
      </Section>
        </>
      )}

      <Section
        title="Cells without data"
        info="A cell without data is transparent, unless a colour is chosen for it here."
        {...group("noData")}
      >
        <div className="usa-checkbox symbology-option">
          <input
            className="usa-checkbox__input"
            id={`${id}-noData`}
            type="checkbox"
            checked={draft.noData}
            onChange={(event) => change({ noData: event.target.checked })}
          />
          <label className="usa-checkbox__label" htmlFor={`${id}-noData`}>
            Draw in a colour
          </label>
        </div>
        <label className="usa-label" htmlFor={`${id}-noDataColour`}>
          Colour
        </label>
        <input
          {...field("noDataColour")}
          className="symbology-colour"
          type="color"
          value={draft.noDataColour}
          disabled={!draft.noData}
          onChange={(event) => change({ noDataColour: event.target.value })}
        />
        {message("noDataColour")}
      </Section>

      {table ? null : (
      <Section
        title="Mask"
        info="The mask hides the cells whose value lies below the first limit or above the second one. The limits are typed in the unit of the range."
        {...group("mask")}
      >
        <div className="usa-checkbox symbology-option">
          <input
            className="usa-checkbox__input"
            id={`${id}-masked`}
            type="checkbox"
            checked={draft.masked}
            onChange={(event) => change({ masked: event.target.checked })}
          />
          <label className="usa-checkbox__label" htmlFor={`${id}-masked`}>
            Hide values outside limits
          </label>
        </div>
        <div className="symbology-pair">
          <div>
            <label className="usa-label" htmlFor={`${id}-maskLowest`}>
              From{inUnit}
            </label>
            <input
              {...text("maskLowest")}
              disabled={!draft.masked}
              onChange={(event) => change({ maskLowest: event.target.value })}
            />
          </div>
          <div>
            <label className="usa-label" htmlFor={`${id}-maskHighest`}>
              To{inUnit}
            </label>
            <input
              {...text("maskHighest")}
              disabled={!draft.masked}
              onChange={(event) => change({ maskHighest: event.target.value })}
            />
          </div>
        </div>
        {message("maskLowest")}
        {message("maskHighest")}
      </Section>
      )}
    </ToolPane>
  );
}

/**
 * The Symbology pane: the colour scale of a layer, the range of the scale, typed or taken from the values of the
 * layer, beside the histogram of the values, the colour of the cells without data and a mask by value. The
 * command Symbology of the menu of a layer opens it for that layer, and the Apply button changes the display.
 * After its layer has left the map, the pane says so and its foot states how it is opened for another layer.
 */
export function SymbologyPane() {
  const shown = useStore(symbologyStore);
  const layer = useStore(mapLayersStore).find(({ id }) => id === shown?.id);
  if (!shown || !layer) {
    return (
      <ToolPane
        id={SYMBOLOGY_PANE}
        title="Symbology"
        runLabel="Apply"
        onRun={() => undefined}
        ready={false}
        missing="Choose Symbology in the menu of a layer."
      >
        <EmptyState
          title="No layer"
          text="The layer of this pane is no longer on the map."
          action={{ label: "Show Contents pane", onClick: () => setPaneOpen("contents", true) }}
        />
      </ToolPane>
    );
  }
  return <SymbologyOf key={`${shown.id} ${String(shown.time)}`} layer={layer} />;
}
