import type { Method } from "./methods";
import type { SheetTool } from "./series";

/**
 * The summary of the method of each finished tool: the title of its method sheet in `docs/methods/` and the rows
 * of the section In brief of that sheet. The interface is built without the folder `docs/`, so the texts stand
 * here, and the test `methodSheets.test.ts` requires each row to equal the row of its sheet. A change of a sheet
 * is repeated here.
 */
export const METHODS: Record<SheetTool, Method> = {
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
  "coherence-change": {
    title: "Coherence, Change",
    rows: [
      {
        name: "What it shows",
        text: "The change between two pairs of dates of the interferometric coherence, a value from 0 to 1 that states how alike the radar echoes of two dates are.",
      },
      {
        name: "Input",
        text: "The same coherence layer (`coherenceMagnitude`) of two GUNW products of one track, direction and frame. The two pairs of dates span the same number of days and do not overlap.",
      },
      {
        name: "Formula",
        text: "`coherence_of_the_later_pair - coherence_of_the_earlier_pair`",
      },
      {
        name: "Result",
        text: "Without unit. The legend runs from −1 to 1. Red is a decrease and blue an increase.",
      },
      {
        name: "How to read",
        text: "A positive value means that the radar echoes of the later pair are more alike than those of the earlier pair, and a negative value that they are less alike. The map does not state the cause: rain, snow, the growth of plants and farming also change the coherence. On the test area the mean change between pairs of 12 days without a known event lies between −0.242 and 0.200 (20 m layers).",
      },
      {
        name: "Limits",
        text: "The result is the later pair minus the earlier pair, and the two pairs must span the same number of days. The tool accepts a provisional and a validated product together, and whether their coherence is comparable is not confirmed. The comparison was made with a general raster program, on files that Lynkeus wrote.",
      },
      {
        name: "Checked",
        text: "The result equals that of the program `gdal raster calc` of GDAL 3.12.2 in every cell, for five pairs of coherence layers of the test area (lower Merrimack River, channel HH, pairs of dates between 10 Aug and 21 Oct 2026). Both programs read the same files, which Lynkeus wrote and which were not compared with the product files.",
      },
      {
        name: "References",
        text: "[Fielding et al. (2005)](https://doi.org/10.1029/2004JB003299), of which the abstract was read. [Stephenson et al. (2022)](https://doi.org/10.1109/TGRS.2021.3084209), read as the accepted manuscript, and [Plank (2014)](https://doi.org/10.3390/rs6064870). [NISAR L2 GUNW Product Specification, JPL D-102272 Rev E](https://nisar-docs.asf.alaska.edu/product-specification/).",
      },
    ],
  },
  "displacement-state": {
    title: "Surface displacement, One pair",
    rows: [
      {
        name: "What it shows",
        text: "The movement of the ground toward or away from the radar along its viewing direction between the two dates of one pair, relative to an unknown level, so only differences inside one map carry meaning.",
      },
      {
        name: "Input",
        text: "The Unwrapped phase layer (`unwrappedPhase`) and the Connected components layer (`connectedComponents`) of one GUNW product, channel and area. The phase holds the change of the distance to the radar as an angle. The components mark the cells where that angle is unreliable.",
      },
      {
        name: "Formula",
        text: "`displacement = -wavelength / (4 * pi) * phase`, with the wavelength as the speed of light divided by the centre frequency of the product. Cells of the connected component 0 are left empty.",
      },
      {
        name: "Result",
        text: "Metres (m), positive toward the radar. The legend runs from the 2nd to the 98th percentile of the result, from red (away from the radar) to blue (toward the radar).",
      },
      {
        name: "How to read",
        text: "A higher value is a movement toward the radar relative to a lower value. The radar looks at the ground from the side, so a value is neither a vertical nor a horizontal movement. The value of one cell alone is not a measurement: compare cells inside one map.",
      },
      {
        name: "Limits",
        text: "The values are not corrected for the atmosphere or the solid Earth tides; 96 % of the cells of the two test pairs span 0.10 m and 0.09 m, and the test area has no ground movement known to compare with. The sign was derived from the software of the mission and was not checked on ground with a known movement. Cells where the unwrapping is unreliable are left empty.",
      },
      {
        name: "Checked",
        text: "The result equals the output of the function `scale_data2disp_unit` of MintPy 1.6.4 for the same phase and wavelength, in every cell with a value (lower Merrimack River, pairs of 27 Sep to 9 Oct and 9 to 21 Oct 2026, channel HH). The empty cells were checked by a count. No ground with a known movement was compared.",
      },
      {
        name: "References",
        text: "[NISAR L1 and L2 Algorithm Theoretical Basis Document, JPL D-95677 Rev A](https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-95677_NASA_L1_L2_ATBD_20231112_R3.4_w-sigs.pdf). [NISAR L2 GUNW Product Specification, JPL D-102272 Rev E](https://nisar-docs.asf.alaska.edu/product-specification/). [ISCE3 0.25.21](https://github.com/isce-framework/isce3) and [MintPy 1.6.4](https://github.com/insarlab/MintPy).",
      },
    ],
  },
  "soil-moisture-state": {
    title: "Soil moisture, One date",
    rows: [
      {
        name: "What it shows",
        text: "The soil moisture of one date, as the mission retrieved it from the radar backscatter: the volume of water in a volume of soil.",
      },
      {
        name: "Input",
        text: "The layer `soilMoisture` of an SME2 product, on a grid of 200 m.",
      },
      {
        name: "Formula",
        text: "The layer of the product, unchanged. The mission computes it as the mean of the retrievals of up to three algorithms.",
      },
      {
        name: "Result",
        text: "Cubic metres of water in a cubic metre of soil (m3 m-3). The legend runs from 0.02 to 0.60 m3 m-3 for every date, from light yellow to dark blue.",
      },
      {
        name: "How to read",
        text: "A higher value is a wetter soil. The mission states for the product the soil layer from 0 to 5 cm and an accuracy goal of 0.06 m3 m-3 where the vegetation is not dense.",
      },
      {
        name: "Limits",
        text: "The products themselves mark most cells as not recommended: 97.9 % to 98.6 % of the cells with a value in the test area (lowest bit of the layer `retrievalQualityFlag`). The tool maps every cell and does not read that flag. Only provisional products existed for the test area on 15 Nov 2026.",
      },
      {
        name: "Checked",
        text: "The result equals the layer `soilMoisture` of the product file in every cell of the test area (lower Merrimack River, 27 Sep and 9 Oct 2026).",
      },
      {
        name: "References",
        text: "[NISAR L3 SME2 Product Specification, JPL D-107677 Rev C](https://nisar-docs.asf.alaska.edu/product-specification/). [NISAR L3 Soil Moisture ATBD, JPL D-107679 Release 3.3](https://nisar-docs.asf.alaska.edu/atbd/).",
      },
    ],
  },
  "soil-moisture-change": {
    title: "Soil moisture, Change",
    rows: [
      {
        name: "What it shows",
        text: "The change of the soil moisture between two dates, in cubic metres of water in a cubic metre of soil.",
      },
      {
        name: "Input",
        text: "The layer `soilMoisture` of two SME2 products of one track, direction and frame.",
      },
      {
        name: "Formula",
        text: "`soil_moisture_later - soil_moisture_earlier`",
      },
      {
        name: "Result",
        text: "Cubic metres of water in a cubic metre of soil (m3 m-3). The legend runs from −r to +r, where r is the 99th percentile of the absolute change. Red is a decrease and blue an increase.",
      },
      {
        name: "How to read",
        text: "A positive value means that the product gives a higher soil moisture on the later date, and a negative value a lower one. The map does not state the cause of a change. The errors of the soil moisture of both dates enter the result, and no document that was read states the accuracy of the difference.",
      },
      {
        name: "Limits",
        text: "The products themselves mark most cells as not recommended: 97.9 % to 98.6 % of the cells with a value in the test area (lowest bit of the layer `retrievalQualityFlag`). The tool maps every cell and does not read that flag, and only provisional products existed for the test area on 15 Nov 2026. The product of a date names earlier products of the same track among its inputs, so two dates are not independent measurements.",
      },
      {
        name: "Checked",
        text: "The result equals that of the program `gdal raster calc` of GDAL 3.12.2 in every cell, for three pairs of dates (15 Sep, 27 Sep and 9 Oct 2026), in the test area (lower Merrimack River) and in the whole frames. Both programs read the same GeoTIFF files, not the product files themselves. The range of the legend was compared with no other program.",
      },
      {
        name: "References",
        text: "[Singh (1989)](https://doi.org/10.1080/01431168908903939), of which section 4.1 was read. [NISAR L3 SME2 Product Specification, JPL D-107677 Rev C](https://nisar-docs.asf.alaska.edu/product-specification/).",
      },
    ],
  },
  "backscatter-series": {
    title: "Backscatter, Series",
    rows: [
      {
        name: "What it shows",
        text: "The radar backscatter (gamma0) of many dates against time, at a point or as the mean of the area, in decibels.",
      },
      {
        name: "Input",
        text: "The same backscatter layer of 2 to 50 GCOV products of one track, direction and frame, one for each date. A point is given by its latitude and longitude.",
      },
      {
        name: "Formula",
        text: "`10 * log10(mean(gamma0))` over the cells of each date. At a point it is the one cell that holds the point.",
      },
      {
        name: "Result",
        text: "A series in decibels (dB): one value for each date, with the number of cells behind it. It is shown as a chart and a table, and it has no file.",
      },
      {
        name: "How to read",
        text: "Each value is one date. A higher value means that the surface returned more of the radar signal on that date. The cause of a change is for the user to establish.",
      },
      {
        name: "Limits",
        text: "The values may come from products of two processing releases, provisional and validated, and it is not confirmed that they compare without a correction. Over an area the value is the mean of the power, given in decibels. One area and four dates were compared.",
      },
      {
        name: "Checked",
        text: "For the mean of the area and at five points, the values differ from those of the notebooks of the ASF NISAR Cookbook by less than 0.00001 dB (lower Merrimack River, 27 Sep to 2 Nov 2026).",
      },
      {
        name: "References",
        text: "[ASF NISAR Cookbook](https://github.com/ASFOpenSARlab/NISAR_Cookbook). [NISAR L2 GCOV Product Specification, JPL D-102274 Rev F](https://nisar-docs.asf.alaska.edu/product-specification/). [SDS Product File Naming Conventions, JPL D-102255 Rev C](https://nisar-docs.asf.alaska.edu/naming-conventions/).",
      },
    ],
  },
  "coherence-series": {
    title: "Coherence, Series",
    rows: [
      {
        name: "What it shows",
        text: "The interferometric coherence of many pairs of dates against time, at a point or as the mean of the area: a value from 0 to 1 that states how alike the radar echoes of two dates are.",
      },
      {
        name: "Input",
        text: "The same coherence layer (`coherenceMagnitude`) of 2 to 50 GUNW products of one track, direction and frame, one for each pair. A point is given by its latitude and longitude.",
      },
      {
        name: "Formula",
        text: "The mean of the layer of the product over the cells of each pair. At a point it is the one cell that holds the point.",
      },
      {
        name: "Result",
        text: "A series without unit, from 0 to 1: one value for each pair, with the number of cells behind it. It is shown as a chart and a table, and it has no file.",
      },
      {
        name: "How to read",
        text: "Each value is one pair, drawn from its first to its second date. Near 1, the radar echoes of the two dates are alike, and near 0 they differ. Pairs of different spans can stand in one series.",
      },
      {
        name: "Limits",
        text: "The values may come from products of two processing releases, provisional and validated, and it is not confirmed that they compare without a correction. The mean coherence of an area is biased toward higher values (Touzi et al., 1999, abstract), and the tool applies no correction. One area and three pairs were compared.",
      },
      {
        name: "Checked",
        text: "For the mean of the area, the values differ by less than 0.0000001 from the mean that the code of a notebook of the ASF NISAR Cookbook gives on the same layers, and at five points they are equal (lower Merrimack River, 15 Sep to 21 Oct 2026).",
      },
      {
        name: "References",
        text: "[Touzi et al. (1999)](https://doi.org/10.1109/36.739146), of which the abstract was read. [NISAR L2 GUNW Product Specification, JPL D-102272 Rev E](https://nisar-docs.asf.alaska.edu/product-specification/). [ASF NISAR Cookbook](https://github.com/ASFOpenSARlab/NISAR_Cookbook).",
      },
    ],
  },
};
