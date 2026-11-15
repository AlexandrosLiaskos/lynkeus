# Backscatter, One date

| | |
|---|---|
| Tool | `backscatter-state` (Analysis tab, group Backscatter, button One date) |
| NISAR product | GCOV, Level-2 Geocoded Polarimetric Covariance |
| Result | Radar backscatter gamma0, in decibels (dB) |
| State | The comparison with the source program (D-17) was made on 14 Nov 2026 on the sample files of the pilot area. It was repeated independently on 15 Nov 2026, with other scripts, and gave the same numbers. |

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
   `/science/LSAR/GCOV/metadata/processingInformation/algorithms/` (specification, Table 5-6) when
   the terrain correction and the geocoding use the area projection (`GcovWriter.py`, lines 711 to
   753, version 0.25.21). Both pilot products hold this reference in the two fields (read on
   15 Nov 2026).
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
`outputBackscatterNormalizationConvention` is `gamma0`. Both pilot products hold these two values
(read from the HDF5 product files on 15 Nov 2026). The specification lists the two fields
(Table 5-6, page 71) and not their values. ISCE3 writes `Linear power` into every product. When the
terrain correction is applied, it takes the normalisation from the run configuration, whose
default is `gamma0`; otherwise it writes `beta0`
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
| 3 | the layer description does not hold the name of the layer inside the product (field `layer`); this is the case of a layer that was received before Lynkeus recorded that name | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 4 | the name of the layer inside the product is not one of the six diagonal covariance terms `HHHH`, `HVHV`, `VHVH`, `VVVV`, `RHRH` and `RVRV` | `The layer "<title>" is the layer <name> of its product, and the tool reads a diagonal covariance term (HHHH, HVHV, VHVH, VVVV, RHRH or RVRV).` |
| 5 | the unit of the layer is not `1` | `The layer "<title>" has the unit <unit>, and the tool reads the unit 1.` |
| 6 | the layer does not have one date | `The number of dates of the layer "<title>" must be 1, and it is <number>.` |
| 7 | no cell of the result would hold a value | `The result would hold no value in any cell.` |
| 8 | the 5th percentile of the result is not below the 95th, so the legend has no range | `The values of the result are too alike to give the legend a range.` |

The product type is read from the beginning of the file name: `NISAR_`, the instrument (`L` or `S`)
and the level, the processing type (`PR`, `UR` or `OD`), the product type, the cycle, the track, the
direction (`A` or `D`) and the frame (naming conventions, sections 3.7 and 3.8). An array that is
not two-dimensional Float32 is a fault of the calling program and raises `ValueError`, which is not
a refusal for the visitor.

The name of the layer inside the product is the field `layer` of the layer description. The Data
part writes into it the name that the layer request gave (`LayerRequest.layer`), for every layer
that it receives, and a result of a tool has none. The six names of check 4 are the diagonal terms
of Table 5-3 of the specification, which have the type Float32. The seven other terms of the table
(`HHHV`, `HHVH`, `HHVV`, `HVVH`, `HVVV`, `VHVV` and `RHRV`) have the type CFloat32, and check 4
refuses them. It also refuses the layers `rtcGammaToSigmaFactor`, `numberOfLooks` and `mask`, which
the Data part offers with the unit `1` and which the tool accepted before it read the name
(`docs/research/analysis.md`, part 3.4).

The Data part receives the layers of the group `frequencyA` only (`_GROUPS` in
`api/src/lynkeus/harmony.py`), and the field `layer` does not name the frequency. Of the six terms,
the Data part offers `HHHH`, `HVHV`, `VHVH` and `VVVV` (`_layers` in the same file).

### The mask of the product

A GCOV product holds a layer `mask` beside the terms
(`/science/LSAR/GCOV/grids/frequency[A or B]/mask`, UByte, no data `255`). The mask has three kinds
of value (specification, section 4.3.3): `0` for a cell that is invalid or partially focused, `1` to
`5` for a valid cell (the number of the sub-swath from which most of its radar samples came), and
`255` for a cell outside the acquisition.

