/**
 * The memory that a job holds while it receives and writes a layer, from the cells of the layer. The rule is the
 * one of `lynkeus.computer` (`job_memory`), with which the project server tells whether the running jobs of a
 * server fit in its memory. The project server gives the interface no number of it, so the two constants are
 * written here again, and a test compares them with the code of the server.
 */

/** The memory that a job holds whatever the cells of its layer, in bytes (`JOB_BASE_MEMORY`). */
export const JOB_BASE_MEMORY = 200_000_000;

/** The memory that a job holds for every cell of the layer that it receives, in bytes (`CELL_MEMORY`). */
export const CELL_MEMORY = 16;

/** Return the memory that a job holds while it receives a layer of that many cells, in bytes. */
export function jobMemory(cells: number): number {
  return JOB_BASE_MEMORY + CELL_MEMORY * Math.max(cells, 0);
}

/** Return how many jobs that each receive a layer of that many cells fit in a memory given in bytes. */
export function jobsInMemory(cells: number, memory: number): number {
  return Math.floor(memory / jobMemory(cells));
}
