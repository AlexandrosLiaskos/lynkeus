# Soil moisture, Series

| | |
|---|---|
| Tool | `soil-moisture-series` (Analysis tab, group Soil moisture, button Series) |
| NISAR product | SME2, Level-3 Soil Moisture on the 200 m EASE-Grid 2.0 |
| Result | Volumetric soil moisture of many dates against time, at a point or as the mean of the area of the layers, in cubic metres of water in a cubic metre of soil (m3 m-3), in the cells whose retrieval NISAR recommends on each date. The result is a series, not a layer |
| State | The comparison (D-17) was made on 15 Nov 2026 on the nine SME2 products of the pilot frame that the NASA catalogue held (track 141, frame 67, descending, 23 Jun to 9 Oct 2026, release `P05023`), and on its two beta products of December 2025 (release `X05010`) as a series of their own, for the mean of the area and at eight points. The interface offers the tool; this was run in the tests of the interface and was not seen in a browser |

## In brief

| | |
|---|---|
| What it shows | The soil moisture of many dates against time, at a point or as the mean of the area, in the cells whose retrieval NISAR recommends on each date. |
| Input | The layer `soilMoisture` of 2 to 25 SME2 products of one track, direction and frame, each with the layer `retrievalQualityFlag` of its product, which the form takes by itself. A point is given by its latitude and longitude, and an area is drawn on the map or is the whole layer. |
| Formula | On each date, the mean of the soil moisture of the cells whose flag has the lowest bit 0. At a point it is the one cell that holds the point, when NISAR recommends its retrieval. |
| Result | A series in cubic metres of water in a cubic metre of soil (m3 m-3): one value for each date, with the number of cells behind it. It is shown as a chart and a table, has no file, and states which cells were left out. |
| How to read | A higher value is a wetter soil. A date without a value has no recommended cell at the point, or in the area. The mean of the area is that of the recommended cells of each date, which may lie in other places on other dates. |
| Limits | In the provisional products of the test area NISAR marks 97.9 % to 98.7 % of the cells with a soil moisture as not recommended on each date, and in the two beta products none, so a series of the area rests on few cells and a series at a point mostly has no value. The ASF NISAR Cookbook holds no notebook of SME2 products, so the statements of its backscatter notebook were applied to the soil moisture. Only provisional and beta products existed for the test area on 15 Nov 2026. |
| Checked | For the mean of the area, the values differ by less than 0.00000003 m3 m-3 from the mean that the code of a notebook of the ASF NISAR Cookbook gives on the same layers with the rule of the flag; at three points with a value on every date the values are equal, and at five points neither gives a value (lower Merrimack River, nine dates from 23 Jun to 9 Oct 2026, and two beta dates). |
| References | [NISAR L3 SME2 Product Specification, JPL D-107677 Rev C](https://nisar-docs.asf.alaska.edu/product-specification/). [NISAR L3 Soil Moisture ATBD, JPL D-107679 Release 3.3](https://nisar-docs.asf.alaska.edu/atbd/). [ASF NISAR Cookbook](https://github.com/ASFOpenSARlab/NISAR_Cookbook). |

## Reference

1. NASA SDS Product Specification, Level-3 Soil Moisture (L3_SME2), JPL D-107677, Rev C, version
   1.0.0, 8 November 2024. Table 4.2.1, the entries of `retrievalQualityFlag` and `soilMoisture` on
   page 37 (bit 0 of the flag: "Retrieval recommended flag"). The products of the pilot area state
   the version `1.0.2` of the specification, and describe the bit in the attribute `description` of
   the layer: "The least significant bit indicates whether the retrieval is recommended (0 =
   recommended, 1 = not recommended)".
2. NISAR L3 Soil Moisture Data Product, Algorithm Theoretical Basis Document (ATBD), JPL D-107679,
   Release 3.3, 28 April 2023. Section 5.5, Tables 5.5.1 and 5.5.2, pages 52 to 54: the bit 0 of the
   retrieval quality flag is set where the surface flag is above 0, among others where the
   vegetation water content is above 5 kg/m2, or where another bit of the flag is raised.
3. ASF NISAR Cookbook, commit `17b69c8` of 3 Nov 2026: notebook
   [`NISAR_GCOV_Time_Series_Example.ipynb`](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_Time_Series_Example.ipynb),
   cells 14, 16 and 19 (the time of each product and the cube) and 47 (the mean of each date of a
   cube), and notebook
   [`NISAR_Pixel_Conversion.ipynb`](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_Pixel_Conversion.ipynb),
   cell 20 (the pixel of a point). The ASF NISAR Cookbook holds no notebook of SME2 products at this
   commit.
4. Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C,
   19 October 2025. Section 4.1, pages 20 and 21 (the composite release identifier, CRID), with the
   file name convention of SME2 products in the specification above, section 2.3.

## Input layers

The tool takes two layers of each date, one date after the other, the dates in any order: the layer
`soilMoisture` of an SME2 product and then the layer `retrievalQualityFlag` of the same product
file. It takes 2 to 25 dates, so 4 to 50 layers.