The tool does not read the mask and applies none. Its only input is the term. The statements of the
source program apply no mask either: no cell of the notebook reads the layer `mask` of a product
(notebook at commit `17b69c8`, read on 15 Nov 2026).

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

The 665,944 cells with the value `255` in the mask files are not cells outside the acquisition.
They are the cells of the file whose centre lies outside the requested box (−71.20, 42.60, −70.75,
42.95), which NASA Harmony fills with the no-data value. In the product files these cells hold the
mask `1` (665,942 cells) or `0` (2 cells), and no cell of the rectangle holds `255`. In the
product, the rectangle of 3772 by 3972 cells holds mask `0` in 29 cells on 21 Oct 2026 and in 26
cells on 2 Nov 2026, and mask `1` in all other cells. Inside the box the mask files of Harmony
equal the mask of the product in every cell (product files read on 15 Nov 2026;
`docs/research/analysis.md`, part 4.4).

The limits of this evidence are the following.

1. It is one box of 3772 by 3972 cells on a coast, two dates of one track and frame (141, 67), and
   the term `HHHH` of frequency A only.
2. The only valid value in the box is `1`, so the box holds no boundary between sub-swaths. Both products are of acquisitions with dithered pulse repetition frequency
   (`isDithered` = `True`), for which the specification gives the value 1 throughout (section
   4.3.3).
3. The product itself holds `nan` in the cells with mask `0`. In the HDF5 product files, read on
   15 Nov 2026 for the rectangle of the samples, every cell with mask `0` holds `nan` in `HHHH` (29
   cells on 21 Oct 2026, 26 cells on 2 Nov 2026) and every cell with mask `1` holds a value. The
   fields `validSamplesSubSwathMaskingApplied` and `shadowMaskingApplied` read `False` in both
   products. Which step of the processing leaves these cells without data was not traced.
4. The samples are of the validated collection. The evidence says nothing about provisional
   products.
5. The reduced copies (overviews) inside the mask files were not examined.

The question stays open for other areas. The band tags of the two sample files carry a `min_value`
of `1.6706227e-16` on 21 Oct 2026 and of `7.2686074e-17` on 2 Nov 2026, that is −157.8 dB and
−161.4 dB. The lowest values inside the box are −31.61 dB and −29.53 dB. The tags therefore do not
describe the box. They are the attributes `min_value` and `max_value` of the layer `HHHH` of the
whole frame in the product file, which the files of Harmony carry as band tags:
`1.6706226695065618e-16` and `51839.09375` on 21 Oct 2026, `7.268607434326375e-17` and
`24645.7109375` on 2 Nov 2026 (read from the HDF5 product files on 15 Nov 2026). The frame
therefore holds values far below any value of the box. Whether the mask marks the
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

## Reduced copies of the result

The file of a result holds the values of the formula at full resolution. It also holds reduced
copies (overviews), at the factors 2, 4 and 8 for the results of the pilot area, which the map draws
when it is zoomed out. Lynkeus makes each cell of a reduced copy as the decibels of the mean power
of the cells that it covers, and not as the mean of their decibel values. To do so it returns the
decibel values to linear power, averages the power as it does for the layer that it receives, and
converts the mean to decibels. A reduced copy of the result is therefore the formula applied to the
reduced copy of the input layer. The record of the result says: "Reduced copies made as the decibels
of the mean of the linear power."

Measured on 15 Nov 2026 on the two results of the pilot area, made from the sample files of the
input layers: each reduced copy of the result was compared with 10·log10 of the reduced copy of the
input layer at the same factor. For both dates the largest difference is 5.7e-06 dB at the factor 2
(3,581,043 cells with a value) and 3.8e-06 dB at the factors 4 (896,214 cells) and 8 (224,943
cells), and the cells without a value are the same. The two are not equal bit for bit (at the
factor 2, 1,276,943 and 1,246,927 cells differ), because Lynkeus returns 32-bit decibel values to
power before it averages them, while the reduced copy of the input layer averages the power of the
product. The values at full resolution are unchanged: their SHA-256 equals that of the comparison
(`docs/research/analysis.md`, part 4.7).

