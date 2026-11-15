// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { LARGER_LAYER, limitSentences, resourcesSentence, serverVersionSentence, versionSentence } from "./sentences";
import { SAMPLE, sampleWith } from "./testLimits";

test("the first sentence names the version and says that the application is under development", () => {
  expect(versionSentence("0.1.0")).toBe(
    "This is version 0.1.0 of Lynkeus. The application is under development, and its functions and its limits may change.",
  );
});

test("the version of the server is named only when it differs from the version of the page", () => {
  expect(serverVersionSentence("0.1.0", "0.1.0")).toBeNull();
  expect(serverVersionSentence("0.1.0", "0.2.0")).toBe(
    "The server runs version 0.2.0. Reload the page to receive the same version.",
  );
});

test("the resources are said in the numbers of the answer", () => {
  expect(resourcesSentence(SAMPLE.resources)).toBe(
    "Lynkeus runs on a server where it may use 2 processors and 2 GB of memory.",
  );
  expect(resourcesSentence({ processors: 1, memory: 536870912 })).toBe(
    "Lynkeus runs on a server where it may use 1 processor and 512 MB of memory.",
  );
});

test("a resource that the server could not read is said to be unread", () => {
  expect(resourcesSentence({ processors: 2, memory: null })).toBe(
    "Lynkeus runs on a server where it may use 2 processors. The memory that it may use could not be read.",
  );
  expect(resourcesSentence({ processors: null, memory: 2147483648 })).toBe(
    "Lynkeus runs on a server where it may use 2 GB of memory. The number of processors that it may use could not be read.",
  );
  expect(resourcesSentence({ processors: null, memory: null })).toBe(
    "The processors and the memory that Lynkeus may use on its server could not be read.",
  );
});

test("each limit is said with its reason, in the numbers of the answer", () => {
  expect(limitSentences(SAMPLE)).toEqual([
    "A layer may hold at most 25 million cells, because Lynkeus has 2 GB of memory and runs 2 jobs at once. An area that needs more cells is refused.",
    "At most 2 jobs run at once, because Lynkeus has 2 processors. A job may run for at most 40 minutes, which covers the wait for NASA Harmony and the writing of the layer.",
    "A session may have at most 4 jobs waiting or running, so that one visitor does not fill the queue, which holds at most 20 jobs of all sessions.",
    "A session may keep at most 50 layers and 2 GB of files, and the files of one layer may take at most 500 MB, because the layers of all sessions share 20 GB of the disk of the server.",
    "A search lists at most 200 products at a time. The Catalog pane loads the next ones on request.",
    "A session that is not used for 7 days is removed with its jobs and its layers, which frees their storage.",
    "A sign-in to Earthdata ends after 30 minutes without use, and after 8 hours at the latest, because the server keeps the Earthdata token for a limited time only.",
  ]);
});

test("the sentences follow other numbers of the answer", () => {
  const sentences = limitSentences(
    sampleWith(
      {
        layer_cells: 36000000,
        layer_size: 750000000,
        running_jobs: 3,
        waiting_jobs: 30,
        job_time: 3600,
        session_unfinished_jobs: 1,
        session_layers: 1,
        session_size: 4000000000,
        total_size: 40000000000,
        search_products: 100,
        session_idle_time: 86400,
        earthdata_idle_time: 900,
        earthdata_time: 3600,
      },
      { processors: 4, memory: 4294967296 },
    ),
  );
  expect(sentences).toEqual([
    "A layer may hold at most 36 million cells, because Lynkeus has 4 GB of memory and runs 3 jobs at once. An area that needs more cells is refused.",
    "At most 3 jobs run at once, because Lynkeus has 4 processors. A job may run for at most 1 hour, which covers the wait for NASA Harmony and the writing of the layer.",
    "A session may have at most 1 job waiting or running, so that one visitor does not fill the queue, which holds at most 30 jobs of all sessions.",
    "A session may keep at most 1 layer and 4 GB of files, and the files of one layer may take at most 750 MB, because the layers of all sessions share 40 GB of the disk of the server.",
    "A search lists at most 100 products at a time. The Catalog pane loads the next ones on request.",
    "A session that is not used for 1 day is removed with its jobs and its layers, which frees their storage.",
    "A sign-in to Earthdata ends after 15 minutes without use, and after 1 hour at the latest, because the server keeps the Earthdata token for a limited time only.",
  ]);
});

test("the value of the server chooses what is said of a larger area", () => {
  const [refused] = limitSentences(SAMPLE);
  const [coarser] = limitSentences(sampleWith({ larger_layer: "coarser" }));
  expect(refused?.endsWith(` ${LARGER_LAYER.refused}`)).toBe(true);
  expect(coarser).toBe(
    "A layer may hold at most 25 million cells, because Lynkeus has 2 GB of memory and runs 2 jobs at once. A larger area is received at a coarser cell size.",
  );
  expect(LARGER_LAYER.refused).toBe("An area that needs more cells is refused.");
});

test("a reason that needs a resource is said without its number when the resource is not known", () => {
  const [cells, jobs] = limitSentences(sampleWith({ running_jobs: 1 }, { processors: null, memory: null }));
  expect(cells).toBe(
    "A layer may hold at most 25 million cells, because the memory of Lynkeus is limited and it runs 1 job at once. An area that needs more cells is refused.",
  );
  expect(jobs).toBe(
    "At most 1 job runs at once. A job may run for at most 40 minutes, which covers the wait for NASA Harmony and the writing of the layer.",
  );
});

test("one processor is said in the singular", () => {
  const [, jobs] = limitSentences(sampleWith({ running_jobs: 1 }, { processors: 1 }));
  expect(jobs?.startsWith("At most 1 job runs at once, because Lynkeus has 1 processor. ")).toBe(true);
});