| Layer | Path in the product | Type | Unit | No data |
|---|---|---|---|---|
| The soil moisture of a date | `/science/LSAR/SME2/grids/soilMoisture` | Float32 | `meter^3/meter^3` in the product; `m3 m-3` in the layer description | `-9999` in the product; `nan` in the layer |
| The retrieval quality flag of the same product | `/science/LSAR/SME2/grids/retrievalQualityFlag` | Int16 in the product; 32-bit numbers in the layer | `1` | `-9999` in the product; `nan` in the layer |

The two layers are described in the sheet [Soil moisture, One date](soil-moisture-state.md). The
form of the tool shows the layers of the soil moisture and takes the flag of the product of each by
itself; when the session holds none for a chosen date, the form says which, and the Get layer form
receives it. All products of one series are of the same instrument, track, direction and frame and
of the same environment and major release of the processing software, as for the other Series tools
(`docs/methods/backscatter-series.md`). The request may give a point, in degrees of longitude and
latitude (WGS 84); the series is then that of the one cell of the grid of the layers that holds it.

### What the tool refuses

The server and the tool make the checks below in this order and report the first fault that they
find. A refusal is raised as `LayerError` of `lynkeus.writing`, and its message is one sentence for
the visitor. The checks 1 to 16 are made on the layer descriptions and on the grids, before any
value is read.

| No. | The tool refuses the input when | Sentence for the visitor |
|---|---|---|
| 1 | a layer of the request is not a layer of the session | `A layer of the analysis no longer exists.` |
| 2 | the layers differ in projection, transform, width or height | `The layers of the analysis do not have the same grid.` |
| 3 | the point lies outside the grid of the layers | `The point lies outside the area of the layers.` |
| 4 | the number of layers is odd | `The number of input layers must be even, two for each date, and it is <number>.` |
| 5 | the dates are fewer than two | `A series needs at least 2 layers, and it has <number>.` |
| 6 | a layer of the soil moisture (the first of each date) was not received from one product file of the type SME2 | `The layer "<title>" is not a layer received from one NISAR SME2 product.` |
| 7 | its description does not hold the name of the layer inside the product | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 8 | its name inside the product is not `soilMoisture` | `The layer "<title>" is the layer <name> of its product, and the tool reads the layer soilMoisture.` |
| 9 | its unit is not `m3 m-3` | `The layer "<title>" has the unit <unit>, and the tool reads the unit m3 m-3.` |
| 10 | it does not have one date | `The number of dates of the layer "<title>" must be 1, and it is <number>.` |
| 11 | the products are not of the same instrument, track, direction and frame | `The layers are not of the same instrument, track, direction and frame.` |
| 12 | the name of a product file does not hold the release of the processing software, or the products are not of the same environment and major release | `The name of the product file of the layer "<title>" does not hold the release of the processing software.` or `The layers are not of the same major release of the processing software: "<title>" is of the release <CRID> and "<title>" of <CRID>.` |
| 13 | two dates are the same | `The layers "<title>" and "<title>" have the same dates.` |
| 14 | a layer of the flag (the second of each date) is not a layer `retrievalQualityFlag` of an SME2 product with the unit `1` and one date | the sentences of the checks 6 to 10, with the layer `retrievalQualityFlag` and the unit `1` |
| 15 | the two layers of a date are not of the same product file | `The layers "<title>" and "<title>" are not of the same product file.` |
| 16 | the two arrays of a date, or the arrays of two dates, differ in size | `The input layers do not have the same grid.` |
| 17 | a soil moisture holds no value, or a value below 0 or above 1 | `The layer "<title>" holds no value in any cell.` or `The layer "<title>" holds values outside 0 to 1, so it is not a volumetric soil moisture.` |
| 18 | a flag holds no value, or a value that is not a whole number from 0 to 32767 | `The layer "<title>" holds no value in any cell.` or `The layer "<title>" holds values that are not whole numbers from 0 to 32767, so it is not a retrieval quality flag.` |
| 19 | no date keeps a value because NISAR marks every value as not recommended | `NISAR marks the retrieval at the point as not recommended on every date that holds a soil moisture, so the series has no value.` or `NISAR marks the retrieval of every cell as not recommended on every date, so the series has no value.` |
| 20 | no date holds a value, at the point or in any cell, for another reason | `No layer of the series holds a value at the point.` or `No layer of the series holds a value in any cell.` |

A request with one layer, with one layer given twice or with more than 50 layers is refused by the
web service before a job is made, with the status 400.

## Formula

For each date, with `M` the soil moisture and `F` the retrieval quality flag of its product:

```text
kept  = cells where M holds a value and F holds a value whose lowest bit is 0 (F is even)
value = mean(M over kept)        cells = number of kept cells
```

