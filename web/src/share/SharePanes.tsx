// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useRef, useState } from "react";
import { baseMapStore } from "../map/baseMaps";
import { areaStore } from "../shared/area";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { citationText } from "./citation";
import { CitationFields } from "./CitationFields";
import { copyText } from "./clipboard";
import { saveFile, timeStamp } from "./download";
import { layerFileName } from "./layerFile";
import { citationMissing, useDataSources } from "./layerSources";
import { LayoutFields } from "./LayoutFields";
import { FIRST_LAYOUT_FORM } from "./layout";
import { pictureLegend, useVisibleLayers } from "./legend";
import { LinkFields } from "./LinkFields";
import { mapLink } from "./link";
import { MapImageFields } from "./MapImageFields";
import { isViewedOnly, makePicture, pictureFault, pictureFile, showsTheScreen, VIEWED_ONLY_NOTE } from "./mapImage";
import { useMapSize, useMapView } from "./mapState";
import { FIRST_PICTURE_FORM, pictureSides } from "./pictureForm";
import { printLayout } from "./printLayout";
import { RecordFields, type RecordForm } from "./RecordFields";
import { provenanceText, readRecord, recordText } from "./record";
import { layerMissing, useHasLayers, useSelectedLayer } from "./selection";

function failure(error: unknown, otherwise: string): ToolPaneRun {
  return { state: "error", text: error instanceof Error ? error.message : otherwise };
}

/**
 * The tool pane of the map image: the form, and the button that draws the picture and saves it as a PNG file.
 * While a side of the picture is wrong, the foot states which one.
 */
function MapImagePane() {
  const map = useMap();
  const screen = useMapSize(map);
  const baseMap = useStore(baseMapStore);
  const layers = useVisibleLayers();
  const [form, setForm] = useState(FIRST_PICTURE_FORM);
  const [run, setRun] = useState<ToolPaneRun | null>(null);
  const [width, height] = pictureSides(form, screen);
  const fault = pictureFault({ width, height, resolution: form.resolution });
  const ready = fault === null;
  const leavesOut = ready && isViewedOnly(baseMap) && !showsTheScreen(screen, [width, height]);

  const save = () => {
    const name = `lynkeus-map-${timeStamp(new Date())}.png`;
    setRun({ state: "running", text: "Drawing the map" });
    makePicture(map, {
      width,
      height,
      resolution: form.resolution,
      sources: true,
      scaleBar: form.scaleBar,
      northArrow: form.northArrow ? "rotated" : "never",
      legends: form.legend ? layers.map(pictureLegend) : [],
    })
      .then(async ({ picture, notes }) => {
        saveFile(await pictureFile(picture, form.resolution), name);
        setRun({
          state: notes.length > 0 ? "warning" : "success",
          text: [`The picture was saved as ${name}.`, ...notes].join(" "),
        });
      })
      .catch((error: unknown) => setRun(failure(error, "The picture could not be made.")));
  };

  return (
    <ToolPane
      id="export-map-image"
      title="Map image"
      info="This tool draws the map as a picture with the chosen size and elements, and saves the picture as a PNG file."
      runLabel="Save as PNG"
      onRun={save}
      ready={ready}
      missing={fault ?? undefined}
      run={run}
    >
      <MapImageFields
        form={form}
        screen={screen}
        hasLegend={layers.length > 0}
        notes={leavesOut ? [VIEWED_ONLY_NOTE] : []}
        onChange={setForm}
      />
    </ToolPane>
  );
}

/** The tool pane of the layout: the form, and the button that lays the page out and opens the print window. */
function LayoutPane() {
  const map = useMap();
  const baseMap = useStore(baseMapStore);
  const layers = useVisibleLayers();
  const [form, setForm] = useState(FIRST_LAYOUT_FORM);
  const [run, setRun] = useState<ToolPaneRun | null>(null);
  const leavesOut = isViewedOnly(baseMap) && form.resolution !== "screen";

  const print = () => {
    setRun({ state: "running", text: "Drawing the map" });
    printLayout(map, form, layers)
      .then((notes) =>
        setRun({
          state: notes.length > 0 ? "warning" : "success",
          text: ["The page was sent to the print window of the browser.", ...notes].join(" "),
        }),
      )
      .catch((error: unknown) => setRun(failure(error, "The page could not be printed.")));
  };

  return (
    <ToolPane
      id="print-layout"
      title="Layout"
      info="This tool lays the map out on a page with the chosen elements and opens the print window of the browser, which prints the page or saves it as a PDF file."
      runLabel="Print"
      onRun={print}
      run={run}
    >
      <LayoutFields
        form={form}
        hasLegend={layers.length > 0}
        notes={leavesOut ? [VIEWED_ONLY_NOTE] : []}
        onChange={setForm}
      />
    </ToolPane>
  );
}

