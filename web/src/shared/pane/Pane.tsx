import type { ReactNode } from "react";
import { paneHoldsFocus, passFocus } from "../dock/dock";
import { DockPane } from "../dock/DockPane";
import { panesStore, setPaneOpen, type PaneId } from "../panes";
import { useStore } from "../store";

interface PaneProps {
  id: PaneId;
  /** Name of the pane, shown at its top. */
  title: string;
  children: ReactNode;
}

/**
 * The frame of the Contents pane or of the Catalog pane: its title, its close button and its content, which
 * scrolls. The pane stands in the stack of its side of the map (see `Dock`). When it closes with the keyboard
 * focus inside it, the focus moves to the map.
 */
export function Pane({ id, title, children }: PaneProps) {
  const { open } = useStore(panesStore)[id];

  if (!open) {
    return null;
  }

  const close = () => {
    const held = paneHoldsFocus(id);
    setPaneOpen(id, false);
    if (held) {
      passFocus();
    }
  };

  return (
    <DockPane id={id} title={title} onClose={close}>
      <div className="pane-body">{children}</div>
    </DockPane>
  );
}
