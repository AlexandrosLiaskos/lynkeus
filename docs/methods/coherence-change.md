# Coherence, Change

| | |
|---|---|
| Tool | `coherence-change` (Analysis tab, group Coherence, button Change) |
| NISAR product | GUNW, Level-2 Geocoded Unwrapped Interferogram |
| Result | Change of the magnitude of the interferometric coherence between two pairs of dates, the later pair minus the earlier pair, without unit |
| State | The comparison with the source program (D-17) was made on 15 Nov 2026 on five pairs of layers of the pilot area, which were received from NASA Harmony on that day through the Data part of Lynkeus. |

## In brief

| | |
|---|---|
| What it shows | The change between two pairs of dates of the interferometric coherence, a value from 0 to 1 that states how alike the radar echoes of two dates are. |
| Input | The same coherence layer (`coherenceMagnitude`) of two GUNW products of one track, direction and frame. The two pairs of dates span the same number of days and do not overlap. |
| Formula | `coherence_of_the_later_pair - coherence_of_the_earlier_pair` |
| Result | Without unit. The legend runs from −1 to 1. Red is a decrease and blue an increase. |
| How to read | A positive value means that the radar echoes of the later pair are more alike than those of the earlier pair, and a negative value that they are less alike. The map does not state the cause: rain, snow, the growth of plants and farming also change the coherence. On the test area the mean change between pairs of 12 days without a known event lies between −0.242 and 0.200 (20 m layers). |
| Limits | The result is the later pair minus the earlier pair, and the two pairs must span the same number of days. The tool accepts a provisional and a validated product together, and whether their coherence is comparable is not confirmed. The comparison was made with a general raster program, on files that Lynkeus wrote. |
| Checked | The result equals that of the program `gdal raster calc` of GDAL 3.12.2 in every cell, for five pairs of coherence layers of the test area (lower Merrimack River, channel HH, pairs of dates between 10 Aug and 21 Oct 2026). Both programs read the same files, which Lynkeus wrote and which were not compared with the product files. |
| References | [Fielding et al. (2005)](https://doi.org/10.1029/2004JB003299), of which the abstract was read. [Stephenson et al. (2022)](https://doi.org/10.1109/TGRS.2021.3084209), read as the accepted manuscript, and [Plank (2014)](https://doi.org/10.3390/rs6064870). [NISAR L2 GUNW Product Specification, JPL D-102272 Rev E](https://nisar-docs.asf.alaska.edu/product-specification/). |

## Reference

1. Fielding, E. J., Talebian, M., Rosen, P. A., Nazari, H., Jackson, J. A., Ghorashi, M. and
   Walker, R. (2005). Surface ruptures and building damage of the 2003 Bam, Iran, earthquake mapped
   by satellite synthetic aperture radar interferometric correlation. Journal of Geophysical
   Research: Solid Earth, 110(B3). <https://doi.org/10.1029/2004JB003299>. The article takes the
   difference between the interferometric correlation of an interval that includes the earthquake
   and that of an interval before the earthquake. Only the abstract of the article was read.
2. Stephenson, O. L., Köhne, T., Zhan, E., Cahill, B. E., Yun, S.-H., Ross, Z. E. and Simons, M.
   (2022). Deep Learning-Based Damage Mapping With InSAR Coherence Time Series. IEEE Transactions on
   Geoscience and Remote Sensing, 60, 1-17. <https://doi.org/10.1109/TGRS.2021.3084209>. Read as
   the accepted manuscript, <https://arxiv.org/abs/2105.11544>: section II-B and Figure 1 (the
   method that the article names Coherence Change Detection: the coherence image before the event
   is subtracted from the coherence image that spans the event), and section VI-A (the time between
   the two dates of a pair).
3. Plank, S. (2014). Rapid Damage Assessment by Means of Multi-Temporal SAR — A Comprehensive
   Review and Outlook to Sentinel-1. Remote Sensing, 6(6), 4870-4906.
   <https://doi.org/10.3390/rs6064870>. Section 2 (pages 4875 to 4877), section 2.1 (pages 4877
   and 4878), section 2.3 (pages 4879 and 4880) and section 4 (pages 4891 and 4892): which images
   and which pairs the comparison of two coherences needs.
4. Touzi, R., Lopes, A., Bruniquel, J. and Vachon, P. W. (1999). Coherence estimation for SAR
   imagery. IEEE Transactions on Geoscience and Remote Sensing, 37(1), 135-149.
   <https://doi.org/10.1109/36.739146>. Only the abstract of the article was read.