/** The tool pane of the link: the address of the map as it is now, and the button that copies it. */
function LinkPane() {
  const map = useMap();
  // The address follows the view, the basemap and the area.
  useMapView(map);
  useStore(baseMapStore);
  useStore(areaStore);
  const field = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<{ address: string; done: boolean } | null>(null);
  const address = mapLink(map, window.location.href) ?? "";

  const copy = () => {
    copyText(address).then(
      () => setCopied({ address, done: true }),
      () => {
        field.current?.focus();
        field.current?.select();
        setCopied({ address, done: false });
      },
    );
  };

  // The outcome of a copy is shown only while the address is the one that was copied.
  const run: ToolPaneRun | null =
    copied?.address !== address
      ? null
      : copied.done
        ? { state: "success", text: "The address was copied." }
        : {
            state: "warning",
            text: "The browser did not allow the copy. The address is selected; copy it with the keyboard.",
          };

  return (
    <ToolPane
      id="link-to-map"
      title="Link to this map"
      info="This tool gives the address that opens Lynkeus with the map as it is now. The address follows the map while the pane is open."
      runLabel="Copy address"
      onRun={copy}
      ready={address !== ""}
      missing="The map has no view yet."
      run={run}
    >
      <LinkFields address={address} field={field} />
    </ToolPane>
  );
}

/**
 * The tool pane of the record: the form of the record of the selected layer, and the button that saves it.
 * Without a selected layer, the pane and its foot state what is needed.
 */
function RecordPane() {
  const layer = useSelectedLayer();
  const hasLayers = useHasLayers();
  const [form, setForm] = useState<RecordForm>("stac");
  const [run, setRun] = useState<ToolPaneRun | null>(null);

  const save = () => {
    if (!layer) {
      return;
    }
    setRun({ state: "running", text: "Reading the record" });
    if (form === "stac") {
      const name = layerFileName(layer, "json");
      readRecord(layer.record)
        .then((record) => {
          saveFile(new Blob([recordText(record, layerFileName(layer, "tif"))], { type: "application/geo+json" }), name);
          setRun({ state: "success", text: `The record was saved as ${name}.` });
        })
        .catch((error: unknown) => setRun(failure(error, "The record could not be saved.")));
    } else {
      const name = layerFileName(layer, "txt").replace(/\.txt$/, "-provenance.txt");
      readRecord(layer.record)
        .catch(() => null)
        .then((record) => {
          saveFile(new Blob([provenanceText(layer, record)], { type: "text/plain;charset=utf-8" }), name);
          setRun(
            record
              ? { state: "success", text: `The provenance record was saved as ${name}.` }
              : {
                  state: "warning",
                  text: `The provenance record was saved as ${name}, without the lines of the STAC record, which could not be read.`,
                },
          );
        })
        .catch((error: unknown) => setRun(failure(error, "The provenance record could not be saved.")));
    }
  };

  return (
    <ToolPane
      id="export-record"
      title="Record"
      info="This tool saves the record of the layer that is selected in the Contents pane as a file."
      runLabel="Save record"
      onRun={save}
      ready={layer !== null}
      missing={layerMissing(hasLayers)}
      run={run}
    >
      <RecordFields layer={layer} form={form} onChange={setForm} />
    </ToolPane>
  );
}

/**
 * The tool pane of the citation: the text that cites the selected layer, and the button that copies it. Without
 * a citation, the pane and its foot state what is needed: a selected layer, or a record that names a DOI.
 */
function CitationPane() {
  const layer = useSelectedLayer();
  const hasLayers = useHasLayers();
  const sources = useDataSources(layer);
  const reading = layer !== null && sources === null;
  const field = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<{ citation: string; done: boolean } | null>(null);
  const citation = layer && sources && sources.length > 0 ? citationText(layer, sources) : null;

  const copy = () => {
    if (citation === null) {
      return;
    }
    copyText(citation).then(
      () => setCopied({ citation, done: true }),
      () => {
        field.current?.focus();
        field.current?.select();
        setCopied({ citation, done: false });
      },
    );
  };

  // The outcome of a copy is shown only while the citation is the one that was copied.
  const run: ToolPaneRun | null =
    copied === null || copied.citation !== citation
      ? null
      : copied.done
        ? { state: "success", text: "The citation was copied." }
        : {
            state: "warning",
            text: "The browser did not allow the copy. The citation is selected; copy it with the keyboard.",
          };

  return (
    <ToolPane
      id="citation"
      title="Citation"
      info="This tool gives the text that cites the data, the method and Lynkeus for the layer that is selected in the Contents pane."
      runLabel="Copy citation"
      onRun={copy}
      ready={citation !== null}
      missing={citationMissing(layer, hasLayers, sources)}
      run={run}
    >
      <CitationFields layer={layer} citation={citation} reading={reading} field={field} />
    </ToolPane>
  );
}

/** The tool panes of the Share tab. Each one is drawn while its button of the ribbon has opened it. */
export function SharePanes() {
  return (
    <>
      <MapImagePane />
      <RecordPane />
      <LayoutPane />
      <LinkPane />
      <CitationPane />
    </>
  );
}
