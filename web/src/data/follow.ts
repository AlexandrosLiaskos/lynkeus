import { addToMap } from "../shared/mapLayers";
import { report } from "../shared/messages/messages";
import { createStore } from "../shared/store";
import { jobResult, onJobFinished, watchJobs, type Job } from "./jobs";
import { layersStore, loadLayers } from "./layers";
import { wordsOf } from "./service";

/**
 * Whether a layer is put on the map when its job ends, as ArcGIS Pro adds the output of a tool to the open map
 * and QGIS opens the output file of an algorithm. The form of Get layer changes it.
 */
export const addWhenReadyStore = createStore(true);

/**
 * Tell the visitor that a job has ended. After a success the list of layers is read again and, when the visitor
 * asked for it, the layer is put on the map. After a failure the message is the sentence of the server.
 */
export async function announce(job: Job): Promise<void> {
  if (job.status !== "successful") {
    report("error", `The job "${job.title}" failed. ${job.message}`);
    return;
  }
  await loadLayers();
  try {
    const layer =
      layersStore.get().find((entry) => entry.layer.id === job.layer)?.layer ?? (await jobResult(job.jobID));
    if (addWhenReadyStore.get()) {
      addToMap(layer);
      report("success", `The layer "${layer.title}" is ready and was added to the map.`);
    } else {
      report("success", `The layer "${layer.title}" is ready. The Catalog pane lists it.`);
    }
  } catch (error) {
    report(
      "warning",
      `The job "${job.title}" has finished, but its layer could not be read. ${wordsOf(error, "")}`.trim(),
    );
  }
}

/**
 * Read the jobs and the layers of the session, keep the jobs up to date and tell the visitor when a job ends.
 * The page calls this once, when it loads. The function returned ends it.
 */
export function followSession(): () => void {
  const stopListening = onJobFinished((job) => void announce(job));
  const stopWatching = watchJobs();
  void loadLayers();
  return () => {
    stopWatching();
    stopListening();
  };
}
