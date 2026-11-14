# Research note: Contents pane and display of layers

This note records, for each function of the Contents pane and of the drawing of layers, how GIS programs offer
it, which existing function Lynkeus uses for it, the choices of Lynkeus, the limits found and what could not be
confirmed. Every source was read on the date given.

## List of layers, visibility and selection

| | |
|---|---|
| ArcGIS Pro | The Contents pane lists the layers of the map. Its default list, List By Drawing Order, runs from the top: a layer draws over the layers below it in the list. A check box beside each layer controls its visibility, and a right-click on the name of a layer opens a menu of commands ([Contents pane](https://pro.arcgis.com/en/pro-app/2.7/help/mapping/map-authoring/contents-pane.htm), [Layers](https://doc.esri.com/en/arcgis-pro/latest/help/mapping/layer-properties/layers.html)). A layer is selected ("highlighted") by a click on it, and the ribbon then acts on that layer ([Display layers at certain scales](https://pro.arcgis.com/en/pro-app/latest/help/mapping/layer-properties/display-layers-at-certain-scales.htm)). |
| QGIS | The Layers panel lists all layers and manages their visibility. Layers nearer the top of the list are drawn over the layers lower down ([General Tools, Layers panel](https://docs.qgis.org/3.40/en/docs/user_manual/introduction/general_tools.html)). |
| Function used | The list is built by Lynkeus from `mapLayersStore`, in the shared `Pane`. The visibility box is the check box of the browser. The name of a layer is a button whose pressed state tells assistive technology that the layer is selected, as the products of the Catalog pane do. |
| Choices of Lynkeus | A second click on the name of the selected layer ends the selection. A layer is not selected when it is added. The legend of a layer starts unfolded. The dates of a layer stand under its name, because two layers of one product type differ only in their date. The background maps are listed under the layers, each with a box. One background map is shown at a time: its box and the buttons of the Basemap group read and set the same store (`baseMapStore` of the Map tab), and unticking the box of the one shown leaves the map without a background map. These come from no source. |
| Limits | One layer is selected at a time. The list has no search box and no filter, and it cannot be listed by source or by another property, as in ArcGIS Pro. Layers cannot be put in groups. |
| Read on | 14 Nov 2026 |

## Order of the layers

| | |
|---|---|
| ArcGIS Pro | A layer is dragged to another position of the drawing order list ([Contents pane](https://pro.arcgis.com/en/pro-app/2.7/help/mapping/map-authoring/contents-pane.htm)). For the elements of a layout the same pane offers the commands Bring To Front, Bring Forward, Send Backward and Send To Back ([Layout and the Contents pane](https://pro.arcgis.com/en/pro-app/latest/help/layouts/layout-contents-pane.htm)). |
| QGIS | A layer is dragged up or down in the Layers panel ([General Tools, Layers panel](https://docs.qgis.org/3.40/en/docs/user_manual/introduction/general_tools.html)). |
| Standard | A function that works by dragging must also work with a single pointer without dragging (Web Content Accessibility Guidelines 2.2, criterion 2.5.7) and with the keyboard (criterion 2.1.1). The example of a list with rearrangeable options of the ARIA Authoring Practices Guide moves an option up with Alt and the Up arrow key and down with Alt and the Down arrow key, and states the shortcuts in `aria-keyshortcuts` ([Listbox with Rearrangeable Options, supplemental information](https://accessibility.hhs.texas.gov/acidtests/aria/info/listbox_rearrangeable_options.htm), a copy of the example; the page of the guide itself was not opened). |
| Function used | The drag and drop of the browser (`draggable`, `dragover`, `drop`) on the row of a layer; the commands Move up, Move down, Move to top and Move to bottom of the menu of the layer; Alt with the Up or Down arrow key on the name of the layer, which states its shortcuts in `aria-keyshortcuts`. After a move a line of text with the role `status` states the new place of the layer. |
| Limits | The drag and drop of the browser does not start from a touch on every touch screen; there the menu commands move the layer. Background maps cannot be moved. |
| Read on | 14 Nov 2026 |

## Menu of a layer

| | |
|---|---|
| ArcGIS Pro | The commands of a layer are on the menu that a right-click on its name opens ([Layers](https://doc.esri.com/en/arcgis-pro/latest/help/mapping/layer-properties/layers.html)). |
| QGIS | The context menu of a raster layer holds, among others, Zoom to Layer(s), Rename Layer (F2), Remove Layer (Ctrl+D), and Copy Style and Paste Style ([General Tools, Layers panel](https://docs.qgis.org/3.40/en/docs/user_manual/introduction/general_tools.html)). |
| Standard | A menu button carries `aria-haspopup` and `aria-expanded`. Enter, Space and the Down arrow key open the menu and move the focus to its first command, and the Up arrow key to its last. In the menu the arrow keys move between the commands, Home and End reach the ends, and Escape closes the menu and returns the focus to the button ([WAI-ARIA Authoring Practices 1.2, Menu Button and Menu](https://www.w3.org/TR/2021/NOTE-wai-aria-practices-1.2-20211129/), [Navigation Menu Button Example](https://www.w3.org/TR/2021/NOTE-wai-aria-practices-1.2-20211129/examples/menu-button/menu-button-links.html)). |
| Function used | The component `Menu` in `web/src/contents/`, opened by the button at the end of the row of a layer and by a right-click on the row. The design system has no menu component. |
| Choices of Lynkeus | A command that cannot run at present (Move up for the top layer) stays in the menu, can take the focus and is marked `aria-disabled`. A letter key moves to the next command that starts with it. The Delete key on the name of a layer removes the layer. The menu has a border and no shadow. |
| Limits | The menu has no submenus. The key combination that opens a context menu (Shift+F10 or the menu key) reaches the menu only in browsers that send a `contextmenu` event for it. |
| Read on | 14 Nov 2026 |

## Opacity

| | |
|---|---|
| ArcGIS Pro | Not read: the page of the transparency slider of the ribbon was not opened. |
| QGIS | Not read. |
| Function used | The range input of the browser, from 0 to 100 percent in steps of 1, with its value written beside it; `setOpacity` of the OpenLayers layer. |
| Limits | The opacity applies to the whole layer. |
| Read on | 14 Nov 2026 |

## Legend

| | |
|---|---|
| ArcGIS Pro | A stretched raster layer has a label for the lowest and for the highest value of its colour scale in the Contents pane (`minLabel`, `maxLabel` of the [RasterStretchColorizer](https://pro.arcgis.com/en/pro-app/latest/arcpy/mapping/rasterstretchcolorizer-class.htm)). |
| QGIS | Not read. |
| Function used | The component `Legend`: the quantity and the unit of the layer description, the colour scale as an upright bar with the highest value at its top, the lowest and the highest value of the range, and round values between them. A scale of classes is listed as one colour beside each whole number. |
| Choices of Lynkeus | The values between the ends are the multiples of a step of 1, 2 or 5 times a power of ten that divides the range into at most five parts; a value closer to an end than 12 percent of the range is left out, so that two labels do not overlap. Numbers are written with three significant digits. The unit `1` of the CF conventions is not written, and a power after a unit is written raised (m³ m⁻³). At most ten classes are listed. These rules come from no source. |
| Limits | The legend has no histogram and no title of its own. |
| Read on | 14 Nov 2026 |

## Display of a NISAR layer

| | |
|---|---|
| ArcGIS Pro | A raster with one band is drawn with the Stretch symbology: the values between a lowest and a highest value are spread along a colour scheme. The stretch types are None, Minimum Maximum, Percent Clip, Standard Deviation, Histogram Equalize, Custom and Esri; the colour scheme can be inverted; a colour or no colour is set for the cells without data ([Change the symbology of imagery](https://pro.arcgis.com/en/pro-app/3.1/help/data/imagery/symbology-pane.htm), [Imagery appearance](https://pro.arcgis.com/en/pro-app/latest/help/data/imagery/raster-display-ribbon.htm), [Raster data display decisions](https://pro.arcgis.com/en/pro-app/latest/help/data/imagery/raster-data-display-decisions.htm)). |
| QGIS | The renderer Singleband pseudocolor spreads a colour ramp between a Min and a Max value. The values come from the user, from the cumulative count cut (2 to 98 percent as the standard), from the minimum and maximum, or from the mean and a number of standard deviations ([Raster Properties Dialog](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_raster/raster_properties.html)). |
| OpenLayers | `ol/source/GeoTIFF` reads a Cloud Optimized GeoTIFF with geotiff.js and gives its tiles to `ol/layer/WebGLTile`, whose style is an expression over the bands; with `normalize: false` the bands hold the values of the file, and a band that tells where the file has data is added ([ol/source/GeoTIFF](https://openlayers.org/en/latest/apidoc/module-ol_source_GeoTIFF.html)). The code of OpenLayers 10.11.0 and of geotiff.js 3.1.0-beta.0 was read from the npm packages. |
| Why `ol/source/GeoTIFF` is not used | Read in the code, not seen in a browser: `ol/source/GeoTIFF` of OpenLayers 10.11.0 creates `new Pool()` of geotiff.js for every tile and offers no option for another pool, and `worker/create.js` of geotiff.js 3.1.0-beta.0 starts each worker of that pool from `URL.createObjectURL(new Blob([source]))`, a `blob:` address. The site sends `default-src 'self'` and no `worker-src`. A worker is then checked against `child-src`, `script-src` and at last `default-src` ([MDN, Content-Security-Policy: worker-src](https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy/worker-src)), and `'self'` does not include `blob:` addresses. No console message of a browser was recorded for this, because the browser checks on private copies were stopped before the first one was run. The second reason holds without a browser: the style expressions of OpenLayers have no logarithm (list of operators in `ol/expr/expression.js`), so the decibels of a power cannot be computed while drawing. |
| Function used | `CogSource` in `web/src/contents/`, a source of the class `ol/source/DataTile` of OpenLayers that follows the method of `ol/source/GeoTIFF`: the tile grid has one level for the full resolution and one for each reduced copy (overview) of the file, with the tile size of the file, and a tile is read with `readRasters` of geotiff.js by HTTP range requests. The tiles are decompressed in workers that are files of the site (`decodeWorker.ts`). When such a worker cannot start, the page decompresses the tiles itself. The layer is an `ol/layer/WebGLTile`; OpenLayers moves the tiles from the projection of the file to the projection of the map. The style looks up the colour of a value in a palette of the 256 colours of the scale (operator `palette`), between two style variables for the range, so a change of the range does not build the style again. |
| Choices of Lynkeus | The values are not interpolated: the map shows the cells of the file, and the value read at a point is the value of a cell. A cell that holds NaN or the no-data value of the file is transparent, or has the colour chosen in the Symbology pane. A value below the range receives the first colour and a value above it the last one. The map keeps at most 48 tiles of a layer; at most four workers decompress tiles. These two numbers come from no source. |
| Limits | A file must have one band, a projection named by an EPSG code that Lynkeus holds (next part), and a grid that is not rotated. At a small scale the map shows the reduced copies of the file, so a value read there is the mean of the cells that the copy averaged. The reduced copies inside the GCOV files of NASA Harmony hold some negative values, which the full resolution does not; such a value is drawn with the first colour of the scale. The page loads geotiff.js twice: once in the page and once in the worker file. |
| Read on | 14 Nov 2026 |

## Projections

| | |
|---|---|
| Function used | OpenLayers 10.11.0 holds Web Mercator, geographic coordinates and every zone of the Universal Transverse Mercator projection (`ol/proj/utm`). For the EASE-Grid 2.0 of the soil moisture product (EPSG:6933) and for the two polar stereographic projections (EPSG:3413, EPSG:3031) Lynkeus adds PROJ4JS 2.23.0 (MIT), which OpenLayers supports through `ol/proj/proj4`. The three definitions were read from the EPSG registry through PROJ 9.8.1 (pyproj 3.7.2). |
| Limits | A file in another projection is refused with one sentence. That NISAR products of the polar regions use EPSG:3413 and EPSG:3031 was not read in the product specifications on 14 Nov 2026. |
| Read on | 14 Nov 2026 |

## Colour scales

| | |
|---|---|
| Publications | A colour scale should be perceptually uniform, so that equal steps of the value look equal, and readable with a colour-vision deficiency; rainbow scales such as jet are neither. batlow is such a scale ([Crameri, Shephard and Heron 2020, The misuse of colour in science communication, Nature Communications 11, 5444](https://doi.org/10.1038/s41467-020-19160-7)). A scale is chosen by the kind of the data: sequential, diverging around a reference value, or cyclic for a phase ([Thyng and others 2016, True colors of oceanography, Oceanography 29(3)](https://doi.org/10.5670/oceanog.2016.66); [cmocean](https://matplotlib.org/cmocean/)). |
| Radar programs | The names that the server of Lynkeus gives are `grey` for backscatter and coherence, `RdBu` for the unwrapped phase, `tab10` for the connected components and `YlGnBu` for soil moisture (`harmony.py` of the server, read on 14 Nov 2026). What the Alaska Satellite Facility, the NISAR project and SNAP show for each quantity was not read. |
| Function used | Fourteen scales, each a table of 256 colours (ten for `tab10`) in `colourTables.ts`. Sequential: `grey`, `viridis`, `batlow`, `magma`, `inferno`, `plasma`, `YlGnBu`. Diverging: `RdBu`, `vik`, `balance`, `BrBG`. Cyclic: `phase`, `romaO`. Classes: `tab10`. |
| Sources and licences of the tables | viridis, magma, inferno and plasma: N. Smith, S. van der Walt and E. Firing, released under CC0 1.0 ([colormaps.py](https://github.com/bids/colormap/blob/master/colormaps.py)), read from matplotlib 3.11.2. YlGnBu, RdBu and BrBG: ColorBrewer 2.0 of C. Brewer, under the Apache License 2.0, with the colours between the published classes as matplotlib 3.11.2 computes them (`_cm.py` of matplotlib names the licence). batlow, vik and romaO: the Scientific colour maps of F. Crameri, under the MIT License, read from cmcrameri 1.10 (licence text of the package). balance and phase: cmocean 4.0.3, under the MIT License (licence text of the package). tab10: matplotlib 3.11.2, whose source names the categorical palettes of Vega as its origin. |
| Choices of Lynkeus | A name that Lynkeus does not hold is drawn with the grey scale, and the legend says so. The scale cividis was left out because its licence was not confirmed. |
| Limits | The licence under which the colours of `tab10` may be copied is the licence of matplotlib; the licence of the palette at its origin was not read. |
| Read on | 14 Nov 2026 |

## Decibels

| | |
|---|---|
| Radar programs | The backscatter of a radiometrically terrain-corrected product is delivered as power. Power suits statistics and is dark on a screen; the decibel scale, ten times the logarithm to the base ten of the power, brightens the dark cells, and images converted to decibels are generally preferred for viewing ([ASF, Sentinel-1 RTC Product Guide](https://hyp3-docs.asf.alaska.edu/guides/rtc_product_guide/); [ASF, Introduction to SAR](https://hyp3-docs.asf.alaska.edu/guides/introduction_to_sar/); [ASF, View RTC images in ArcGIS](https://asf.alaska.edu/how-to/data-recipes/how-to-view-radiometrically-terrain-corrected-rtc-images-in-arcgis)). The GCOV product gives the same formula (field `outputBackscatterDecibelConversionFormula`, recorded with the sample files). |
| Choices of Lynkeus | A layer whose description gives the unit `1` and names its quantity a linear power is drawn in decibels: the colours are spread evenly between the decibels of the two ends of its range. The legend states "Shown in decibels (dB)" and writes decibels beside the scale. The display of a layer can turn this off. The values of the layer stay linear: the value read at a point, the range kept for the layer and the file are not changed. A range that starts at zero or below is drawn on the linear scale. |
| Limits | A value of zero or below has no decibels and receives the first colour of the scale. |
| Read on | 14 Nov 2026 |

## Symbology

| | |
|---|---|
| ArcGIS Pro | The Symbology pane of a raster layer sets the colour scheme, the stretch type (among them Minimum Maximum, Percent Clip and Standard Deviation), the inversion of the colour scheme and the colour of the cells without data, and shows the histogram of the values with the limits of the stretch ([Change the symbology of imagery](https://pro.arcgis.com/en/pro-app/3.1/help/data/imagery/symbology-pane.htm)). Percent Clip cuts off a percent of the highest and lowest values; Standard Deviation stretches between the values that a number of standard deviations defines ([Imagery appearance](https://pro.arcgis.com/en/pro-app/latest/help/data/imagery/raster-display-ribbon.htm)). |
| QGIS | Min and Max come from the user, from the cumulative count cut, whose standard range is 2 to 98 percent, from the minimum and maximum, or from the mean and a number of standard deviations ([Raster Properties Dialog](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_raster/raster_properties.html)). |
| Function used | The shared `ToolPane`, named Symbology, with the button Apply, opened by the command Symbology of the menu of a layer. The statistics are those that the file states (the tags `STATISTICS_MINIMUM`, `STATISTICS_MAXIMUM`, `STATISTICS_MEAN` and `STATISTICS_STDDEV` of GDAL, which the files of Lynkeus carry) or, without them, those of the most reduced copy of the file. The histogram and the percentiles are computed in the browser from the most reduced copy of the file. The pane states which of the two it shows. |
| Choices of Lynkeus | The percent clip starts at 2 percent at each end and the standard deviations at 2. The range of a number of standard deviations stays inside the lowest and the highest value. A percentile follows a straight line between two values, as the percentile of NumPy does. For a layer shown in decibels the range and the mask are typed in decibels, and the statistics are those of the decibels of the reduced copy. The histogram has 48 classes. The mask hides the cells whose value lies outside a range. These come from no source, except the 2 percent, which is the standard of QGIS. |
| Limits | The percentiles of a reduced copy differ from those of all the cells, because a reduced copy holds averages. The record of a layer (STAC Item) is not read. The pane has no histogram equalisation, no gamma and no stretch to the values in the current view. The mask does not hide the cells outside the drawn area. |
| Read on | 14 Nov 2026 |

## Properties, Rename and Copy display

| | |
|---|---|
| QGIS | The context menu of a raster layer holds Rename Layer (F2), and Copy Style and Paste Style, which carry the style of one layer to another ([General Tools, Layers panel](https://docs.qgis.org/3.40/en/docs/user_manual/introduction/general_tools.html)). |
| ArcGIS Pro | Not read for these three functions. |
| Function used | Properties: the shared `Dialog`, with the fields of the layer description, the projection and the grid read from the header of the file, and the addresses of the file and of the record as links. Rename: a text field in place of the name, opened by the command Rename or the F2 key; Enter takes the name and Escape keeps the old one. Copy display and Paste display: the range, the colour scale and the other choices of the Symbology pane pass from one layer to another, which keeps its own visibility and opacity. |
| Limits | A new name lasts while the page is open: the description on the server keeps the first name. The Properties window gives no citation, because neither the description of a layer nor the header of its file holds the identifier (DOI) of the dataset. |
| Read on | 14 Nov 2026 |

## What was tried

No function of this part was tried in a browser. The checks below ran in Node.js 22, where the page has no WebGL:
the reading of the files, the tile grid, the values, the style expression and the panes were run, and the
drawing itself was not.

**Tests of the repository.** 124 tests in 17 files of `web/src/contents/`. They read the two small files of
`testdata/`, which were cut from the sample files of the pilot area, and compare the extent, the cell size, the
values, the percentiles and the statistics with the numbers that rasterio 1.4.4 and NumPy give for the same files. The
tests of the projections compare points with PROJ 9.8.1. The tests of the drawing create the WebGL tile layers
of OpenLayers, which turns the style expression into the text of a shader; the shader is not compiled.

**Check on the sample files.** A test that is not part of the repository served the three sample files of the
pilot area and one soil moisture file of NASA Harmony over HTTP with range requests, from a server inside the
test, and read them with `CogSource` (14 Nov 2026). The reference numbers were read from the same files with
rasterio 1.4.4 and GDAL 3.10.3.

| File | Projection | Extent against rasterio | Five cells against rasterio | Levels (cell size in metres) |
|---|---|---|---|---|
| `gcov-hhhh-20261021.tif` | EPSG:32619 | equal | equal | 10, 20, 40, 80.0849 by 80.0806 |
| `gcov-hhhh-20261102.tif` | EPSG:32619 | equal | equal | 10, 20, 40, 80.0849 by 80.0806 |
| `gunw-coherence-20261009-20261021.tif` | EPSG:32619 | equal | equal | 20, 40 by 40.0202, 80.0849 by 80.0403 |
| `sme2-soilmoisture-20261009.tif` | EPSG:6933 | equal | equal | 200.179 |

"Equal" means that every number was the same number: the four corners of the extent, and the value of each of
the five cells as a 32-bit number. The first cell of each of the three radar files holds NaN and was read as a
cell without data. The soil moisture file states the no-data value -9999 and has one tile that is larger than
its grid of 216 by 164 cells; it was read without an error.

The same check counted the requests of a map view of 1152 by 760 pixels at the centre of each file. geotiff.js
asks for blocks of 65,536 bytes, so each count of bytes is a whole number of blocks.

| File | View | Level read | Tiles | Requests | Bytes |
|---|---|---|---|---|---|
| each file | header | | | 1 | 65,536 |
| GCOV, 21 Oct 2026 | whole layer | 40 m | 4 | 4 | 4,259,840 |
| GCOV, 21 Oct 2026 | 10 m for each pixel | 10 m | 6 | 6 | 5,701,632 |
| GCOV, 2 Nov 2026 | whole layer | 40 m | 4 | 4 | 4,259,840 |
| GCOV, 2 Nov 2026 | 10 m for each pixel | 10 m | 6 | 6 | 5,767,168 |
| coherence | whole layer | 40 m | 4 | 1 | 3,932,160 |
| coherence | 10 m for each pixel | 20 m | 4 | 2 | 2,359,296 |
| soil moisture | whole layer | 200 m | 1 | 0 | 0 |

A view at 40 m for each pixel after the view of the whole layer made no request, because the tiles were held.
The one tile of the soil moisture file lay inside the bytes of the header request. A tile of 512 by 512 cells of
32 bits is 1,048,576 bytes before compression, and the sample files, which are compressed with LZW and no
predictor, send about that much for each tile. The file of 21 Oct 2026 written again by GDAL 3.10.3 as Lynkeus
writes its files (DEFLATE with the floating-point predictor) has 52,940,345 bytes in place of 73,182,224, which
is 72 percent. The times of this check are not given, because it ran in Node.js on a machine that ran other
work, not in a browser.

## Not confirmed

- The drawing in a browser: that the WebGL layer shows the colours of the scale, that the layer lies at its
  place on the background map, and that the decibels, the mask and the colour of the cells without data look as
  the style states. The place of a layer rests on the extent and the projections, which the tests compare with
  rasterio and PROJ.
- The content security policy: that the worker file of the site starts under `default-src 'self'`, and that the
  workers of geotiff.js would be refused. Both were read in the code and in the documentation only.
- The number of requests, the time to the first display and the memory of a page with three layers in a browser.
- Drag and drop with a mouse and with a touch screen, the focus lines, the size of the targets, the contrast of
  the texts and the layout at a width of 390 pixels.
- The size of the tiles of a file that the server of Lynkeus wrote from a product of full size.
