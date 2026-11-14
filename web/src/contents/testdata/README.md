# Test files

Two small Cloud Optimized GeoTIFFs, cut from the sample files of the pilot area (lower Merrimack River,
Massachusetts) with rasterio 1.4.4 and GDAL 3.10.3. Each has 128 columns and 96 rows, tiles of 64 cells and one
reduced copy made by averaging. Each JSON file holds the bytes of one GeoTIFF in base64, because the tests read
their data through the bundler, which reads JSON. `base64 -d` writes the GeoTIFF back.

| File               | Cut from                                                                 | Window (row, column of the upper left cell) | Written as                                                                                          |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `backscatter.json` | `gcov-hhhh-20261021.tif` (GCOV, HHHH, 21 Oct 2026, 10 m)                 | 0, 256                                      | NASA Harmony writes its files: LZW                                                                  |
| `coherence.json`   | `gunw-coherence-20261009-20261021.tif` (GUNW, coherence magnitude, 20 m) | 900, 900                                    | Lynkeus writes its files: DEFLATE with the floating-point predictor, and the statistics of the band |

The values that the tests expect were read from the two GeoTIFFs with rasterio.

Data: NASA/JPL/NISAR, distributed by the NASA Alaska Satellite Facility DAAC (GCOV: https://doi.org/10.5067/NIL2GCOV-V1;
GUNW: https://doi.org/10.5067/NIL2GUNW-V1).
