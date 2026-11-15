// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useState } from "react";
import { layersStore } from "../data/layers";
import { seriesStore } from "../data/series";
import { wordsOf } from "../data/service";
import { limitsStore } from "../header/notice/limits";
import { report } from "../shared/messages/messages";
import { Notice } from "../shared/notice/Notice";
import { useStore } from "../shared/store";
import { extendAll, keptAllWords, removalSentence, removalsOf, useNow } from "./keeping";

/**
 * The notice of the Catalog pane about what the project server removes soon (`docs/Storage.md`): how many
 * layers and series are removed within the days of the warning, the reminder that a downloaded file is the
 * permanent copy, and the command Keep all, which keeps everything of the account for the keeping time from now.
 * It is one notice for the whole page, it shows when the lists are first read, and it leaves when nothing is
 * removed within those days. Closed with its X, it stays closed until its numbers change or the pane opens again,
 * as every notice does.
 */
export function RemovalNotice() {
  const layers = useStore(layersStore);
  const series = useStore(seriesStore);
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const sentence = removalSentence(removalsOf(layers, series, now));

  if (sentence === null) {
    return null;
  }

  const keep = () => {
    if (busy) {
      return;
    }
    setBusy(true);
    extendAll()
      .then(() => report("info", keptAllWords(limitsStore.get())))
      .catch((error: unknown) => report("error", wordsOf(error, "The layers and the series could not be kept longer.")))
      .finally(() => setBusy(false));
  };

  return (
    <Notice kind="warning" action={{ label: "Keep all", onClick: keep }}>
      {sentence}
    </Notice>
  );
}
