# Backscatter, One date

| | |
|---|---|
| Tool | `backscatter-state` (Analysis tab, group Backscatter, button One date) |
| NISAR product | GCOV, Level-2 Geocoded Polarimetric Covariance |
| Result | Radar backscatter gamma0, in decibels (dB) |
| State | The comparison with the source program (D-17) was made on 14 Nov 2026 on the sample files of the pilot area. |

## Reference

1. NASA SDS Product Specification, Level-2 Geocoded Polarimetric Covariance (L2 GCOV), JPL D-102274,
   Rev F, version 1.5.0, 8 July 2026. Sections 2.2 and 4.3.3; Table 5-3 (from page 35), Table 5-6
   (page 71) and Table 5-7 (page 78). Rev F is the latest revision that the ASF DAAC publishes
   (<https://nisar-docs.asf.alaska.edu/product-specification/>, read 14 Nov 2026).
2. Product specification of version 1.6.0, which the products of the pilot area follow: file
   [`nisar_L2_GCOV.xml`](https://github.com/isce-framework/nisarqa/blob/a8bc425f5e8873174471d6a12fe622df338623d1/src/nisarqa/product_specs/1.6.0/nisar_L2_GCOV.xml),
   nisarqa commit `a8bc425` of 30 Sep 2026. No PDF of this version is public. It defines the layers
   and fields of this sheet as version 1.5.0 does.
3. Shiroma, G. H. X., Lavalle, M. and Buckley, S. M. (2022). An Area-Based Projection Algorithm for
   SAR Radiometric Terrain Correction and Geocoding. IEEE Transactions on Geoscience and Remote
   Sensing, 60, 1-23, Art. no. 5222723. <https://doi.org/10.1109/TGRS.2022.3147472>. The
   specification cites this article for the terrain correction and the geocoding (reference [RD1];
   sections 2.2 and 4.3). ISCE3 writes the reference of the article into the fields
   `radiometricTerrainCorrectionAlgorithmReference` and `geocodingAlgorithmReference` of the group
   `/science/LSAR/GCOV/metadata/processingInformation/algorithms/` (specification, Table 5-6).
4. Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C,
   19 October 2025. Sections 3.7 and 3.8. The tool reads the product type of its input from the name
   of the product file.

## Input layers

The tool has one input.

| No. | Layer | Path in the product | Type | Unit | No data |
|---|---|---|---|---|---|
| 1 | One diagonal covariance term: `HHHH`, `HVHV`, `VHVH`, `VVVV`, `RHRH` or `RVRV` | `/science/LSAR/GCOV/grids/frequency[A or B]/<term>` | Float32 | `1` (linear power) | `nan` |

The diagonal terms are real-valued and are the radar backscatter of each polarisation channel
(specification, section 2.2). The values are linear power, normalised to gamma0 by the radiometric
terrain correction. The files state this in the group
`/science/LSAR/GCOV/metadata/processingInformation/parameters/rtc/`, where
`outputBackscatterExpressionConvention` is `Linear power` and
`outputBackscatterNormalizationConvention` is `gamma0`. The specification lists the two fields
(Table 5-6, page 71) and not their values. ISCE3 writes `Linear power` into every product and takes
the normalisation from the run configuration, whose default is `gamma0`
([`GcovWriter.py`, lines 773 to 788, version 0.25.21](https://github.com/isce-framework/isce3/blob/v0.25.21/python/packages/nisar/products/writers/GcovWriter.py#L773-L788)).

### What the tool refuses

The tool receives the array of the layer and its layer description. It makes the checks below in
this order and reports the first fault that it finds. A refusal is raised as `LayerError` of
`lynkeus.writing`, as `main` asks of a tool (`api/README.md`, section Analysis tools as processes),
and its message is one sentence for the visitor.

| No. | The tool refuses the input when | Sentence for the visitor |
|---|---|---|
| 1 | the number of input layers is not one | `The number of input layers must be 1, and it is <number>.` |
| 2 | the layer was not received from one product file of the type GCOV: its `kind` is not `layer`, its `inputs` do not hold exactly one name, or that name does not begin as the name of a NISAR product file of the type GCOV | `The layer "<title>" is not a layer received from one NISAR GCOV product.` |
| 3 | the unit of the layer is not `1` | `The layer "<title>" has the unit <unit>, and the tool reads the unit 1.` |
| 4 | the layer does not have one date | `The number of dates of the layer "<title>" must be 1, and it is <number>.` |
| 5 | no cell of the result would hold a value | `The result would hold no value in any cell.` |
| 6 | the 5th percentile of the result is not below the 95th, so the legend has no range | `The values of the result are too alike to give the legend a range.` |

The product type is read from the beginning of the file name: `NISAR_`, the instrument (`L` or `S`)
and the level, the processing type (`PR`, `UR` or `OD`), the product type, the cycle, the track, the
direction (`A` or `D`) and the frame (naming conventions, sections 3.7 and 3.8). An array that is
not two-dimensional Float32 is a fault of the calling program and raises `ValueError`, which is not
a refusal for the visitor.

The layer description has no field for the name of the layer inside the product. The tool therefore
cannot verify that its input is a backscatter term: the choice of the visitor decides. In `main` at
commit `0ad795b` the Data part offers three further layers of a GCOV product with the unit `1`:
`rtcGammaToSigmaFactor`, `numberOfLooks` and `mask` (`api/src/lynkeus/harmony.py`, lines 277 to
291). Each carries the kind, the product file, the unit and the one date that checks 1 to 4 expect.
In a trial the tool accepted each of the three and returned it as radar backscatter in decibels
(`docs/research/analysis.md`, part 3.4). The trial called the function directly, on a local copy and
with made-up arrays; it was not made on the server.

### The mask of the product

A GCOV product holds a layer `mask` beside the terms
(`/science/LSAR/GCOV/grids/frequency[A or B]/mask`, UByte, no data `255`). The mask has three kinds
of value (specification, section 4.3.3): `0` for a cell that is invalid or partially focused, `1` to
`5` for a valid cell (the number of the sub-swath from which most of its radar samples came), and
`255` for a cell outside the acquisition.

The tool does not read the mask. Its only input is the term.

The mask of the two sample products was received from NASA Harmony on 14 Nov 2026, clipped to the
box of the pilot area. Harmony delivered it on the grid of the term (3772 by 3972 cells of 10 m).

| Cells | 21 Oct 2026 | 2 Nov 2026 |
|---|---|---|
| Mask `0` | 27 | 24 |
| Mask `1` | 14,316,413 | 14,316,416 |
| Mask `2` to `5` | 0 | 0 |
| Mask `255` | 665,944 | 665,944 |
| With a value of `HHHH` where the mask is `0` or `255` | 0 | 0 |
| With `nan` in `HHHH` where the mask is `1` to `5` | 0 | 0 |
| That the mask would turn into no data | 0 | 0 |

On both dates every cell with mask `0` or `255` already holds `nan` in the `HHHH` layer that Harmony
delivers, and every cell with mask `1` holds a value above zero. Applying the mask would therefore
change no cell and no legend in the pilot area.

The limits of this evidence are the following.

1. It is one box of 3772 by 3972 cells on a coast, two dates of one track and frame (141, 67), and
   the term `HHHH` of frequency A only.
2. The only valid value in the box is `1`, so the box holds no boundary between sub-swaths.
3. The files cannot tell whether the product itself holds `nan` in the cells with mask `0`, or
   whether Harmony set it. The fields `validSamplesSubSwathMaskingApplied` and
   `shadowMaskingApplied` of the product of 21 Oct 2026 read `False`; the same fields of the product
   of 2 Nov 2026 were not read.
4. The samples are of the validated collection. The evidence says nothing about provisional
   products.
5. The reduced copies (overviews) inside the mask files were not examined.

The question stays open for other areas. The band tags of the two sample files carry a `min_value`
of `1.6706227e-16` on 21 Oct 2026 and of `7.2686074e-17` on 2 Nov 2026, that is −157.8 dB and
−161.4 dB. The lowest values inside the box are −31.61 dB and −29.53 dB. The tags therefore do not
describe the box. They are read here as the statistics that the product records for the layer of the
whole frame, which then holds values far below any value of the box. Whether the mask marks the
cells of those values was not examined.

NASA Harmony lists the mask of both frequencies among the variables of the validated collection
`NISAR_L2_GCOV_V1` (list saved on 14 Nov 2026). In `main` at commit `0ad795b` the Data part of
Lynkeus offers the mask as a layer of its own, with the unit `1` (`api/src/lynkeus/harmony.py`, line
291), and its layer reader writes `nan` into the cells that hold the no-data value of the file
(`api/src/lynkeus/writing.py`, lines 163 and 164). The Data part does not apply the mask to the
terms. The tool does not read the mask: it takes the term layers only.

## Formula

```text
gamma0_dB = 10 * log10(gamma0)
```

The formula is the one that the GCOV files carry in
`/science/LSAR/GCOV/metadata/ceosAnalysisReadyData/outputBackscatterDecibelConversionFormula`, where
it reads `10*log10(<GCOV_TERM>)`. The specification lists the field (Table 5-7, page 78) and not its
value; the value is the constant that ISCE3 writes
([`GcovWriter.py`, lines 494 to 497, version 0.25.21](https://github.com/isce-framework/isce3/blob/v0.25.21/python/packages/nisar/products/writers/GcovWriter.py#L494-L497)).

The result of a cell is no data when the input value is one of the following:

1. `nan`;
2. zero or negative, for which the logarithm has no finite value;
3. infinite.

The tool computes in 32-bit floating-point numbers, as the source program does.

## Unit

Decibel (dB). The result is Float32 and its no-data value is `nan`.

## Legend

| Field of the layer description | Value |
|---|---|
| `quantity` | Radar backscatter gamma0 |
| `unit` | dB |
| `range` | The 5th and the 95th percentile of the cells of the result that hold a value |
| `colours` | `grey` |

The range and the colour scale are those of the source program
([cell 26](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_SARChangeDetectionMethods.ipynb):
`quantile([0.05, 0.95])`, `cmap="grey"`, label "γ⁰ (dB)"). The quality-assurance program of the
mission, nisarqa, clips its backscatter images to the same percentiles by default
([`percentile_for_clipping`, default `(5.0, 95.0)`](https://github.com/isce-framework/nisarqa/blob/a8bc425f5e8873174471d6a12fe622df338623d1/src/nisarqa/parameters/rslc_caltools_params.py)).

The notebook takes its percentiles over all dates of its data cube. The tool receives one date, so
it applies the same line to that date alone. The range therefore differs from one date to another.
On the sample files:

| Legend | 21 Oct 2026 | 2 Nov 2026 |
|---|---|---|
| Of the tool | −17.82 to −0.90 dB | −18.47 to −0.73 dB |
| Of cell 26 applied to this date alone | −17.82 to −0.90 dB | −18.47 to −0.73 dB |
| Of cell 26 as written, over both dates | −18.15 to −0.81 dB | −18.15 to −0.81 dB |

The exact values are in `docs/research/analysis.md`, part 4.2.

## How to read the result

The value is the strength of the radar signal that the surface returned, on a logarithmic scale: a
step of 10 dB is a factor of ten in power. The strength depends on the roughness, the moisture and
the material of the surface (ASF NISAR Cookbook, `notebooks/GCOV_intro.md`). The values are gamma0,
so the brightening of slopes that face the radar has been reduced by the terrain correction of the
product (specification, section 2.2).

## Comparison with the source program (D-17)

| | |
|---|---|
| Source program | ASF NISAR Cookbook, notebook `NISAR_GCOV_SARChangeDetectionMethods.ipynb`, [cell 24](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_SARChangeDetectionMethods.ipynb): `datacube_db = 10*np.log10(datacube)`; for the legend, the quantile line of cell 26 |
| Version | Commit `17b69c8` of 3 Nov 2026, branch `main` (the repository has no release and no tag) |
| Licence | Apache-2.0 |
| Files compared | `gcov-hhhh-20261021.tif` (SHA-256 `e808a7bfed69c0bd1eabc38faae539bae7aaadd81c86b1bf963900c996dffb84`), the layer `HHHH` of the product `NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001`; `gcov-hhhh-20261102.tif` (SHA-256 `f9d950ad3b30c07d6d77a3f63d1dd4c106fa1b775982c0834c35e715ac91ac43`), the layer `HHHH` of the product `NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405_P05036_N_F_J_001`. Both files are GeoTIFF as NASA Harmony delivered them, read at full resolution |
| Platform | Linux 6.8.0-146-generic x86_64, in containers of the image `python:3.13-slim`, Python 3.13.18. Lynkeus: `main` at commit `22167b4` with the code of this tool, numpy 2.5.4. Source program: numpy 2.5.3, xarray 2026.7.0, dask 2025.12.0, rioxarray 0.22.0 and rasterio 1.4.4, the versions of the lock file of the Cookbook (`pixi.lock`, environment `isce3`, platform `linux-64`), installed with pip |
| Differences from the lock file | Python is 3.13.18 and the lock file has 3.13.0. The packages are the wheels of PyPI, not the conda-forge builds of the lock file; GDAL inside the rasterio wheel is 3.10.3 and the lock file has libgdal-core 3.11.5. Only the 27 packages that the executed statements need were installed; of these, pip is 26.2.2 and the lock file has 25.3 |
| Run | Started 2026-11-14T16:47:24Z, with the final code. The outputs of the source program were reused from the first run, started 2026-11-14T15:58:13Z, ended 2026-11-14T16:06:07Z; not computed again |
| Input of the source program | The notebook opens HDF5 product files (cell 11). For the comparison its data cube was built from the two GeoTIFF files, with the term `HHHH` and without the window of 3000 by 3000 cells of cell 16 |
| Largest difference | 0.0 dB on both dates. The arrays are bit-identical: of 14,982,384 cells, 14,316,413 (21 Oct 2026) and 14,316,416 (2 Nov 2026) hold a value in both results, the others hold `nan` in both, and 0 cells hold a value in one result only |
| Largest difference of the legend | 0.0 and 0.0 dB on both dates, against cell 26 applied to each date alone. Against cell 26 as written, over both dates, the legend of the tool differs by 0.33 and −0.09 dB (21 Oct 2026) and by −0.32 and 0.08 dB (2 Nov 2026) |
| Not reached | The samples hold no zero, negative or infinite cell, so the comparison does not show the cells in which the tool gives no data and the statements of the notebook follow the rules of numpy. The source program was given the GeoTIFF files of Harmony, not the HDF5 product files; whether Harmony delivers the values of the HDF5 layer unchanged was not examined. One area and one pair of dates were compared |

The exact numbers of the comparison are in `docs/research/analysis.md`, part 4.

## Not yet confirmed

1. Whether the mask is needed in other areas (section The mask of the product). Andreas measures it
   on the next area. The Data part now offers the mask as a layer; whether the tool takes it as a
   further input is to be decided (Alexandros and Andreas).
2. One field of the layer description for the name of the layer inside the product, without which
   the tool cannot verify its input (Alexandros; it changes a shared format).
3. The parts of the comparison that were not reached (table above, row Not reached) (Andreas).
4. The name `grey` of the colour scale in the Contents pane, and which end of it is black (Stelios).
   A later commit of `main`, `5095ee0`, holds a scale `grey` that runs from black at the lowest
   value to white (`web/src/contents/colours.ts`, lines 54 to 57); the file was read and nothing was
   tried.
5. That the sentence of a refusal reaches the visitor through a job of the server. The tool raises
   `LayerError`, which `run_tool` passes on (`api/src/lynkeus/tools.py`, lines 59 to 64, at commit
   `0ad795b` of `main`). This was read in the files; no job of a tool was run
   (`docs/research/analysis.md`, part 7, point 10; Andreas).
