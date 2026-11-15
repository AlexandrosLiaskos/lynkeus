import type { Method } from "./methods";
import type { FinishedTool } from "./tools";

/**
 * The summary of the method of each finished tool: the title of its method sheet in `docs/methods/` and the rows
 * of the section In brief of that sheet. The interface is built without the folder `docs/`, so the texts stand
 * here, and the test `methodSheets.test.ts` requires each row to equal the row of its sheet. A change of a sheet
 * is repeated here.
 */
export const METHODS: Record<FinishedTool, Method> = {
  "backscatter-state": {
    title: "Backscatter, One date",
    rows: [
      {
        name: "What it shows",
        text: "The radar backscatter (gamma0) of one date, in decibels.",
      },
      {
        name: "Input",
        text: "One backscatter layer of a GCOV product: `HHHH`, `HVHV`, `VHVH`, `VVVV`, `RHRH` or `RVRV`.",
      },
      {
        name: "Formula",
        text: "`10 * log10(gamma0)`",
      },
      {
        name: "Result",
        text: "Decibels (dB). The legend runs from the 5th to the 95th percentile of the result, in grey.",
      },
      {
        name: "How to read",
        text: "A higher value means that the surface returned more of the radar signal. A step of 10 dB is a factor of ten in power. The return depends on the roughness, the moisture and the material of the surface.",
      },
      {
        name: "Limits",
        text: "The tool applies no mask of the product. The range of the legend is computed for each result, so two dates have different ranges.",
      },
      {
        name: "Checked",
        text: "The result equals that of the notebook of the ASF NISAR Cookbook in every cell of the test area (lower Merrimack River, 21 Oct and 2 Nov 2026).",
      },
      {
        name: "References",
        text: "[NISAR L2 GCOV Product Specification, JPL D-102274 Rev F](https://nisar-docs.asf.alaska.edu/product-specification/). [ASF NISAR Cookbook](https://github.com/ASFOpenSARlab/NISAR_Cookbook).",
      },
    ],
  },
  "backscatter-change": {
    title: "Backscatter, Change",
    rows: [
      {
        name: "What it shows",
        text: "The change of the radar backscatter (gamma0) between two dates, in decibels.",
      },
      {
        name: "Input",
        text: "The same backscatter layer of two GCOV products of one track, direction and frame.",
      },
      {
        name: "Formula",
        text: "`10 * log10(gamma0_later / gamma0_earlier)`",
      },
      {
        name: "Result",
        text: "Decibels (dB). The legend runs from −r to +r, where r is the 99th percentile of the absolute change. Red is a decrease and blue an increase.",
      },
      {
        name: "How to read",
        text: "A positive value means that the surface returned more signal on the later date, and a negative value less. 3 dB is about a factor of two in power. The cause of a change is for the user to establish.",
      },
      {
        name: "Limits",
        text: "The tool applies no mask of the product and sets no threshold. On the test pair, twelve days apart, 90 % of the cells lie between −4.30 and +4.27 dB.",
      },
      {
        name: "Checked",
        text: "The result equals that of the notebook of the ASF NISAR Cookbook in every cell of the test area (lower Merrimack River, 21 Oct to 2 Nov 2026).",
      },
      {
        name: "References",
        text: "[Rignot and van Zyl (1993)](https://doi.org/10.1109/36.239913), of which the abstract was read. [ASF NISAR Cookbook](https://github.com/ASFOpenSARlab/NISAR_Cookbook). [NISAR L2 GCOV Product Specification, JPL D-102274 Rev F](https://nisar-docs.asf.alaska.edu/product-specification/).",
      },
    ],
  },
  "coherence-state": {
    title: "Coherence, One pair",
    rows: [
      {
        name: "What it shows",
        text: "The interferometric coherence of one pair of dates, from 0 to 1.",
      },
      {
        name: "Input",
        text: "One coherence layer (`coherenceMagnitude`) of a GUNW product.",
      },
      {
        name: "Formula",
        text: "The layer of the product, unchanged. The mission computes it as `|<s1 * conj(s2)>| / sqrt(<|s1|^2> * <|s2|^2>)`.",
      },
      {
        name: "Result",
        text: "Without unit. The legend runs from 0 to 1, in grey.",
      },
      {
        name: "How to read",
        text: "Near 1, the radar echoes of the two dates are alike. Near 0, they differ. A low value has several possible causes, and a change of the surface is one of them.",
      },
      {
        name: "Limits",
        text: "The tool applies no mask of the product and sets no threshold. Zoomed out, the map shows the mean coherence of the cells that each drawn cell covers.",
      },
      {
        name: "Checked",
        text: "The result equals the layer of the product file in every cell of the test area (lower Merrimack River, pair of 9 and 21 Oct 2026).",
      },
      {
        name: "References",
        text: "[NISAR L2 GUNW Product Specification, JPL D-102272 Rev E](https://nisar-docs.asf.alaska.edu/product-specification/). [Touzi et al. (1999)](https://doi.org/10.1109/36.739146) and [Zebker and Villasenor (1992)](https://doi.org/10.1109/36.175330), of which the abstracts were read.",
      },
    ],
  },
};
