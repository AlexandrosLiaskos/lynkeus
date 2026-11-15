// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { ServiceLimits } from "./limits";

/**
 * An answer of the server, for the tests. Its numbers are an example and not a source: the page reads the
 * numbers of the limits from the server.
 */
export const SAMPLE: ServiceLimits = {
  version: "0.1.0",
  resources: { processors: 2, memory: 2147483648, free_space: 18000000000 },
  limits: {
    layer_cells: 25000000,
    larger_layer: "refused",
    layer_size: 500000000,
    running_jobs: 2,
    waiting_jobs: 20,
    job_time: 2400,
    account_unfinished_jobs: 4,
    account_layers: 50,
    account_series: 20,
    account_size: 2000000000,
    total_size: 20000000000,
    search_products: 200,
    keep_time: 1209600,
    free_space_reserve: 2000000000,
    earthdata_idle_time: 1800,
    earthdata_time: 28800,
  },
};

/** The sample with some of its limits or resources replaced. */
export function sampleWith(
  limits: Partial<ServiceLimits["limits"]>,
  resources: Partial<ServiceLimits["resources"]> = {},
): ServiceLimits {
  return {
    ...SAMPLE,
    resources: { ...SAMPLE.resources, ...resources },
    limits: { ...SAMPLE.limits, ...limits },
  };
}
