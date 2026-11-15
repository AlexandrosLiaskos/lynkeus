// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { selectedLayerStore, SYMBOLOGY_PANE, symbologyStore } from "../contents/state";
import { layersStore } from "../data/layers";
import { useSession } from "../data/session";
import { SIGN_IN_PANE } from "../data/SignInPane";
import { GET_LAYER_PANE, productsStore, SEARCH_PANE } from "../data/state";
import type { ShareToolId } from "../share/tab";
import { openToolPane } from "../shared/dock/dock";
import { Icon } from "../shared/icon/Icon";
import { mapLayersStore } from "../shared/mapLayers";
import { report } from "../shared/messages/messages";
import { useStore } from "../shared/store";
import { InfoPane } from "../shared/toolpane/InfoPane";
import { GETTING_STARTED_PANE } from "./state";

/** The panes of the Share tab that the last step opens, by the names of their ribbon buttons. */
const SHARE_PANES = {
  image: "export-map-image",
  record: "export-record",
  citation: "citation",
} as const satisfies Record<string, ShareToolId>;

/** What the step Display the layer says when the map shows no layer. */
export const NO_LAYER_ON_MAP = "The map shows no layer. Get a layer first, then open Symbology.";

/**
 * Open the Symbology pane for the layer that is selected in the Contents pane or, when none is selected, for the
 * top layer of the map. A map without a layer gives a message.
 */
export function openSymbology(): void {
  const layers = mapLayersStore.get();
  const layer = layers.find(({ id }) => id === selectedLayerStore.get()) ?? layers.at(-1);
  if (!layer) {
    report("warning", NO_LAYER_ON_MAP);
    return;
  }
  symbologyStore.set({ id: layer.id, time: Date.now() });
  openToolPane(SYMBOLOGY_PANE);
}

/** A command of a step: its label and what it does. */
interface Command {
  label: string;
  run: () => void;
}

/** A step of the work. */
interface Step {
  /** Name of the step. */
  title: string;
  /** What the step does, in one sentence. */
  text: string;
  /** The button of the step, which opens its tool. */
  button: Command;
  /** The other tools of the step, as links beside the button. */
  links?: readonly Command[];
}

/** The steps of the work, in order: from the sign-in to Earthdata to the shared map. */
export const STEPS: readonly Step[] = [
  {
    title: "Sign in to Earthdata",
    text: "A layer is requested from NASA with your Earthdata account.",
    button: { label: "Sign in", run: () => openToolPane(SIGN_IN_PANE) },
  },
  {
    title: "Search products",
    text: "The search lists the NISAR products of an area and a period in the Catalog pane.",
    button: { label: "Search products", run: () => openToolPane(SEARCH_PANE) },
  },
  {
    title: "Get layer",
    text: "A layer of the selected product is requested from NASA, clipped to the area, and listed in the Catalog pane.",
    button: { label: "Get layer", run: () => openToolPane(GET_LAYER_PANE) },
  },
  {
    title: "Display the layer",
    text: "The Contents pane lists the layers of the map, and Symbology sets the colours and the range of a layer.",
    button: { label: "Open Symbology", run: openSymbology },
  },
  {
    title: "Share",
    text: "The Share tab saves the map as an image and gives the record and the citation of the selected layer.",
    button: { label: "Save map image", run: () => openToolPane(SHARE_PANES.image) },
    links: [
      { label: "Save record", run: () => openToolPane(SHARE_PANES.record) },
      { label: "Copy citation", run: () => openToolPane(SHARE_PANES.citation) },
    ],
  },
];

/**
 * Tell for each step whether its result exists: the visitor is signed in to Earthdata, the last search found
 * products, the session holds a layer, and the map shows a layer. The last step has no result that the page keeps.
 */
function useStepsDone(): readonly boolean[] {
  const signedIn = useSession().state === "signed-in";
  const found = (useStore(productsStore)?.products.length ?? 0) > 0;
  const received = useStore(layersStore).length > 0;
  const shown = useStore(mapLayersStore).length > 0;
  return [signedIn, found, received, shown, false];
}

/**
 * The pane Getting started of the Help tab: the steps of the work in order, each with its name, one sentence and
 * the button that opens its tool. A step whose result exists carries a check mark, and the first step without one
 * is the next step: its button is the one filled button of the pane. The pane stands in the stack on the right of
 * the map as a tool pane does, so the tool that a step opens comes to the front and the steps stay one tab away.
 * It opens only from its ribbon button.
 */
export function GettingStartedPane() {
  const done = useStepsDone();
  const next = done.indexOf(false);

  return (
    <InfoPane
      id={GETTING_STARTED_PANE}
      title="Getting started"
      info="The steps of the work, in order. A check mark stands on a step whose result exists, and the filled button opens the next step."
    >
      <ol className="item-list start-steps" aria-label="Steps of the work">
        {STEPS.map(({ title, text, button, links = [] }, index) => (
          <li key={title} className="item start-step" aria-current={index === next ? "step" : undefined}>
            {done[index] ? (
              <span className="start-step-mark start-step-mark--done" role="img" aria-label="Done">
                <Icon name="check_circle" />
              </span>
            ) : (
              <span className="start-step-mark" aria-hidden="true">
                {index + 1}
              </span>
            )}
            <div className="item-main">
              <h3 className="item-title">{title}</h3>
              <p className="item-line">{text}</p>
              <div className="start-step-actions">
                <button
                  type="button"
                  className={index === next ? "usa-button" : "usa-button usa-button--outline"}
                  onClick={button.run}
                >
                  {button.label}
                </button>
                {links.map(({ label, run }) => (
                  <button key={label} type="button" className="usa-button usa-button--unstyled" onClick={run}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </InfoPane>
  );
}
