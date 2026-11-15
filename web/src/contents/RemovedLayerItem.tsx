// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useState } from "react";
import { againStore, getAgain } from "../data/again";
import { isUnfinished, jobsStore } from "../data/jobs";
import { layersStore } from "../data/layers";
import { SignInCancelled, wordsOf } from "../data/service";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { serverOfAddress, serversStore } from "../shared/servers";
import { useStore } from "../shared/store";
import { IconButton } from "../shared/toolbar/IconButton";
import { formatDates } from "./dates";
import { forgetKept, keptStore, type KeptLayer } from "./kept";
import { REMOVED_MARK, removedCommand, removedWords, STATE_COMMANDS } from "./keptWords";
import { nameButtonId } from "./LayerItem";

interface RemovedLayerItemProps {
  kept: KeptLayer;
  /** Called after the layer has left the list. */
  onForgotten: (id: string) => void;
}

/**
 * The row of a layer that the browser keeps for the map and the server has removed (`docs/Storage.md`, States
 * of a stored layer). The layer is not drawn, so the row has no box, no legend and no opacity. It names the
 * layer, says that the server removed it, and states in a notice why and how the layer is made again. A received
 * layer offers Get again, which sends the request that made it; the new layer then takes the place and the
 * display of this one. A result names its tool and its inputs. Both offer Remove from the map, which takes the
 * layer out of the list and out of the browser.
 */
export function RemovedLayerItem({ kept, onForgotten }: RemovedLayerItemProps) {
  const { layer, source } = kept;
  const servers = useStore(serversStore)?.servers ?? [];
  const keeper = serverOfAddress(layer.url);
  const server = keeper === null ? null : (servers.find(({ id }) => id === keeper)?.name ?? "");
  const again = useStore(againStore)[layer.id];
  const job = useStore(jobsStore).find((other) => other.jobID === again && isUnfinished(other)) ?? null;
  const entries = useStore(layersStore);
  const others = useStore(keptStore);
  const [sending, setSending] = useState(false);

  const remove = () => {
    forgetKept([layer.id]);
    onForgotten(layer.id);
  };

  const get = () => {
    if (sending || source === null) {
      return;
    }
    setSending(true);
    getAgain(layer.id, source, layer.url)
      .catch((error: unknown) => {
        // A sign-in that the visitor gave up leaves the row as it was.
        if (!(error instanceof SignInCancelled)) {
          report("error", wordsOf(error, "The layer could not be requested again."));
        }
      })
      .finally(() => setSending(false));
  };

  const command = removedCommand(kept, job);
  const known = [...entries.map((entry) => entry.layer), ...others.map((other) => other.layer)];

  return (
    <li className="contents-layer contents-layer--removed">
      <div className="contents-row">
        <div className="contents-name contents-name--removed" id={nameButtonId(layer.id)} tabIndex={-1}>
          <span className="item-title">{layer.title}</span>{" "}
          <span className="item-line">
            {formatDates(layer.dates)} · {REMOVED_MARK}
          </span>
        </div>
        <IconButton icon="close" label={STATE_COMMANDS.removeFromMap} onClick={remove} />
      </div>
      <div className="contents-details">
        <Notice
          kind={job === null ? "warning" : "info"}
          action={
            command === null
              ? undefined
              : { label: STATE_COMMANDS[command], onClick: command === "getAgain" ? get : remove }
          }
        >
          {removedWords(kept, { server, job, known })}
        </Notice>
      </div>
    </li>
  );
}