5. NASA SDS Product Specification, Level-2 Geocoded Unwrapped Interferogram (L2 GUNW), JPL D-102272,
   Rev E, version 1.2.1, 8 November 2024. Sections 2.2 and 3.2.4; Table 3-11; the entries of
   `coherenceMagnitude` on pages 35 to 37.
6. Product specification of the versions 1.5.0 and 1.6.0, which the products of the pilot area
   follow: files `nisar_L2_GUNW.xml` of
   [nisarqa](https://github.com/isce-framework/nisarqa/tree/a8bc425f5e8873174471d6a12fe622df338623d1/src/nisarqa/product_specs),
   commit `a8bc425` of 30 Sep 2026. The four entries of `coherenceMagnitude` are the same in the
   two files, and they give the type, the unit and the no-data value of version 1.2.1.
7. Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C,
   19 October 2025. Section 3.8 (pages 18 and 19). The tool reads the product type, the instrument,
   the track, the direction, the frame and the bandwidth mode of each input from the name of its
   product file.

## Input layers

The inputs are given in this order.

| No. | Layer | Path in the product | Type | Unit | No data |
|---|---|---|---|---|---|
| 1 | The layer `coherenceMagnitude` of the earlier pair of dates | `/science/LSAR/GUNW/grids/frequencyA/[unwrappedInterferogram or wrappedInterferogram]/[HH or VV]/coherenceMagnitude` | Float32 | `1` | `nan` |
| 2 | The same layer of the later pair of dates | as above, in the product of the later pair | Float32 | `1` | `nan` |

The layers are described in the sheet [Coherence, One pair](coherence-state.md). A GUNW product
holds one pair of dates, the reference and the secondary, and its layer `coherenceMagnitude` exists
at two spacings: 20 m in the group `wrappedInterferogram` and 80 m in the group
`unwrappedInterferogram` (specification, section 2.2). The tool does not read the layers `mask` and
`validDataMask` of the products; `docs/research/analysis.md`, part 2.2, gives their meaning.

The two pairs must be alike in everything except their dates. The sources give these conditions.

1. All images are acquired with the same imaging geometry: the same direction of the orbit, the
   same incidence angle, the same relative orbit, the same imaging mode and the same wavelength
   (Plank, 2014, section 4, condition II, page 4891). The tool therefore asks for the same
   instrument, track, direction, frame and bandwidth mode.
2. The accuracy of an estimated coherence depends on the number of independent samples that are
   averaged, and the estimate is biased toward higher values (Touzi et al., 1999, abstract). The two
   inputs must therefore be the same layer of their products: the same group, that is the same
   spacing, and the same channel. In the five products of the pilot area the 20 m layer was made
   with 5 looks in range by 6 in azimuth and the 80 m layer with 13 by 16
   (`docs/research/analysis-coherence-change.md`, part 4.2).
3. The earlier pair lies before the later pair. In the sources the earlier pair is made of two
   images before an event and the later pair spans the event; the two pairs share one image (Plank,
   2014, section 2, Figures 3 and 4), or the earlier pair is an interval before the event (Fielding
   et al., 2005, abstract). The tool accepts two pairs that share one date and two pairs that are
   apart in time. It refuses two pairs whose intervals overlap: no source that was read compares
   such pairs.
4. The two pairs span the same number of days. A pair with a longer time between its two dates
   generally has a lower coherence than a pair of the same region and period with a shorter time,
   and a time that varies between pairs adds noise, because the amount of temporal decorrelation
   changes (Stephenson et al., 2022, sections II-B and VI-A). In the best case each pair spans one repeat cycle (Plank,
   2014, Figure 3). No source that was read requires equal spans in so many words, and none gives a
   correction for unequal spans. The result of the tool has no field for a warning, so the tool
   refuses pairs of unequal spans.

### What the tool refuses

The tool receives the two arrays and their layer descriptions. It makes the checks below in this
order and reports the first fault that it finds. A refusal is raised as `LayerError` of
`lynkeus.writing`, and its message is one sentence for the visitor.

| No. | The tool refuses the inputs when | Sentence for the visitor |
|---|---|---|
| 1 | the number of input layers is not two | `The number of input layers must be 2, and it is <number>.` |
| 2 | the two arrays do not have the same number of rows and of columns | `The input layers do not have the same grid.` |
| 3 | a layer was not received from one product file of the type GUNW: its `kind` is not `layer`, its `inputs` do not hold exactly one name, or that name does not begin as the name of a NISAR product file of the type GUNW | `The layer "<title>" is not a layer received from one NISAR GUNW product.` |
| 4 | the description of a layer does not hold the name of the layer inside the product (field `layer`) | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 5 | the name of a layer inside its product is not one of the four names `unwrappedInterferogram/HH/coherenceMagnitude`, `unwrappedInterferogram/VV/coherenceMagnitude`, `wrappedInterferogram/HH/coherenceMagnitude` and `wrappedInterferogram/VV/coherenceMagnitude` | `The layer "<title>" is the layer <name> of its product, and the tool reads the layer coherenceMagnitude.` |
| 6 | the unit of a layer is not `1` | `The layer "<title>" has the unit <unit>, and the tool reads the unit 1.` |
| 7 | a layer does not have two dates | `The number of dates of the layer "<title>" must be 2, and it is <number>.` |
| 8 | the two layers are not the same layer of their products, for example the 20 m layer with the 80 m layer, or the channel HH with the channel VV | `The two layers are not the same coherence layer: the first is <name> and the second is <name>.` |
| 9 | the two products are not of the same instrument, track, direction of the orbit and frame | `The two layers are not of the same instrument, track, direction and frame.` |
| 10 | the name of a product file does not hold the four digits of the bandwidth mode after the second cycle number | `The name of the product of the layer "<title>" does not hold its bandwidth mode.` |
| 11 | the bandwidth modes of the two products differ | `The two layers are not of the same bandwidth mode: the first is <code> and the second is <code>.` |
| 12 | the two dates of a layer are the same day | `The two dates of the layer "<title>" are the same day.` |
| 13 | the later date of the first layer is after the earlier date of the second layer: the later pair was given first, the two layers are of the same pair, or the intervals of the two pairs overlap | `The pair of the first layer must end on or before the first date of the pair of the second.` |
| 14 | the two pairs do not span the same number of days | `The two pairs do not span the same number of days: the first spans <number> days and the second <number> days.` |
| 15 | a cell of a layer holds a value below 0 or above 1, or an infinite value | `The layer "<title>" holds values outside 0 to 1, so it is not a coherence magnitude.` |
| 16 | no cell holds a value in both layers | `The result would hold no value in any cell.` |

Checks 2 to 7 are made for the first layer and then for the second, and so are checks 10, 12 and
15. The product type, the instrument (`L` or `S`), the track, the direction (`A` or `D`), the frame
and the bandwidth mode code are read from the name of each product file (naming conventions,
section 3.8). The bandwidth mode code is four characters for the bandwidth of the primary and of
the secondary band, for example `4000`. An array that is not two-dimensional Float32 is a fault of
the calling program and raises `ValueError`, which is not a refusal for the visitor.

The tool does not resample. The function receives the two arrays and no coordinates, so it can
check only their numbers of rows and of columns. The server reads the layers and compares their
grids before it calls the tool, and it refuses layers whose grids differ with the sentence "The
layers of the analysis do not have the same grid." (`api/src/lynkeus/tools.py`). The 20 m layer and
the 80 m layer of the pilot area were refused in this way before check 8 was reached (part 4.5 of
the research note).

The tool does not compare the release of the processing of the two products (the field CRID of the
file name), the polarisation mode of the acquisition (`SH`, `DH` and so on) or the baselines of the
two pairs. Section Not yet confirmed gives what is known about them.

## Formula

```text
change = coherence_of_the_later_pair - coherence_of_the_earlier_pair
```

The result of a cell is no data when either input value is `nan`. The tool computes in 32-bit
floating-point numbers. Each input lies between 0 and 1, so the result lies between −1 and 1.

The sources do not agree on the sign. Stephenson et al. (2022, Figure 1) subtract the coherence
before the event from the coherence that spans the event, which is the order of this tool. Plank
(2014, equations 10 to 12) writes the normalised difference with the earlier pair first, so that a
loss of coherence is positive. The legend therefore names its two ends in words.

## Unit

None (the unit `1` of the inputs). The result is Float32 and its no-data value is `nan`.

## Reduced copies of the result

The file of a result holds the values of the formula at full resolution. It also holds reduced
copies (overviews), at the factors 2 and 4 for a result of the 20 m layers of the pilot area, which
the map draws when it is zoomed out. Lynkeus makes each cell of a reduced copy as the mean of the
values of the change of the cells that it covers. The record of the result says: "Reduced copies
made by averaging the values."

Measured on 15 Nov 2026 on the four results of the 20 m layers of the pilot area: each reduced copy
of a result equals the difference of the reduced copies of its two input layers, with a largest
difference of 8.9e-08 at the factor 2 (897,089 cells with a value) and at the factor 4
(225,672 cells), and the same cells hold a value on both sides
(`docs/research/analysis-coherence-change.md`, part 4.4). The result of the 80 m layers of the
pilot area holds no reduced copy.

For the reader: when the map is zoomed out, a cell shows the mean of the changes of the cells that
it covers, which is the change of their mean coherence. It is not a change of a coherence estimated
at that coarser resolution: Lynkeus does not hold the complex images from which the mission
estimates the coherence. The values at full zoom, and the values of the file at full resolution,
are those of the formula.

## Legend

| Field of the layer description | Value |
|---|---|
| `quantity` | Change of interferometric coherence (magnitude) |
| `unit` | `1` |
| `range` | −1 to 1 |
| `colours` | `RdBu`, a diverging scale centred on zero. The lowest value is red and the highest blue: a decrease is red and an increase blue |
| `ends` | `decrease`, `increase`: the words of the lowest and of the highest end of the legend |

The range is fixed, as the range of Coherence, One pair is fixed: −1 and 1 are the lowest and the
highest value that the formula can give, and the range is the same for every result, so that two
results can be compared. No source that was read gives a range or a colour scale for a map of the
difference of two coherences. The scale and the two words are those of Backscatter, Change
(`docs/methods/backscatter-change.md`, section Legend). In `RdBu` of Matplotlib 3.11.2 the lowest
value is dark red, the centre near white and the highest value dark blue (tried on 15 Nov 2026).

The values of a result use a part of the fixed range. On the pilot pairs of 27 Sep to 9 Oct 2026
and 9 to 21 Oct 2026 (20 m), the 1st and the 99th percentile of the change are -0.351 and
0.559, and the 99th percentile of its absolute values is 0.567. On the pairs of 15 to 27 Sep
2026 and 27 Sep to 9 Oct 2026 the 99th percentile of the absolute values is 0.278. The visitor can
narrow the range of the display in the Symbology pane; the two words then no longer show
(`docs/methods/backscatter-change.md`, section Legend).

## How to read the result

A positive value means that the radar echoes of the later pair of dates are more alike than those
of the earlier pair, and a negative value means that they are less alike. The map shows where the
coherence changed and by how much, and it does not state the cause of the change. A loss of
coherence can be seen only where the coherence of the earlier pair is high (Plank, 2014, section
2.3).

The method rests on the assumption that the coherence of the earlier pair represents the coherence
that the later pair would have without a change (Stephenson et al., 2022, section II-B). Rain,
snow, the growth of plants and farming also change the coherence between two pairs (the same
section). The sheet states no threshold: Stephenson et al. (2022, section II-B) describe a
threshold that is chosen by hand for each case, from areas that are known not to have changed.

On the pilot area the coherence differs between pairs of 12 days without any known event. Between
the pairs of 15 to 27 Sep 2026 and 27 Sep to 9 Oct 2026 the mean change is -0.013; between
the pairs of 27 Sep to 9 Oct 2026 and 9 to 21 Oct 2026 it is 0.200; between the pairs of 10 to
22 Aug 2026 and 15 to 27 Sep 2026 it is -0.242 (20 m layers, 3,579,092 cells with a value).
The cause of these differences was not examined.

## Comparison with the source program (D-17)

| | |
|---|---|
| Source program | GDAL, program `gdal raster calc`, with the expression `B-A`, where `A` is the layer of the earlier pair and `B` the layer of the later pair. The program evaluates the expression for each cell with the library muparser, after it converts the inputs to 64-bit floating-point numbers ([`gdal_raster_calc.rst`, tag v3.12.2](https://github.com/OSGeo/gdal/blob/v3.12.2/doc/source/programs/gdal_raster_calc.rst)) |
| Version | `GDAL 3.12.2 "Chicoutimi", released 2026/02/03`, in the image `ghcr.io/osgeo/gdal:alpine-small-3.12.2` (`sha256:3775c7530eb68f95b8c67853da1e1e99a607e32a87f3d433440b8b562079f645`) |
| Licence | MIT style (`LICENSE.TXT` at the tag v3.12.2) |
| Comparison | The array of the tool against the file that the source program wrote from the same two layer files, cell by cell, as 32-bit patterns. The command was `gdal raster calc -i A=<earlier> -i B=<later> --calc B-A --output-data-type Float32 -o <result>` |
| Files compared | Five pairs of layers of the pilot area (track 141, frame 67, descending), each a layer `coherenceMagnitude` of the channel HH as Lynkeus wrote it after NASA Harmony delivered it: four pairs of 20 m layers (1886 by 1985 cells) and one pair of 80 m layers (471 by 496 cells). The products, the files and their SHA-256 are in `docs/research/analysis-coherence-change.md`, part 4.1 |
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18. Lynkeus: the code of this tool at commit `84724b3`, numpy 2.5.4; the files were read with rasterio 1.5.2 (GDAL 3.12.2). The records are in `docs/research/records/analysis/coherence-change/` (`lynkeus_side.json`, `comparison.json`) |
| Largest difference | 0.0. The arrays are bit-identical in all five pairs. In each pair of 20 m layers, of 3,743,710 cells, 3,579,092 hold a value in both results, the others hold `nan` in both, and 0 cells hold a value in one result only. In the pair of 80 m layers, of 233,616 cells, 223,693 hold a value in both results |
| Not reached | The source program computes a subtraction, and it shares with Lynkeus the library that reads GeoTIFF files (GDAL 3.12.2 on both sides). It is not a program of radar interferometry: no published program that takes the difference of two NISAR coherence layers was found. The layers hold no value outside 0 to 1 and no infinite value, and every cell without data is without data in both layers of a pair, so the comparison does not show such cells. The layers of the channel VV were not received. The layer files were written by Lynkeus from the files of NASA Harmony and were not compared with the HDF5 product files. One area was compared |

The tool was also run through `lynkeus.tools.run_tool` on the same five pairs: each result file,
read back at full resolution, is bit-identical to the array of the function. No copy of the web
service was started. The exact numbers are in `docs/research/analysis-coherence-change.md`, part 4.

## Not yet confirmed

1. Whether two releases of the processing give the same coherence for the same pair of images. Three
   of the five comparisons join a product of the provisional collection (CRID `P05023`, ISCE3
   0.25.16) with the product of the validated collection (CRID `P05036`, ISCE3 0.25.21). Both
   releases record the same numbers of looks and the same range bandwidth, and the file of ISCE3 that
   computes the coherence is the same in both versions (part 4.2 of the research note). No pair of
   dates of the pilot area exists in both collections, so the two releases could not be compared on
   the same images. The tool does not refuse products of different releases.
2. Pairs of unequal spans. The tool refuses them (section Input layers, condition 4). On the pilot
   area the pair of 10 to 22 Aug 2026 (12 days) minus the pair of 17 Jul to 10 Aug 2026 (24 days)
   has a mean of 0.019, which is smaller than the differences between pairs of 12 days
   (section How to read the result). One such pair was measured. Whether such pairs should be
   accepted with a notice is a question for the owner of the project.
3. Pairs whose intervals overlap, for example two pairs with the same first date. The tool refuses
   them, because no source that was read compares such pairs.
4. The spatial baseline. A larger distance between the two orbits of a pair lowers its coherence
   (Plank, 2014, section 2.1). The tool does not read the baselines. The mean perpendicular
   baselines of the five pilot products lie between −49 m and 92 m (part 4.2 of the research note);
   the critical baseline of NISAR was not read.
5. The correction of the bias of the estimate and the matching of the histograms of the two
   coherences before the subtraction, which Yun et al. (2015,
   <https://doi.org/10.1785/0220150152>) apply. Only extracts of the article that a web search
   showed were read; the tool applies neither.
6. The layers of the channel VV, two products of different instruments, tracks, directions, frames
   or bandwidth modes, and layers with values outside 0 to 1: the checks were tried in the tests of
   the code with made-up layers, and no such layers were received.
7. The legend in the Contents pane. The fixed range −1 to 1 leaves the colours of most cells of the
   pilot results pale. Whether the range should follow the values of each result, as in
   Backscatter, Change, is a question for the owner of the project. Nothing was seen in a browser.
8. How the interface shows the sentence of a refusal. The refusals were tried through the function
   and through `lynkeus.tools.run_tool` (part 4.5 of the research note), not through the web
   service.
