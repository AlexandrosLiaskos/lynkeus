import type { ReactNode } from "react";
import { closeToolPane, dockStore } from "../dock/dock";
import { DockPane } from "../dock/DockPane";
import { useStore } from "../store";

interface InfoPaneProps {
  /** Unique name of the pane: the name of the ribbon button that opens it with `openToolPane`. */
  id: string;
  /** Name of the pane, shown at its top and on its tab. */
  title: string;
  /** What the pane shows, in complete sentences. It shows from the "i" beside the title. */
  info?: ReactNode;
  /** Called after the user has closed the pane. */
  onClose?: () => void;
  /** The content of the pane, which scrolls. */
  children: ReactNode;
}

/**
 * A pane on the right of the map that shows something to read or to choose from and runs no tool: it has the
 * title bar and the body of a tool pane, and no form, no run button and no foot. It stands in the same stack as
 * the tool panes, opens with `openToolPane(id)` and closes with `closeToolPane(id)`, and its content is drawn only
 * while it is open. A pane whose content is the form of a tool is a `ToolPane`.
 *
 *     <InfoPane id="getting-started" title="Getting started" info="The steps of the work, in order.">
 *       <ol className="item-list">…</ol>
 *     </InfoPane>
 */
export function InfoPane({ id, title, info, onClose, children }: InfoPaneProps) {
  const open = useStore(dockStore).tools.includes(id);

  if (!open) {
    return null;
  }

  const close = () => {
    closeToolPane(id);
    onClose?.();
  };

  return (
    <DockPane id={id} title={title} info={info} onClose={close}>
      <div className="pane-body">{children}</div>
    </DockPane>
  );
}
