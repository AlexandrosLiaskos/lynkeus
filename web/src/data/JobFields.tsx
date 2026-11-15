import { isArea } from "../shared/area";
import { isPoint } from "../shared/series";
import { PROJECT_SERVER_WORDS } from "../shared/servers";
import { formatMoment, formatRunTime, isUnfinished, runTime, STATUS_WORDS, type Job } from "./jobs";

/** The words that name the inputs of the process `get-layer` and of the analysis tools. */
const INPUT_NAMES: Record<string, string> = {
  product: "Product type",
  granule: "Product file",
  layer: "Layer of the product",
  area: "Area",
  inputs: "Input layers",
  title: "Name of the result",
  point: "Point",
};

function isPlain(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/** Write the value of an input for reading. */
function inputWords(value: unknown): string {
  if (isPlain(value)) {
    return String(value);
  }
  if (isArea(value)) {
    const { west, south, east, north } = value;
    return `West ${String(west)}, south ${String(south)}, east ${String(east)}, north ${String(north)} (degrees)`;
  }
  if (Array.isArray(value) && value.every(isPlain)) {
    return value.join(", ");
  }
  if (isPoint(value)) {
    return `Longitude ${String(value.longitude)}, latitude ${String(value.latitude)} (degrees)`;
  }
  // A Series tool that was started without a point has the input `point` without a value.
  if (value === null) {
    return "None";
  }
  return JSON.stringify(value);
}

/** Return every field of a job as a name and a value, in the order shown. */
export function jobRows(job: Job): [string, string][] {
  const time = runTime(job);
  const rows: [string, string | null][] = [
    ["Name", job.title],
    ["Process", job.processID],
    ["Server", job.server?.name ?? PROJECT_SERVER_WORDS],
    ["Status", isUnfinished(job) ? `${STATUS_WORDS[job.status]}, ${String(job.progress)} %` : STATUS_WORDS[job.status]],
    ["Message", job.message === "" ? null : job.message],
    ["Requested", formatMoment(job.created)],
    ["Started", job.started ? formatMoment(job.started) : null],
    ["Ended", job.finished ? formatMoment(job.finished) : null],
    ["Time of the work", time === null ? null : formatRunTime(time)],
    ...Object.entries(job.inputs ?? {}).map(([name, value]): [string, string] => [
      INPUT_NAMES[name] ?? name,
      inputWords(value),
    ]),
    ["Identifier of the layer", job.layer ?? null],
    ["Identifier of the series", job.series ?? null],
    ["Identifier of the job", job.jobID],
  ];
  return rows.filter((row): row is [string, string] => row[1] !== null);
}

/** Every field of a job, with the inputs with which it was started, as a table of names and values. */
export function JobFields({ job }: { job: Job }) {
  return (
    <table
      className="usa-table usa-table--borderless usa-table--compact fields"
      aria-label={`Fields of the job ${job.title}`}
    >
      <tbody>
        {jobRows(job).map(([name, value]) => (
          <tr key={name}>
            <th scope="row">{name}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
