// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { Source } from "../shared/sources";

/**
 * The methods, programs and datasets that the Analysis and Help tabs use. The entries are those of part 6 of
 * `docs/research/analysis.md` and, for the tools Coherence, Change and Soil moisture, One date and Change, the
 * references, the source programs and the data of part 6 of `docs/research/analysis-coherence-change.md` and of
 * `docs/research/analysis-soil-moisture.md`, and for Surface displacement, One pair those of part 6 of
 * `docs/research/analysis-displacement.md`. The Series tools add the notebooks and the uses of part 6 of
 * `docs/research/analysis-series.md`, Surface displacement, Series the articles and the uses of part 6 of
 * `docs/research/analysis-displacement-series.md`, and the retrieval quality flag and Soil moisture, Series those
 * of part 6 of
 * `docs/research/analysis-soil-moisture.md`. NumPy, Rasterio and harmony-py stand in the list of the Data part,
 * which the page Sources shows beside this one, because a name stands in the lists once.
 */
export const SOURCES: readonly Source[] = [
  {
    name: "NASA SDS Product Specification, Level-2 Geocoded Polarimetric Covariance (L2 GCOV), JPL D-102274",
    version: "Rev F, version 1.5.0, 8 July 2026",
    licence: "Copyright 2024 California Institute of Technology. Government sponsorship acknowledged",
    url: "https://nisar-docs.asf.alaska.edu/product-specification/",
    use: "The layers of a GCOV product, their units, the mask and the field of the conversion to decibels, for the backscatter tools.",
  },
  {
    name: "NASA SDS Product Specification, Level-2 Geocoded Unwrapped Interferogram (L2 GUNW), JPL D-102272",
    version: "Rev E, version 1.2.1, 8 November 2024",
    licence: "Copyright 2024 California Institute of Technology. Government sponsorship acknowledged",
    url: "https://nisar-docs.asf.alaska.edu/product-specification/",
    use: "The layers coherenceMagnitude of a GUNW product, for the coherence tools One pair, Change and Series. The layers unwrappedPhase and connectedComponents and the field centerFrequency, for Surface displacement, One pair and Series.",
  },
  {
    name: "NASA SDS Product Specification, Level-3 Soil Moisture (L3 SME2), JPL D-107677",
    version: "Rev C, version 1.0.0, 8 November 2024",
    licence: "Copyright 2024 California Institute of Technology. Government sponsorship acknowledged",
    url: "https://nisar-docs.asf.alaska.edu/product-specification/",
    use: "The layers soilMoisture and retrievalQualityFlag of an SME2 product, their units, their grid and the meaning of the lowest bit of the flag, for the three soil moisture tools.",
  },
  {
    name: "NISAR L3 Soil Moisture Data Product, Algorithm Theoretical Basis Document (ATBD), JPL D-107679",
    version: "Release 3.3, 28 April 2023",
    licence:
      "Cleared for unlimited release (CL#23-2417, page 3 of the document); no licence is stated on its first five pages",
    url: "https://nisar-docs.asf.alaska.edu/atbd/",
    use: "The retrieval algorithms of the soil moisture, its quality flags, the conditions that set the lowest bit of the retrieval quality flag, and the accuracy goal of the mission.",
  },
  {
    name: "NISAR product specification files nisar_L2_GCOV.xml and nisar_L2_GUNW.xml",
    version: "1.6.0, in nisarqa at commit a8bc425",
    licence: "BSD-3-Clause OR Apache-2.0",
    url: "https://github.com/isce-framework/nisarqa/tree/a8bc425f5e8873174471d6a12fe622df338623d1/src/nisarqa/product_specs/1.6.0",
    use: "The layers of the products of the pilot area, which follow version 1.6.0 of the specifications.",
  },
  {
    name: "Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255",
    version: "Rev C, 19 October 2025",
    licence: "All rights reserved (section 1.5 of the document)",
    url: "https://nisar-docs.asf.alaska.edu/naming-conventions/",
    use: "The fields of the name of a product file from which the tools and their forms read the instrument, the product type, the track, the direction, the frame and, for a pair of dates, the bandwidth mode, and the release of the processing software, which the Series tools compare.",
  },
  {
    name: "NISAR L1 and L2 Algorithm Theoretical Basis Document, JPL D-95677",
    version: "Rev A, 12 November 2023",
    licence: "Document of NASA/JPL",
    url: "https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-95677_NASA_L1_L2_ATBD_20231112_R3.4_w-sigs.pdf",
    use: "The relation of the unwrapped phase to the distance to the radar, what the phase is relative to, and the meaning of the connected components, for Surface displacement, One pair.",
  },
  {
    name: "NISAR Solid Earth Team (2022), Algorithms to Validate NISAR L2 Coseismic, Transient and Secular Displacement Requirements",
    version: "Revision A, 25 May 2022",
    licence: "All rights reserved (first page of the document)",
    url: "https://gitlab.com/nisar-science-algorithms/solid-earth/ATBD/-/blob/main/docs/SES_ATBD.pdf",
    use: "The displacements of one pair are compared as differences between points, for how to read Surface displacement, One pair.",
  },
  {
    name: "ASF NISAR Cookbook",
    version: "Commit 17b69c8, 3 November 2026",
    licence: "Apache-2.0",
    url: "https://github.com/ASFOpenSARlab/NISAR_Cookbook",
    use: "Source program of Backscatter, One date and of Backscatter, Change (notebook NISAR_GCOV_SARChangeDetectionMethods.ipynb), and their legends. Source program of the three Series tools (notebooks NISAR_GCOV_Time_Series_Example.ipynb and NISAR_Pixel_Conversion.ipynb); for Soil moisture, Series their statements are applied to the soil moisture, as the Cookbook has no notebook of SME2 products.",
  },
  {
    name: "ISCE3",
    version: "0.25.21",
    licence: "Apache-2.0",
    url: "https://github.com/isce-framework/isce3",
    use: "The program of the mission that computes the layer coherenceMagnitude, and the formula of the coherence. The order of the two dates in the phase and the wavelength of a product, for the sign and the formula of Surface displacement, One pair.",
  },
  {
    name: "MintPy",
    version: "1.6.4",
    licence: "GPL-3.0-or-later",
    url: "https://github.com/insarlab/MintPy",
    use: "Source program of Surface displacement, One pair (function scale_data2disp_unit) and of Surface displacement, Series (generate_mask, reference_point and ifgram_inversion). It was run for the comparison only, and Lynkeus holds none of its code.",
  },
  {
    name: "nisarqa",
    version: "Commit a8bc425, 30 September 2026",
    licence: "BSD-3-Clause OR Apache-2.0",
    url: "https://github.com/isce-framework/nisarqa",
    use: "The legends of the backscatter in decibels and of the coherence.",
  },
  {
    name: "GDAL",
    version: "3.12.2",
    licence: "MIT style licence (file LICENSE.TXT at the tag v3.12.2)",
    url: "https://github.com/OSGeo/gdal",
    use: "Source program of the comparison of Coherence, Change and of Soil moisture, One date and Change, with the rule of the retrieval quality flag (program gdal raster calc). The tools do not use it.",
  },
  {
    name: "Rignot and van Zyl (1993), Change detection techniques for ERS-1 SAR data",
    licence: "IEEE licence for its publications, named in the Crossref record of the article",
    url: "https://doi.org/10.1109/36.239913",
    use: "Method of Backscatter, Change.",
  },
  {
    name: "Shiroma, Lavalle and Buckley (2022), An Area-Based Projection Algorithm for SAR Radiometric Terrain Correction and Geocoding",
    licence: "IEEE licence for its publications, named in the Crossref record of the article",
    url: "https://doi.org/10.1109/TGRS.2022.3147472",
    use: "The terrain correction and the geocoding of a GCOV product.",
  },
  {
    name: "Touzi, Lopes, Bruniquel and Vachon (1999), Coherence estimation for SAR imagery",
    licence: "IEEE licence for its publications, named in the Crossref record of the article",
    url: "https://doi.org/10.1109/36.739146",
    use: "How to read the coherence, why Coherence, Change compares layers of one spacing, and the bias of the mean coherence of an area.",
  },
  {
    name: "Zebker and Villasenor (1992), Decorrelation in interferometric radar echoes",
    licence: "IEEE licence for its publications, named in the Crossref record of the article",
    url: "https://doi.org/10.1109/36.175330",
    use: "How to read the coherence.",
  },
  {
    name: "Fielding et al. (2005), Surface ruptures and building damage of the 2003 Bam, Iran, earthquake mapped by satellite synthetic aperture radar interferometric correlation",
    licence: "Terms and conditions of Wiley Online Library, named in the Crossref record of the article",
    url: "https://doi.org/10.1029/2004JB003299",
    use: "Method of Coherence, Change. Its abstract was read.",
  },
  {
    name: "Stephenson et al. (2022), Deep Learning-Based Damage Mapping With InSAR Coherence Time Series",
    licence: "IEEE licence for its publications, named in the Crossref record of the article",
    url: "https://doi.org/10.1109/TGRS.2021.3084209",
    use: "Method of Coherence, Change, and the effect of the time between the two dates of a pair. It was read as the accepted manuscript, arXiv:2105.11544.",
  },
  {
    name: "Plank (2014), Rapid Damage Assessment by Means of Multi-Temporal SAR — A Comprehensive Review and Outlook to Sentinel-1",
    licence: "CC-BY-3.0",
    url: "https://doi.org/10.3390/rs6064870",
    use: "Which two pairs of dates Coherence, Change compares.",
  },
  {
    name: "Singh (1989), Digital change detection techniques using remotely-sensed data",
    licence: "No licence is named in the Crossref record of the article (publisher Informa UK Limited)",
    url: "https://doi.org/10.1080/01431168908903939",
    use: "Method of Soil moisture, Change: the difference of the images of two dates. Its section 4.1 was read.",
  },
  {
    name: "Crameri, Shephard and Heron (2020), The misuse of colour in science communication",
    licence: "CC-BY-4.0",
    url: "https://doi.org/10.1038/s41467-020-19160-7",
    use: "The research on colour scales and colour-blind readers.",
  },
  {
    name: "Berardino, Fornaro, Lanari and Sansosti (2002), A new algorithm for surface deformation monitoring based on small baseline differential SAR interferograms",
    licence: "No licence is named in the Crossref record of the article (publisher IEEE)",
    url: "https://doi.org/10.1109/TGRS.2002.803792",
    use: "The method of Surface displacement, Series: the small-baseline inversion with the minimum-norm velocity, as MintPy computes it. The article was not read in full.",
  },
  {
    name: "Yunjun, Fattahi and Amelung (2019), Small baseline InSAR time series analysis: Unwrapping error correction and noise reduction",
    licence: "Elsevier licence for text and data mining, named in the Crossref record of the article",
    url: "https://doi.org/10.1016/j.cageo.2019.104331",
    use: "The article of MintPy, and the guideline for the reference point of Surface displacement, Series, as the template of MintPy cites it. The article was not read in full.",
  },
  {
    name: "NISAR Validated Geocoded Polarimetric Covariance Product (Version 1)",
    version: "Collection NISAR_L2_GCOV_V1",
    licence: "NASA ESDIS Data Use and Citation Guidance; free and open data",
    url: "https://doi.org/10.5067/NIL2GCOV-V1",
    use: "The two GCOV products of the pilot area on which the two backscatter tools were measured and compared.",
  },
  {
    name: "NISAR Validated Geocoded Unwrapped Interferogram Product (Version 1)",
    version: "Collection NISAR_L2_GUNW_V1",
    licence: "NASA ESDIS Data Use and Citation Guidance; free and open data",
    url: "https://doi.org/10.5067/NIL2GUNW-V1",
    use: "The GUNW product of the pilot area on which Coherence, One pair was measured and compared, and one of the five products of the comparison of Coherence, Change. It is also one of the two products on which Surface displacement, One pair was measured and compared, and the last pair of the comparison of Surface displacement, Series.",
  },
  {
    name: "NISAR Provisional Geocoded Unwrapped Interferogram Product (Version 1)",
    version: "Collection NISAR_L2_GUNW_PROVISIONAL_V1",
    licence: "NASA ESDIS Data Use and Citation Guidance; free and open data",
    url: "https://doi.org/10.5067/NIL2GUNW-P1",
    use: "Four of the five GUNW products of the pilot area on which Coherence, Change was measured and compared, and the second product on which Surface displacement, One pair was. Eight of the nine pairs on which Surface displacement, Series was compared.",
  },
  {
    name: "NISAR Provisional Soil Moisture (Version 1)",
    version: "Collection NISAR_L3_SME2_PROVISIONAL_V1",
    licence: "NASA ESDIS Data Use and Citation Guidance; free and open data",
    url: "https://doi.org/10.5067/NIL3SME2-P1",
    use: "The SME2 products of the pilot area on which the three soil moisture tools were measured and compared.",
  },
  {
    name: "NISAR Beta Soil Moisture (Version 1)",
    version: "Collection NISAR_L3_SME2_BETA_V1",
    licence: "NASA ESDIS Data Use and Citation Guidance; free and open data",
    url: "https://doi.org/10.5067/NIL3SME2-B1",
    use: "The two SME2 products of the pilot area of December 2025, of the release X05010, on which the three soil moisture tools were measured and compared apart from the provisional ones.",
  },
  {
    name: "Environment of the source program in the comparison: numpy, xarray, dask, rioxarray and rasterio",
    version: "2.5.3, 2026.7.0, 2025.12.0, 0.22.0 and 1.4.4",
    licence:
      "As the packages state on PyPI: BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0; Apache-2.0; BSD-3-Clause; Apache; BSD",
    url: "https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/pixi.lock",
    use: "The versions of the lock file of the Cookbook with which the source program was run for the comparison. Lynkeus does not use them.",
  },
  {
    name: "Matplotlib",
    version: "3.11.2",
    licence: "License agreement for matplotlib versions 1.3.0 and later",
    url: "https://matplotlib.org",
    use: "The order of the colours of the scale RdBu and the documentation of colour maps, in the research. The tools do not use it.",
  },
];