For a series of the area these are all kept cells of the date; at a point it is the one cell of the
point, when it is kept. An entry without a kept cell has no value (`null`) and 0 cells. The mean is
taken in 64-bit numbers. A cell whose flag holds no value is left out as well; in the products of
the pilot area the flag holds a value in every cell that holds a soil moisture. The note of the
series states the share of the cells with a soil moisture that were left out on each date, or, at a
point, on how many dates the retrieval of the cell is not recommended.

## Unit

Cubic metres of water in a cubic metre of soil (m3 m-3). The values are 64-bit numbers.

## Reduced copies of the result

A series has no file and no reduced copies. The tool reads every layer at full resolution. The
field `reduction` of the series description is `mean`.

## Legend

A series is drawn as a chart and has no colour scale. The fields below take the place of the legend.

| Field of the series description | Value |
|---|---|
| `quantity` | Soil moisture |
| `unit` | `m3 m-3` |
| `range` | none: the axis follows the values |
| `reduction` | `mean` |
| `note` | One sentence on the cells left out |

The table of the series pane writes the values with three decimals.

## How to read the result

Each entry is one date. A higher value is a wetter soil (sheet Soil moisture, One date, section How
to read the result). A series of the area is the mean of the soil moisture of the cells that NISAR
recommends on that date; the recommended cells may differ from date to date, so two values of the
area are means of different places. The column Cells of the table gives the number of cells behind
each value. A date without a value has no recommended cell, at the point or in the area. The sheet
states no threshold.

## Comparison with the source program (D-17)

The source program is the code of the notebooks `NISAR_GCOV_Time_Series_Example.ipynb` and
`NISAR_Pixel_Conversion.ipynb` of the ASF NISAR Cookbook, commit `17b69c8`, run with numpy 2.5.3,
xarray 2026.7.0 and rioxarray 0.22.0. The Cookbook holds no notebook of SME2 products, so its
statements were run on the cube of the soil moisture: the time of each product from the name of its
file and the cube of the dates (cells 14, 16 and 19), the mean of each date (cell 47) and the cell
of a point (cell 20 of the pixel notebook). One statement was added for the rule of the flag: `ts =
ts.where(flags_ts % 2 == 0)`. Both programs read the same GeoTIFF files, the layers that NASA
Harmony delivered for the box of the pilot area.

| Date | Cells with a soil moisture | Cells kept | Mean of Lynkeus (m3 m-3) | Mean of the Cookbook code (m3 m-3) |
|---|---|---|---|---|
| 23 Jun 2026 | 27,411 | 402 | 0.3096 | 0.3096 |
| 5 Jul 2026 | 27,411 | 385 | 0.2959 | 0.2959 |
| 17 Jul 2026 | 29,238 | 389 | 0.3046 | 0.3046 |
| 10 Aug 2026 | 29,238 | 394 | 0.2133 | 0.2133 |
| 22 Aug 2026 | 29,238 | 400 | 0.2144 | 0.2144 |
| 3 Sep 2026 | 29,238 | 402 | 0.2253 | 0.2253 |
| 15 Sep 2026 | 29,238 | 422 | 0.2215 | 0.2215 |
| 27 Sep 2026 | 29,238 | 479 | 0.2533 | 0.2533 |
| 9 Oct 2026 | 29,238 | 600 | 0.2145 | 0.2145 |

The numbers of cells kept are equal on every date. The code of the Cookbook keeps the cube in 32-bit
numbers, and its means differ from those of Lynkeus by at most 0.00000003 m3 m-3; computed in 64-bit
numbers from the same cube, the two means are equal on every date. On the two beta dates (13 and 25
Dec 2025) the means are 0.2763 and 0.2655 m3 m-3, from 682 and 326 cells, with the same agreement.
Lynkeus gives the same series when the dates are given in the reverse order.

At eight points the two programs agree. At three points near the northern edge of the box (latitude
42.9359°, longitudes −71.0052°, −70.8807° and −70.8351°) NISAR recommends the retrieval on all nine
dates, both programs find the same cell, and the nine values are equal. At two points every date
with a soil moisture is marked as not recommended, and at three points no layer holds a value: there
Lynkeus refuses the series with one sentence, and the code of the Cookbook gives no value on any
date.

The exact numbers of the comparison are in `docs/research/analysis-soil-moisture.md`, part 9.

## Not yet confirmed

1. What bit 8 of the surface flag marks, which the products set in most of the cells that they do
   not recommend, and whether those cells could be shown with a mark instead of being left out
   (`docs/research/analysis-soil-moisture.md`, part 8.1). The decision of 15 Nov 2026 leaves out
   every cell whose bit 0 is 1 (Alexandros).
2. The source program. The Cookbook has no notebook of SME2 products; the statements of its
   backscatter notebook were applied to the soil moisture, and one statement that applies the rule
   of the flag was added.
3. How the chart of a series looks on a screen. This was run in the tests of the interface only; it
   was not seen in a browser.
4. A series for an area drawn on the map. It uses the code of the other Series tools, whose means
   over a drawn polygon were compared with `gdal raster zonal-stats`; for the soil moisture this
   case was not compared.