Before this was changed, on 15 Nov 2026, a reduced copy was the mean of the decibel values. At the
factor 2 it was on average 0.50 dB (21 Oct 2026) and 0.49 dB (2 Nov 2026) below the decibels of
the mean power of the same four cells, and up to 15.2 dB and 15.7 dB
(`docs/research/analysis.md`, part 4.7).

For the reader: when the map is zoomed out, a cell shows the backscatter of the mean power of the
cells that it covers, in decibels. The values at full zoom, and the values of the file at full
resolution, are those of the formula. Not tried: a result with these reduced copies drawn in a
browser.

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
This sheet numbers the cells of the notebook from 0, in the order of the notebook file: cell 24 is
its 25th cell, which Jupyter shows as `In [11]`, and cell 26 is shown as `In [12]`.

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
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18. Lynkeus: the code of this tool, numpy 2.5.4. Source program: numpy 2.5.3, xarray 2026.7.0, dask 2025.12.0, rioxarray 0.22.0 and rasterio 1.4.4 (GDAL 3.10.3), the versions of the lock file of the Cookbook (`pixi.lock`, environment `isce3`, platform `linux-64`) |
| Differences from the lock file | Python is 3.13.18 and the lock file has 3.13.0. GDAL inside rasterio is 3.10.3 and the lock file has libgdal-core 3.11.5. 29 packages were installed, not the whole environment of the lock file |
| Run | The comparison was made twice, on 14 Nov 2026 and on 15 Nov 2026, with two sets of scripts that were written separately, and both gave the result below. The rows above describe the run of 15 Nov 2026, whose records are kept in `docs/research/records/analysis/` (`comparison.json`, `source_side.json`, `lynkeus_side.json`) |
| Input of the source program | The notebook opens HDF5 product files (cell 11). For the comparison its data cube was built from the two GeoTIFF files, with the term `HHHH` and without the window of 3000 by 3000 cells of cell 16 |
| Largest difference | 0.0 dB on both dates. The arrays are bit-identical: of 14,982,384 cells, 14,316,413 (21 Oct 2026) and 14,316,416 (2 Nov 2026) hold a value in both results, the others hold `nan` in both, and 0 cells hold a value in one result only |
| Largest difference of the legend | 0.0 and 0.0 dB on both dates, against cell 26 applied to each date alone. Against cell 26 as written, over both dates, the legend of the tool differs by 0.33 and −0.09 dB (21 Oct 2026) and by −0.32 and 0.08 dB (2 Nov 2026) |
| Not reached | The samples hold no zero, negative or infinite cell, so the comparison does not show the cells in which the tool gives no data and the statements of the notebook follow the rules of numpy. The source program was given the GeoTIFF files of Harmony, not the HDF5 product files. On 15 Nov 2026 the layer `HHHH` was read from the two HDF5 product files for the whole rectangle of the samples: every cell that holds a value in a sample (14,316,413 cells on 21 Oct 2026 and 14,316,416 on 2 Nov 2026) equals the product bit for bit. One area and one pair of dates were compared |

The exact numbers of the comparison are in `docs/research/analysis.md`, part 4.

## Not yet confirmed

1. Whether the mask is needed in other areas (section The mask of the product). Andreas measures it
   on the next area. The tool applies no mask, as the source program applies none.
2. The terms `RHRH` and `RVRV`: the tool accepts them because the specification lists them, and no
   layer of a compact channel was received or computed.
3. The parts of the comparison that were not reached (table above, row Not reached) (Andreas).
4. The name `grey` of the colour scale in the Contents pane, and which end of it is black (Stelios).
   A later commit of `main`, `5095ee0`, holds a scale `grey` that runs from black at the lowest
   value to white (`web/src/contents/colours.ts`, lines 54 to 57); the file was read and nothing was
   tried.
5. How the interface shows the sentence of a refusal. On 15 Nov 2026 the tool ran as a job of a
   private copy of the web service, and each refusal that was tried ended its job as failed, with
   the sentence of the tool as the message of the job (`docs/research/analysis.md`, parts 3.4 and
   4.7). Nothing was seen in a browser.
