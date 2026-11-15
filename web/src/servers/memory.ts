/**
 * The memory that a job holds while it receives a layer, from the cells of the layer. The rule mirrors the one
 * of `lynkeus.computer` (`docs/Own_Servers.md`, Cells of a layer): the project server gives the interface no
 * number of it, so the two constants are written here again and a test compares them with the code of the
 * server.
 */

/** The memory that a job holds before the first cell of its layer, in bytes. */
export const JOB_BASE_MEMORY = 120_500_000;

/** The memory that a job holds for each cell of its layer, in bytes. */
export const CELL_MEMORY = 15.5;

/** Return the memory that a job needs to receive a layer of that many cells, in bytes. */
export function jobMemory(cells: number): number {
  return Math.ceil(JOB_BASE_MEMORY + CELL_MEMORY * cells);
}

/** Return how many jobs that each receive a layer of that many cells fit in a memory given in bytes. */
export function jobsInMemory(cells: number, memory: number): number {
  return Math.floor(memory / jobMemory(cells));
}
