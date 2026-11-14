import { getDecoder } from "geotiff";

// A program that runs beside the page and decompresses the tiles of a GeoTIFF, so that the page stays responsive
// while a layer is read. It is a file of the site, because the security policy of the web server accepts programs
// only from the site.

/** What the page sends for one tile: how its bytes are compressed, and the bytes. */
interface Job {
  compression: number;
  decoderParameters: Parameters<typeof getDecoder>[1];
  buffer: ArrayBuffer;
  jobId: number;
}

/** The functions of this program that receive and send messages. */
interface Scope {
  addEventListener: (type: "message", listener: (event: MessageEvent<Job>) => void) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
}

const scope = globalThis as unknown as Scope;

async function decode({ compression, decoderParameters, buffer, jobId }: Job): Promise<void> {
  try {
    const decoder = await getDecoder(compression, decoderParameters);
    const decoded = await decoder.decode(buffer);
    scope.postMessage({ decoded, jobId }, [decoded as ArrayBuffer]);
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : String(error), jobId });
  }
}

scope.addEventListener("message", (event) => {
  void decode(event.data);
});
