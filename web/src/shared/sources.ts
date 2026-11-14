/** A method, a program or a dataset that Lynkeus uses. The Help tab lists them all. */
export interface Source {
  name: string;
  /** Version of a program, or of a dataset that has one. */
  version?: string;
  licence: string;
  /** Address of the source. */
  url: string;
  /** What Lynkeus uses it for. */
  use: string;
}
