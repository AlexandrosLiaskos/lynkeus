# Coherence, One pair

| | |
|---|---|
| Tool | `coherence-state` (Analysis tab, group Coherence, button One pair) |
| NISAR product | GUNW, Level-2 Geocoded Unwrapped Interferogram |
| Result | Magnitude of the interferometric coherence of one pair of dates, without unit |
| State | The comparison (D-17) was made on 14 Nov 2026 on the sample file of the pilot area, against the layer as NASA Harmony delivered it. The original product file was not compared. |

## Reference

1. NASA SDS Product Specification, Level-2 Geocoded Unwrapped Interferogram (L2 GUNW), JPL D-102272,
   Rev E, version 1.2.1, 8 November 2024. Sections 2.2 and 3.2.4; Table 3-11; the entries of
   `coherenceMagnitude` on pages 35 to 37. Rev E is the revision that the ASF DAAC links
   (<https://nisar-docs.asf.alaska.edu/product-specification/>, read 14 Nov 2026); no PDF of a later
   version was found.
2. Product specification of version 1.6.0, which the products of the pilot area follow: file
   [`nisar_L2_GUNW.xml`](https://github.com/isce-framework/nisarqa/blob/a8bc425f5e8873174471d6a12fe622df338623d1/src/nisarqa/product_specs/1.6.0/nisar_L2_GUNW.xml),
   nisarqa commit `a8bc425` of 30 Sep 2026. Its entries of `coherenceMagnitude` are those of version
   1.2.1.
3. Touzi, R., Lopes, A., Bruniquel, J. and Vachon, P. W. (1999). Coherence estimation for SAR
   imagery. IEEE Transactions on Geoscience and Remote Sensing, 37(1), 135-149.
   <https://doi.org/10.1109/36.739146>.
4. Zebker, H. A. and Villasenor, J. (1992). Decorrelation in interferometric radar echoes. IEEE
   Transactions on Geoscience and Remote Sensing, 30(5), 950-959.
   <https://doi.org/10.1109/36.175330>.
5. Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C,
   19 October 2025. Sections 3.7 and 3.8. The tool reads the product type of its input from the name
   of the product file.

## Input layer

The tool has one input: the layer `coherenceMagnitude` of one GUNW product, at one of its two
spacings.

| Spacing | Path in the product | Type | Unit | No data |
|---|---|---|---|---|
| 80 m | `/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/[HH or VV]/coherenceMagnitude` | Float32 | `1` | `nan` |
| 20 m | `/science/LSAR/GUNW/grids/frequencyA/wrappedInterferogram/[HH or VV]/coherenceMagnitude` | Float32 | `1` | `nan` |

A GUNW product holds one pair of dates, the reference and the secondary, of the same track and
frame. Under the current processing baseline, only the group `frequencyA` is processed into GUNW
products (specification, section 3.2.4, page 12). The tool does not read the layers `mask` and
`validDataMask` of the product; `docs/research/analysis.md`, part 2.2, gives their meaning.

### What the tool refuses

The tool receives the array of the layer and its layer description. It makes the checks below in
this order and reports the first fault that it finds. A refusal is raised as `LayerError` of
`lynkeus.writing`, as `main` asks of a tool (`api/README.md`, section Analysis tools as processes),
and its message is one sentence for the visitor.

| No. | The tool refuses the input when | Sentence for the visitor |
|---|---|---|
| 1 | the number of input layers is not one | `The number of input layers must be 1, and it is <number>.` |
| 2 | the layer was not received from one product file of the type GUNW: its `kind` is not `layer`, its `inputs` do not hold exactly one name, or that name does not begin as the name of a NISAR product file of the type GUNW | `The layer "<title>" is not a layer received from one NISAR GUNW product.` |
| 3 | the unit of the layer is not `1` | `The layer "<title>" has the unit <unit>, and the tool reads the unit 1.` |
| 4 | the layer does not have two dates | `The number of dates of the layer "<title>" must be 2, and it is <number>.` |
| 5 | no cell of the layer holds a value | `The input layer holds no value in any cell.` |
| 6 | a cell holds a value below 0 or above 1, or an infinite value | `The input layer holds values outside 0 to 1, so it is not a coherence magnitude.` |

The product type is read from the beginning of the file name (naming conventions, sections 3.7 and
3.8). An array that is not two-dimensional Float32 is a fault of the calling program and raises
`ValueError`, which is not a refusal for the visitor.

One cell outside 0 to 1 refuses the whole layer. The sample layer of the pilot area lies inside the
range: its lowest value is 0.0046, its highest value is 0.9965, and 0 cells lie above 1.

The layer description has no field for the name of the layer inside the product. The tool therefore
cannot verify that its input is the layer `coherenceMagnitude`: the choice of the visitor decides.
Another layer of a GUNW product that carries the unit `1` and lies between 0 and 1 passes the checks
above. In `main` at commit `0ad795b` the Data part offers two further layers of a GUNW product with
the unit `1`: `connectedComponents` (`api/src/lynkeus/harmony.py`, lines 323 to 332) and
`correlationSurfacePeak` of the pixel offsets, to which it gives the legend 0 to 1 (lines 381 to
389). In a trial the tool accepted a layer of correlation peaks and a layer of connected components
with the values 0 and 1, and refused by check 6 a layer of connected components with the values 0, 1
and 2 (`docs/research/analysis.md`, part 3.4). The trial called the function directly, on a local
copy and with made-up arrays; it was not made on the server.

## Formula

Lynkeus computes nothing for this tool. The result is the input array itself, not a copy, with the
legend below.

The mission computes the layer with the program ISCE3. Its source code gives the quantity as
([`Crossmul.cpp`, lines 368 to 373, version 0.25.21](https://github.com/isce-framework/isce3/blob/v0.25.21/cxx/isce3/signal/Crossmul.cpp#L368-L373)):

```text
coherence = |<s1 * conj(s2)>| / sqrt(<|s1|^2> * <|s2|^2>)
```

Here `s1` and `s2` are the complex images of the two dates and `< >` is the average over the looks.
The number of looks of each layer is recorded in the product, under
`/science/LSAR/GUNW/metadata/processingInformation/parameters/[unwrappedInterferogram or wrappedInterferogram]/frequencyA/`,
as `numberOfRangeLooks` and `numberOfAzimuthLooks`.

## Unit

None (the product gives the unit `1`). The values lie between 0 and 1; the specification does not
state this range, which follows from the formula above. The result is Float32 and its no-data value
is `nan`.

## Legend

| Field of the layer description | Value |
|---|---|
| `quantity` | Interferometric coherence (magnitude) |
| `unit` | `1` |
| `range` | 0 to 1 |
| `colours` | `grey` |

The range and the colour scale are those of the quality-assurance program of the mission, nisarqa
([`unwrapped_coh_mag.py`](https://github.com/isce-framework/nisarqa/blob/a8bc425f5e8873174471d6a12fe622df338623d1/src/nisarqa/processing/insar/unwrapped_coh_mag.py):
`cmap="gray"`, `vmin=0.0`, `vmax=1.0`). The range is fixed. It is the same for every pair, so that
two pairs can be compared.

## How to read the result

Near 1, the radar echoes of the two dates are alike; near 0, they are not. A low value does not by
itself show that the surface changed: several sources lower the coherence, and change of the surface
is one of them (Zebker and Villasenor, 1992). The estimate is biased toward higher values, and it is
more accurate at a coarser resolution (Touzi et al., 1999). The 80 m layer is the coarser of the two
(specification, section 2.2), so it is expected to be the more accurate. This is a conclusion of
this sheet; the article does not treat NISAR products. The sheet states no threshold: no document of
the mission that was read for it gives one.

## Comparison with the source program (D-17)

| | |
|---|---|
| Source program | ISCE3, the program of the mission that produced the layer. Each product records its version in `/science/LSAR/GUNW/metadata/processingInformation/algorithms/softwareVersion`. The NASA catalogue records ISCE3 0.25.21 for the product of the pilot area (field `SASVersionId`) |
| Licence | Apache-2.0 |
| Comparison | The values of the result against the values of the sample file, that is the layer as NASA Harmony delivered it. No program is run for the comparison, because the tool computes nothing |
| File compared | `gunw-coherence-20261009-20261021.tif` (SHA-256 `e02cb42feeae25a9420c6298a98b59583b0f3a3e70cd0cba5241be484ea1de81`), a layer `coherenceMagnitude` of the product `NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001`, with cells of 20 m. The file is GeoTIFF as NASA Harmony delivered it, read at full resolution |
| Platform | Linux 6.8.0-146-generic x86_64, in a container of the image `python:3.13-slim`, Python 3.13.18. Lynkeus: `main` at commit `22167b4` with the code of this tool, numpy 2.5.4. The file was read with rasterio 1.5.2 (GDAL 3.12.2). The run started 2026-11-14T16:47:24Z, with the final code |
| Largest difference | 0 of 3,743,710 cells differ. The result is bit-identical to the values of the file, and it is the input array itself. 164,618 cells hold `nan` |
| Not reached | The result was not compared with the original HDF5 product file; whether Harmony delivers the values of the HDF5 layer unchanged was not examined. One pair of dates and one area were compared, at the spacing of 20 m only |

The exact numbers of the comparison are in `docs/research/analysis.md`, part 4.5.

## Not yet confirmed

1. The comparison of the result with the layer in the original HDF5 product file (Andreas).
2. Which routine of ISCE3 the processing of the mission runs for the coherence. The workflow
   `python/packages/nisar/workflows/crossmul.py` (version 0.25.21, lines 65 and 67) creates
   `isce3.signal.Crossmul`, the class of the formula above, or `isce3.cuda.signal.Crossmul`. Which
   of the two the mission runs, and how the 80 m layer is derived, was not traced. The point is with
   Andreas.
3. One field of the layer description for the name of the layer inside the product, without which
   the tool cannot verify that its input is the layer `coherenceMagnitude` (Alexandros; it changes a
   shared format).
4. The name `grey` of the colour scale in the Contents pane, and which end of it is black (Stelios).
   A later commit of `main`, `5095ee0`, holds a scale `grey` that runs from black at the lowest
   value to white (`web/src/contents/colours.ts`, lines 54 to 57); the file was read and nothing was
   tried.
5. That the sentence of a refusal reaches the visitor through a job of the server. The tool raises
   `LayerError`, which `run_tool` passes on (`api/src/lynkeus/tools.py`, lines 59 to 64, at commit
   `0ad795b` of `main`). This was read in the files; no job of a tool was run
   (`docs/research/analysis.md`, part 7, point 10; Andreas).
