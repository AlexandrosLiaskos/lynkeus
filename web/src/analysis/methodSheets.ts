import type { Method } from "./methods";
import type { FinishedTool } from "./tools";

/**
 * The texts of the method sheets of the finished tools, copied from `docs/methods/`: the title of each sheet, the
 * table under its title, its sections Reference, Input layers, Formula, Unit, Reduced copies of the result,
 * Legend, How to read the result and Comparison with the source program, and its statement on the mask of the
 * product. The interface is built
 * without the folder `docs/`, so the texts stand here, and the test `methodSheets.test.ts` compares each of them
 * with its sheet. A change of a sheet is repeated here.
 */
export const METHODS: Record<FinishedTool, Method> = {
  "backscatter-state": {
    title: "Backscatter, One date",
    summary: [
      ["Tool", "`backscatter-state` (Analysis tab, group Backscatter, button One date)"],
      ["NISAR product", "GCOV, Level-2 Geocoded Polarimetric Covariance"],
      ["Result", "Radar backscatter gamma0, in decibels (dB)"],
      [
        "State",
        "The comparison with the source program (D-17) was made on 14 Nov 2026 on the sample files of the pilot area. It was repeated independently on 15 Nov 2026, with other scripts, and gave the same numbers.",
      ],
    ],
    sections: [
      {
        title: "Reference",
        blocks: [
          {
            kind: "list",
            items: [
              "NASA SDS Product Specification, Level-2 Geocoded Polarimetric Covariance (L2 GCOV), JPL D-102274, Rev F, version 1.5.0, 8 July 2026. Sections 2.2 and 4.3.3; Table 5-3 (from page 35), Table 5-6 (page 71) and Table 5-7 (page 78). Rev F is the latest revision that the ASF DAAC publishes (<https://nisar-docs.asf.alaska.edu/product-specification/>, read 14 Nov 2026).",
              "Product specification of version 1.6.0, which the products of the pilot area follow: file [`nisar_L2_GCOV.xml`](https://github.com/isce-framework/nisarqa/blob/a8bc425f5e8873174471d6a12fe622df338623d1/src/nisarqa/product_specs/1.6.0/nisar_L2_GCOV.xml), nisarqa commit `a8bc425` of 30 Sep 2026. No PDF of this version is public. It defines the layers and fields of this sheet as version 1.5.0 does.",
              "Shiroma, G. H. X., Lavalle, M. and Buckley, S. M. (2022). An Area-Based Projection Algorithm for SAR Radiometric Terrain Correction and Geocoding. IEEE Transactions on Geoscience and Remote Sensing, 60, 1-23, Art. no. 5222723. <https://doi.org/10.1109/TGRS.2022.3147472>. The specification cites this article for the terrain correction and the geocoding (reference [RD1]; sections 2.2 and 4.3). ISCE3 writes the reference of the article into the fields `radiometricTerrainCorrectionAlgorithmReference` and `geocodingAlgorithmReference` of the group `/science/LSAR/GCOV/metadata/processingInformation/algorithms/` (specification, Table 5-6) when the terrain correction and the geocoding use the area projection (`GcovWriter.py`, lines 711 to 753, version 0.25.21). Both pilot products hold this reference in the two fields (read on 15 Nov 2026).",
              "Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C, 19 October 2025. Sections 3.7 and 3.8. The tool reads the product type of its input from the name of the product file.",
            ],
          },
        ],
      },
      {
        title: "Input layers",
        blocks: [
          {
            kind: "text",
            text: "The tool has one input.",
          },
          {
            kind: "table",
            head: ["No.", "Layer", "Path in the product", "Type", "Unit", "No data"],
            rows: [
              [
                "1",
                "One diagonal covariance term: `HHHH`, `HVHV`, `VHVH`, `VVVV`, `RHRH` or `RVRV`",
                "`/science/LSAR/GCOV/grids/frequency[A or B]/<term>`",
                "Float32",
                "`1` (linear power)",
                "`nan`",
              ],
            ],
          },
          {
            kind: "text",
            text: "The diagonal terms are real-valued and are the radar backscatter of each polarisation channel (specification, section 2.2). The values are linear power, normalised to gamma0 by the radiometric terrain correction. The files state this in the group `/science/LSAR/GCOV/metadata/processingInformation/parameters/rtc/`, where `outputBackscatterExpressionConvention` is `Linear power` and `outputBackscatterNormalizationConvention` is `gamma0`. Both pilot products hold these two values (read from the HDF5 product files on 15 Nov 2026). The specification lists the two fields (Table 5-6, page 71) and not their values. ISCE3 writes `Linear power` into every product. When the terrain correction is applied, it takes the normalisation from the run configuration, whose default is `gamma0`; otherwise it writes `beta0` ([`GcovWriter.py`, lines 773 to 788, version 0.25.21](https://github.com/isce-framework/isce3/blob/v0.25.21/python/packages/nisar/products/writers/GcovWriter.py#L773-L788)).",
          },
        ],
      },
      {
        title: "Formula",
        blocks: [
          {
            kind: "code",
            code: "gamma0_dB = 10 * log10(gamma0)",
          },
          {
            kind: "text",
            text: "The formula is the one that the GCOV files carry in `/science/LSAR/GCOV/metadata/ceosAnalysisReadyData/outputBackscatterDecibelConversionFormula`, where it reads `10*log10(<GCOV_TERM>)`. The specification lists the field (Table 5-7, page 78) and not its value; the value is the constant that ISCE3 writes ([`GcovWriter.py`, lines 494 to 497, version 0.25.21](https://github.com/isce-framework/isce3/blob/v0.25.21/python/packages/nisar/products/writers/GcovWriter.py#L494-L497)).",
          },
          {
            kind: "text",
            text: "The result of a cell is no data when the input value is one of the following:",
          },
          {
            kind: "list",
            items: ["`nan`;", "zero or negative, for which the logarithm has no finite value;", "infinite."],
          },
          {
            kind: "text",
            text: "The tool computes in 32-bit floating-point numbers, as the source program does.",
          },
        ],
      },
      {
        title: "Unit",
        blocks: [
          {
            kind: "text",
            text: "Decibel (dB). The result is Float32 and its no-data value is `nan`.",
          },
        ],
      },
      {
        title: "Reduced copies of the result",
        blocks: [
          {
            kind: "text",
            text: 'The file of a result holds the values of the formula at full resolution. It also holds reduced copies (overviews), at the factors 2, 4 and 8 for the results of the pilot area, which the map draws when it is zoomed out. Lynkeus makes each cell of a reduced copy as the decibels of the mean power of the cells that it covers, and not as the mean of their decibel values. To do so it returns the decibel values to linear power, averages the power as it does for the layer that it receives, and converts the mean to decibels. A reduced copy of the result is therefore the formula applied to the reduced copy of the input layer. The record of the result says: "Reduced copies made as the decibels of the mean of the linear power."',
          },
          {
            kind: "text",
            text: "Measured on 15 Nov 2026 on the two results of the pilot area, made from the sample files of the input layers: each reduced copy of the result was compared with 10·log10 of the reduced copy of the input layer at the same factor. For both dates the largest difference is 5.7e-06 dB at the factor 2 (3,581,043 cells with a value) and 3.8e-06 dB at the factors 4 (896,214 cells) and 8 (224,943 cells), and the cells without a value are the same. The two are not equal bit for bit (at the factor 2, 1,276,943 and 1,246,927 cells differ), because Lynkeus returns 32-bit decibel values to power before it averages them, while the reduced copy of the input layer averages the power of the product. The values at full resolution are unchanged: their SHA-256 equals that of the comparison (`docs/research/analysis.md`, part 4.7).",
          },
          {
            kind: "text",
            text: "Before this was changed, on 15 Nov 2026, a reduced copy was the mean of the decibel values. At the factor 2 it was on average 0.50 dB (21 Oct 2026) and 0.49 dB (2 Nov 2026) below the decibels of the mean power of the same four cells, and up to 15.2 dB and 15.7 dB (`docs/research/analysis.md`, part 4.7).",
          },
          {
            kind: "text",
            text: "For the reader: when the map is zoomed out, a cell shows the backscatter of the mean power of the cells that it covers, in decibels. The values at full zoom, and the values of the file at full resolution, are those of the formula. Not tried: a result with these reduced copies drawn in a browser.",
          },
        ],
      },
      {
        title: "Legend",
        blocks: [
          {
            kind: "table",
            head: ["Field of the layer description", "Value"],
            rows: [
              ["`quantity`", "Radar backscatter gamma0"],
              ["`unit`", "dB"],
              ["`range`", "The 5th and the 95th percentile of the cells of the result that hold a value"],
              ["`colours`", "`grey`"],
            ],
          },
        ],
      },
      {
        title: "How to read the result",
        blocks: [
          {
            kind: "text",
            text: "The value is the strength of the radar signal that the surface returned, on a logarithmic scale: a step of 10 dB is a factor of ten in power. The strength depends on the roughness, the moisture and the material of the surface (ASF NISAR Cookbook, `notebooks/GCOV_intro.md`). The values are gamma0, so the brightening of slopes that face the radar has been reduced by the terrain correction of the product (specification, section 2.2).",
          },
        ],
      },
      {
        title: "Comparison with the source program (D-17)",
        blocks: [
          {
            kind: "table",
            head: ["", ""],
            rows: [
              [
                "Source program",
                "ASF NISAR Cookbook, notebook `NISAR_GCOV_SARChangeDetectionMethods.ipynb`, [cell 24](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_SARChangeDetectionMethods.ipynb): `datacube_db = 10*np.log10(datacube)`; for the legend, the quantile line of cell 26",
              ],
              ["Version", "Commit `17b69c8` of 3 Nov 2026, branch `main` (the repository has no release and no tag)"],
              ["Licence", "Apache-2.0"],
              [
                "Largest difference",
                "0.0 dB on both dates. The arrays are bit-identical: of 14,982,384 cells, 14,316,413 (21 Oct 2026) and 14,316,416 (2 Nov 2026) hold a value in both results, the others hold `nan` in both, and 0 cells hold a value in one result only",
              ],
              [
                "Largest difference of the legend",
                "0.0 and 0.0 dB on both dates, against cell 26 applied to each date alone. Against cell 26 as written, over both dates, the legend of the tool differs by 0.33 and −0.09 dB (21 Oct 2026) and by −0.32 and 0.08 dB (2 Nov 2026)",
              ],
              [
                "Not reached",
                "The samples hold no zero, negative or infinite cell, so the comparison does not show the cells in which the tool gives no data and the statements of the notebook follow the rules of numpy. The source program was given the GeoTIFF files of Harmony, not the HDF5 product files. On 15 Nov 2026 the layer `HHHH` was read from the two HDF5 product files for the whole rectangle of the samples: every cell that holds a value in a sample (14,316,413 cells on 21 Oct 2026 and 14,316,416 on 2 Nov 2026) equals the product bit for bit. One area and one pair of dates were compared",
              ],
            ],
          },
        ],
      },
    ],
    mask: "The tool does not read the mask and applies none. Its only input is the term. The statements of the source program apply no mask either: no cell of the notebook reads the layer `mask` of a product (notebook at commit `17b69c8`, read on 15 Nov 2026).",
  },
  "backscatter-change": {
    title: "Backscatter, Change",
    summary: [
      ["Tool", "`backscatter-change` (Analysis tab, group Backscatter, button Change)"],
      ["NISAR product", "GCOV, Level-2 Geocoded Polarimetric Covariance"],
      ["Result", "Change of the radar backscatter gamma0 between two dates, in decibels (dB)"],
      [
        "State",
        "The comparison with the source program (D-17) was made on 14 Nov 2026 on the sample files of the pilot area. It was repeated independently on 15 Nov 2026, with other scripts, and gave the same numbers.",
      ],
    ],
    sections: [
      {
        title: "Reference",
        blocks: [
          {
            kind: "list",
            items: [
              "Rignot, E. J. M. and van Zyl, J. J. (1993). Change detection techniques for ERS-1 SAR data. IEEE Transactions on Geoscience and Remote Sensing, 31(4), 896-906. <https://doi.org/10.1109/36.239913>. The article compares the difference and the ratio of the radar intensities of two dates and finds the ratio better adapted to the statistics of radar data. Only the abstract of the article was read.",
              "NASA SDS Product Specification, Level-2 Geocoded Polarimetric Covariance (L2 GCOV), JPL D-102274, Rev F, version 1.5.0, 8 July 2026. Sections 2.2 and 4.3.3; Table 5-3 (from page 35). Rev F is the latest revision that the ASF DAAC publishes (<https://nisar-docs.asf.alaska.edu/product-specification/>, read 14 Nov 2026). The products of the pilot area follow version 1.6.0, which is public as the file [`nisar_L2_GCOV.xml`](https://github.com/isce-framework/nisarqa/blob/a8bc425f5e8873174471d6a12fe622df338623d1/src/nisarqa/product_specs/1.6.0/nisar_L2_GCOV.xml) (nisarqa commit `a8bc425` of 30 Sep 2026) and defines the layers of this sheet as version 1.5.0 does.",
              "Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C, 19 October 2025. Sections 3.7 and 3.8. The tool reads the product type, the track, the direction and the frame of each input from the name of its product file.",
            ],
          },
        ],
      },
      {
        title: "Input layers",
        blocks: [
          {
            kind: "text",
            text: "The inputs are given in this order.",
          },
          {
            kind: "table",
            head: ["No.", "Layer", "Path in the product", "Type", "Unit", "No data"],
            rows: [
              [
                "1",
                "One diagonal covariance term of the earlier date",
                "`/science/LSAR/GCOV/grids/frequency[A or B]/<term>`",
                "Float32",
                "`1` (linear power)",
                "`nan`",
              ],
              [
                "2",
                "The same term of the later date",
                "as above, in the product of the later date",
                "Float32",
                "`1` (linear power)",
                "`nan`",
              ],
            ],
          },
          {
            kind: "text",
            text: "The layers are described in the sheet [Backscatter, One date](backscatter-state.md).",
          },
        ],
      },
      {
        title: "Formula",
        blocks: [
          {
            kind: "code",
            code: "change_dB = 10 * log10(gamma0_later / gamma0_earlier)",
          },
          {
            kind: "text",
            text: "This is the ratio of the two dates on a logarithmic scale. It equals the difference of the two dates in decibels.",
          },
          {
            kind: "text",
            text: "The result of a cell is no data when one of the following holds:",
          },
          {
            kind: "list",
            items: [
              "either input value is `nan`;",
              "either input value is zero or negative;",
              "either input value is infinite;",
              "the ratio of the two values is beyond the range of 32-bit numbers.",
            ],
          },
          {
            kind: "text",
            text: "The tool computes in 32-bit floating-point numbers, as the source program does.",
          },
        ],
      },
      {
        title: "Unit",
        blocks: [
          {
            kind: "text",
            text: "Decibel (dB). The result is Float32 and its no-data value is `nan`.",
          },
        ],
      },
      {
        title: "Reduced copies of the result",
        blocks: [
          {
            kind: "text",
            text: "The file of a result holds the values of the formula at full resolution. It also holds reduced copies (overviews), at the factors 2, 4 and 8 for the result of the pilot area, which the map draws when it is zoomed out. Lynkeus makes each cell of a reduced copy as the mean of the decibel values of the change of the cells that it covers. It is not the change of the mean backscatter of these cells, which cannot be derived from the result alone.",
          },
          {
            kind: "text",
            text: "Measured on 15 Nov 2026 on the result of the pilot pair, at the factor 2 (3,581,043 cells with a value): the reduced copy equals the mean of the four decibel values (largest difference 9.5e-07 dB). Against the decibels of the ratio of the mean powers of the same four cells, the mean difference is 0.002 dB, 758,093 cells differ by more than 0.5 dB, and the largest difference is 11.6 dB (`docs/research/analysis.md`, part 4.7).",
          },
          {
            kind: "text",
            text: "For the reader: when the map is zoomed out, a cell shows the mean of the changes of the cells that it covers, which can differ by more than a decibel from the change of their mean backscatter. The values at full zoom, and the values of the file at full resolution, are those of the formula.",
          },
          {
            kind: "text",
            text: 'The reduced copies of a result of Backscatter, One date are made otherwise, as the decibels of the mean power (`docs/methods/backscatter-state.md`). The function of each tool declares how its result is reduced, and the record of a result of this tool says: "Reduced copies made by averaging the values."',
          },
        ],
      },
      {
        title: "Legend",
        blocks: [
          {
            kind: "table",
            head: ["Field of the layer description", "Value"],
            rows: [
              ["`quantity`", "Change of radar backscatter gamma0"],
              ["`unit`", "dB"],
              [
                "`range`",
                "From −r to +r, where r is the 99th percentile of the absolute values of the cells of the result that hold a value",
              ],
              [
                "`colours`",
                "`RdBu`, a diverging scale centred on zero. The lowest value is red and the highest blue: a decrease is red and an increase blue",
              ],
            ],
          },
        ],
      },
      {
        title: "How to read the result",
        blocks: [
          {
            kind: "text",
            text: "A positive value means that the surface returned more signal on the later date, and a negative value less; 3 dB is about a factor of two in power. The map shows where the return changed and by how much, and it does not state the cause of the change. The ratio works best where many looks were averaged (Rignot and van Zyl, 1993); the layer `numberOfLooks` of the product gives their number for each cell. The sheet sets no threshold. On the pilot pair, twelve days apart, the 5th and the 95th percentile of the change are −4.30 dB and 4.27 dB.",
          },
        ],
      },
      {
        title: "Comparison with the source program (D-17)",
        blocks: [
          {
            kind: "table",
            head: ["", ""],
            rows: [
              [
                "Source program",
                "ASF NISAR Cookbook, notebook `NISAR_GCOV_SARChangeDetectionMethods.ipynb`, [cell 56](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_SARChangeDetectionMethods.ipynb): `ratio_dB = 10 * np.log10(date_1 / date_0)`, where `date_0` is the earlier date; for the legend, `dynamic_range` of cell 59",
              ],
              ["Version", "Commit `17b69c8` of 3 Nov 2026, branch `main` (the repository has no release and no tag)"],
              ["Licence", "Apache-2.0"],
              [
                "Largest difference",
                "0.0 dB. The arrays are bit-identical: of 14,982,384 cells, 14,316,405 hold a value in both results, the others hold `nan` in both, and 0 cells hold a value in one result only",
              ],
              [
                "Largest difference of the legend",
                "The legend of the tool is ±7.168050689697264 dB and `dynamic_range` of cell 59 is 7.168050689697264 dB. The difference is 0.0 dB",
              ],
              [
                "Not reached",
                "The samples hold no zero, negative or infinite cell, and no pair of cells whose ratio 32-bit numbers cannot hold. The comparison therefore does not show the cells in which the tool gives no data and the statements of the notebook follow the rules of numpy. The source program was given the GeoTIFF files of Harmony, not the HDF5 product files. On 15 Nov 2026 the layer `HHHH` was read from the two HDF5 product files for the whole rectangle of the samples: every cell that holds a value in a sample (14,316,413 cells on 21 Oct 2026 and 14,316,416 on 2 Nov 2026) equals the product bit for bit. One area and one pair of dates were compared",
              ],
            ],
          },
        ],
      },
    ],
    mask: "The tool does not read the masks of the two products and applies none. Its only inputs are the two terms. The statements of the source program apply no mask either: no cell of the notebook reads the layer `mask` of a product (notebook at commit `17b69c8`, read on 15 Nov 2026).",
  },
  "coherence-state": {
    title: "Coherence, One pair",
    summary: [
      ["Tool", "`coherence-state` (Analysis tab, group Coherence, button One pair)"],
      ["NISAR product", "GUNW, Level-2 Geocoded Unwrapped Interferogram"],
      ["Result", "Magnitude of the interferometric coherence of one pair of dates, without unit"],
      [
        "State",
        "The comparison (D-17) was made on 14 Nov 2026 on the sample file of the pilot area, against the layer as NASA Harmony delivered it. On 15 Nov 2026 the layer of the original HDF5 product file was compared as well: every cell that holds a value in the sample is equal. The comparison was repeated independently on 15 Nov 2026, with other scripts, and gave the same numbers.",
      ],
    ],
    sections: [
      {
        title: "Reference",
        blocks: [
          {
            kind: "list",
            items: [
              "NASA SDS Product Specification, Level-2 Geocoded Unwrapped Interferogram (L2 GUNW), JPL D-102272, Rev E, version 1.2.1, 8 November 2024. Sections 2.2 and 3.2.4; Table 3-11; the entries of `coherenceMagnitude` on pages 35 to 37. Rev E is the revision that the ASF DAAC links (<https://nisar-docs.asf.alaska.edu/product-specification/>, read 14 Nov 2026); no PDF of a later version was found.",
              "Product specification of version 1.6.0, which the products of the pilot area follow: file [`nisar_L2_GUNW.xml`](https://github.com/isce-framework/nisarqa/blob/a8bc425f5e8873174471d6a12fe622df338623d1/src/nisarqa/product_specs/1.6.0/nisar_L2_GUNW.xml), nisarqa commit `a8bc425` of 30 Sep 2026. Its entries of `coherenceMagnitude` are those of version 1.2.1.",
              "Touzi, R., Lopes, A., Bruniquel, J. and Vachon, P. W. (1999). Coherence estimation for SAR imagery. IEEE Transactions on Geoscience and Remote Sensing, 37(1), 135-149. <https://doi.org/10.1109/36.739146>.",
              "Zebker, H. A. and Villasenor, J. (1992). Decorrelation in interferometric radar echoes. IEEE Transactions on Geoscience and Remote Sensing, 30(5), 950-959. <https://doi.org/10.1109/36.175330>.",
              "Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C, 19 October 2025. Sections 3.7 and 3.8. The tool reads the product type of its input from the name of the product file.",
            ],
          },
        ],
      },
      {
        title: "Input layer",
        blocks: [
          {
            kind: "text",
            text: "The tool has one input: the layer `coherenceMagnitude` of one GUNW product, at one of its two spacings.",
          },
          {
            kind: "table",
            head: ["Spacing", "Path in the product", "Type", "Unit", "No data"],
            rows: [
              [
                "80 m",
                "`/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/[HH or VV]/coherenceMagnitude`",
                "Float32",
                "`1`",
                "`nan`",
              ],
              [
                "20 m",
                "`/science/LSAR/GUNW/grids/frequencyA/wrappedInterferogram/[HH or VV]/coherenceMagnitude`",
                "Float32",
                "`1`",
                "`nan`",
              ],
            ],
          },
          {
            kind: "text",
            text: "A GUNW product holds one pair of dates, the reference and the secondary, of the same track and frame. Under the current processing baseline, only the group `frequencyA` is processed into GUNW products (specification, section 3.2.4, page 12). The tool does not read the layers `mask` and `validDataMask` of the product; `docs/research/analysis.md`, part 2.2, gives their meaning.",
          },
        ],
      },
      {
        title: "Formula",
        blocks: [
          {
            kind: "text",
            text: "Lynkeus computes nothing for this tool. The result is the input array itself, not a copy, with the legend below.",
          },
          {
            kind: "text",
            text: "The mission computes the layer with the program ISCE3. Its source code gives the quantity as ([`Crossmul.cpp`, lines 368 to 373, version 0.25.21](https://github.com/isce-framework/isce3/blob/v0.25.21/cxx/isce3/signal/Crossmul.cpp#L368-L373)):",
          },
          {
            kind: "code",
            code: "coherence = |<s1 * conj(s2)>| / sqrt(<|s1|^2> * <|s2|^2>)",
          },
          {
            kind: "text",
            text: "Here `s1` and `s2` are the complex images of the two dates and `< >` is the average over the looks. The number of looks of each layer is recorded in the product, under `/science/LSAR/GUNW/metadata/processingInformation/parameters/[unwrappedInterferogram or wrappedInterferogram]/frequencyA/`, as `numberOfRangeLooks` and `numberOfAzimuthLooks`. In the pilot product they are 5 looks in range by 6 in azimuth for the 20 m layer, and 13 by 16 for the 80 m layer (read from the product file on 15 Nov 2026).",
          },
        ],
      },
      {
        title: "Unit",
        blocks: [
          {
            kind: "text",
            text: "None (the product gives the unit `1`). The values lie between 0 and 1; the specification does not state this range, which follows from the formula above. The result is Float32 and its no-data value is `nan`.",
          },
        ],
      },
      {
        title: "Reduced copies of the result",
        blocks: [
          {
            kind: "text",
            text: 'The file of a result holds the values of the layer at full resolution. It also holds reduced copies (overviews), at the factors 2 and 4 for the result of the pilot area, which the map draws when it is zoomed out. Lynkeus makes each cell of a reduced copy as the mean of the coherence values of the cells that it covers, as it does for the layer that it receives. The record of the result says: "Reduced copies made by averaging the values."',
          },
          {
            kind: "text",
            text: "Measured on 15 Nov 2026 on the result of the pilot pair, made from the sample file of the input layer: the reduced copies of the result are equal bit for bit to the reduced copies of the input layer, at the factor 2 (896,168 cells with a value) and at the factor 4 (224,722 cells) (`docs/research/analysis.md`, part 4.7).",
          },
          {
            kind: "text",
            text: "For the reader: when the map is zoomed out, a cell shows the mean coherence of the cells that it covers. It is not a coherence estimated at that coarser resolution: Lynkeus does not hold the complex images from which the mission estimates the coherence. The values at full zoom, and the values of the file at full resolution, are those of the product.",
          },
        ],
      },
      {
        title: "Legend",
        blocks: [
          {
            kind: "table",
            head: ["Field of the layer description", "Value"],
            rows: [
              ["`quantity`", "Interferometric coherence (magnitude)"],
              ["`unit`", "`1`"],
              ["`range`", "0 to 1"],
              ["`colours`", "`grey`"],
            ],
          },
        ],
      },
      {
        title: "How to read the result",
        blocks: [
          {
            kind: "text",
            text: "Near 1, the radar echoes of the two dates are alike; near 0, they are not. Several sources contribute to the correlation of the two echoes, and one term describes the change of the surface (Zebker and Villasenor, 1992, abstract). A low value therefore does not by itself show that the surface changed; this is a conclusion of this sheet. The estimate is biased toward higher values, and it is more accurate at a coarser resolution (Touzi et al., 1999). The 80 m layer is the coarser of the two (specification, section 2.2), so it is expected to be the more accurate. This is a conclusion of this sheet; the article does not treat NISAR products. The sheet states no threshold: no document of the mission that was read for it gives one. Only the abstract of each article was read.",
          },
        ],
      },
      {
        title: "Comparison with the source program (D-17)",
        blocks: [
          {
            kind: "table",
            head: ["", ""],
            rows: [
              [
                "Source program",
                "ISCE3, the program of the mission that produced the layer. Each product records its version in `/science/LSAR/GUNW/metadata/processingInformation/algorithms/softwareVersion`. The NASA catalogue records ISCE3 0.25.21 for the product of the pilot area (field `SASVersionId`), and the field `softwareVersion` of the product file reads `0.25.21` (read on 15 Nov 2026)",
              ],
              ["Licence", "Apache-2.0"],
              [
                "Comparison",
                "The values of the result against the values of the sample file, that is the layer as NASA Harmony delivered it. No program is run for the comparison, because the tool computes nothing",
              ],
              [
                "Largest difference",
                "0 of 3,743,710 cells differ. The result is bit-identical to the values of the file, and it is the input array itself. 164,618 cells hold `nan`. These 164,618 cells are the cells of the file whose centre lies outside the requested box, which NASA Harmony fills with the no-data value; in the product they hold values",
              ],
              [
                "Not reached",
                "On 15 Nov 2026 the layer was read from the original HDF5 product file for the whole rectangle of the sample: the 3,579,092 cells that hold a value in the sample equal the product bit for bit. One pair of dates and one area were compared, at the spacing of 20 m only",
              ],
            ],
          },
        ],
      },
    ],
    mask: "The tool does not read the layers `mask` and `validDataMask` of the product; `docs/research/analysis.md`, part 2.2, gives their meaning.",
  },
};
