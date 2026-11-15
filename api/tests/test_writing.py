"""Tests of the files of a layer.

The files in ``tests/data/layers`` come from the GeoTIFFs that NASA Harmony
delivered on 14 November 2026 for the box -71.20, 42.60, -70.75, 42.95
(NISAR track 141, frame 67). Their values, types, no-data values, projections
and tags are those of Harmony.

- ``gcov-hhhh-20261021.tif``: 600 by 560 cells of the backscatter HH of
  21 October 2026 (columns 152 to 751, rows 2424 to 2983 of the file).
- ``gcov-hhhh-20261021-harmony-overview.tif``: the same window of the reduced
  copy (factor 2) that Harmony stored in that file.
- ``gcov-hhhh-20261021-small.tif`` and ``gcov-hhhh-20261102-small.tif``: the
  first 128 by 128 cells of that window, on 21 October and 2 November 2026.
- ``gunw-coherence-20261009-20261021.tif``: the first 128 by 128 cells of the
  coherence at 20 m, at a corner where the cells outside the box hold no data.
- ``sme2-soilmoisture-20261009.tif``, ``gunw-unwrappedphase-20261009-20261021.tif``
  and ``gunw-connectedcomponents-20261009-20261021.tif``: whole files as
  delivered, the last two for the box -71.00, 42.75, -70.95, 42.80.
"""

import itertools
import json
import math
from datetime import date, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import rasterio
from numpy.typing import NDArray
from rasterio.crs import CRS
from rasterio.warp import transform
from rio_cogeo.cogeo import cog_validate

from lynkeus import __version__
from lynkeus.layers import LayerDescription
from lynkeus.writing import Grid, LayerError, grid_of, legend_range, read_layer, statistics_of, write_layer
from tests.records import LAYERS, stac_faults

BACKSCATTER = LAYERS / "gcov-hhhh-20261021.tif"
GRANULE = "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5"
SOURCE = "https://cmr.earthdata.nasa.gov/search/concepts/G4405194348-ASF.umm_json"


def as_delivered(path: Path) -> tuple[NDArray[Any], Any]:
    """Read the band and the profile of a file with rasterio alone."""
    with rasterio.open(path) as source:
        return source.read(1), source.profile


def write(folder: Path, values: NDArray[np.float32], grid: Grid, **changes: Any) -> LayerDescription:
    """Write a layer with the fields of the backscatter of 21 October 2026, or with others."""
    fields: dict[str, Any] = {
        "layer_id": "k3v9x2",
        "folder": folder,
        "address": "/files/k3v9x2",
        "name": "gcov-hhhh-20261021",
        "title": "Backscatter HH, 21 Oct 2026",
        "kind": "layer",
        "quantity": "Radar backscatter gamma nought, HH, linear power",
        "unit": "1",
        "legend": "percentiles",
        "colours": "grey",
        "dates": (date(2026, 10, 21),),
        "inputs": (GRANULE,),
        "layer": "HHHH",
        "lineage": "Layer HHHH of the product, clipped by NASA Harmony.",
        "level": "L2",
        "links": ({"rel": "via", "href": SOURCE, "type": "application/json"},),
    }
    return write_layer(values, grid, **{**fields, **changes})


def blocks(values: NDArray[np.float32]) -> NDArray[np.float32]:
    """Arrange an array with even sides as its blocks of two by two cells."""
    rows, columns = values.shape
    return values.reshape(rows // 2, 2, columns // 2, 2).transpose(0, 2, 1, 3).reshape(rows // 2, columns // 2, 4)


def distance(first: list[float], second: list[float]) -> float:
    """Return the distance in metres between two points in degrees, on a sphere of the mean radius of the Earth."""
    (x1, y1), (x2, y2) = (map(math.radians, point) for point in (first, second))
    half = math.sin((y2 - y1) / 2) ** 2 + math.cos(y1) * math.cos(y2) * math.sin((x2 - x1) / 2) ** 2
    return 2 * 6_371_008.8 * math.asin(math.sqrt(half))


def reduced_copy(path: Path) -> NDArray[np.float32]:
    """Read the first reduced copy that a file stores."""
    with rasterio.open(path, overview_level=0) as source:
        copy: NDArray[np.float32] = source.read(1)
    return copy


def test_written_file_is_a_valid_cloud_optimized_geotiff(tmp_path: Path) -> None:
    write(tmp_path, *read_layer(BACKSCATTER))
    valid, errors, warnings = cog_validate(str(tmp_path / "gcov-hhhh-20261021.tif"), strict=True, quiet=True)
    assert valid
    assert errors == []
    assert warnings == []


def test_values_at_full_resolution_are_those_of_harmony_cell_by_cell(tmp_path: Path) -> None:
    write(tmp_path, *read_layer(BACKSCATTER))
    delivered, profile = as_delivered(BACKSCATTER)
    written, written_profile = as_delivered(tmp_path / "gcov-hhhh-20261021.tif")
    assert written.dtype == np.float32
    assert written.shape == (560, 600)
    assert np.array_equal(written, delivered, equal_nan=True)
    assert written_profile["crs"] == profile["crs"]
    assert written_profile["transform"] == profile["transform"]


def test_reduced_copy_is_the_mean_of_the_power_and_is_never_negative(tmp_path: Path) -> None:
    values, grid = read_layer(BACKSCATTER)
    assert values.min() > 0
    # The reduced copy that Harmony stored for the same cells holds negative values.
    delivered, _ = as_delivered(LAYERS / "gcov-hhhh-20261021-harmony-overview.tif")
    assert int((delivered < 0).sum()) == 1073
    assert delivered.min() == pytest.approx(-26.62446)
    write(tmp_path, values, grid)
    with rasterio.open(tmp_path / "gcov-hhhh-20261021.tif") as source:
        assert source.overviews(1) == [2]
    copy = reduced_copy(tmp_path / "gcov-hhhh-20261021.tif")
    assert copy.shape == delivered.shape
    np.testing.assert_allclose(copy, blocks(values).mean(axis=2, dtype=np.float64), rtol=1e-6)
    assert copy.min() >= values.min()
    assert copy.max() <= values.max()


def test_reduced_copy_leaves_out_the_cells_without_data(tmp_path: Path) -> None:
    values, grid = read_layer(BACKSCATTER)
    # The cells without data of the coherence file are removed from the backscatter, at the same corner.
    empty = np.isnan(read_layer(LAYERS / "gunw-coherence-20261009-20261021.tif")[0])
    assert 0 < empty.sum() < empty.size
    values[:128, :128][empty] = np.nan
    write(tmp_path, values, grid)
    copy = reduced_copy(tmp_path / "gcov-hhhh-20261021.tif")
    parts = blocks(values)
    filled = (~np.isnan(parts)).sum(axis=2)
    assert (filled == 0).any()
    assert ((filled > 0) & (filled < 4)).any()
    assert np.array_equal(np.isnan(copy), filled == 0)
    means = np.nansum(parts, axis=2, dtype=np.float64)[filled > 0] / filled[filled > 0]
    np.testing.assert_allclose(copy[filled > 0], means, rtol=1e-6)


def test_reduced_copy_of_classes_takes_the_most_frequent_value(tmp_path: Path) -> None:
    components, grid = read_layer(LAYERS / "gunw-connectedcomponents-20261009-20261021.tif")
    assert set(np.unique(components[~np.isnan(components)])) == {0.0, 1.0}
    # The real layer has 51 by 69 cells. It is repeated so that the file is large enough to hold a reduced copy.
    classes = np.tile(components, (10, 12))
    repeated = Grid(grid.crs, grid.transform, classes.shape[1], classes.shape[0])
    write(tmp_path, classes, repeated, legend="extremes", colours="tab10", averaged=False)
    copy = reduced_copy(tmp_path / "gcov-hhhh-20261021.tif")
    assert set(np.unique(copy[~np.isnan(copy)])) == {0.0, 1.0}
    parts = blocks(classes[:690, :612])
    same = (parts == parts[:, :, :1]).all(axis=2)
    assert same.sum() > 100_000
    assert np.array_equal(copy[same], parts[:, :, 0][same])


def test_file_carries_what_a_gis_program_reads(tmp_path: Path) -> None:
    write(tmp_path, *read_layer(BACKSCATTER))
    delivered, _ = as_delivered(BACKSCATTER)
    with rasterio.open(tmp_path / "gcov-hhhh-20261021.tif") as source:
        assert source.count == 1
        assert source.dtypes == ("float32",)
        assert math.isnan(source.nodata)
        assert source.block_shapes == [(512, 512)]
        assert source.descriptions == ("Radar backscatter gamma nought, HH, linear power",)
        assert source.units == ("1",)
        structure = source.tags(ns="IMAGE_STRUCTURE")
        assert (structure["LAYOUT"], structure["COMPRESSION"], structure["PREDICTOR"]) == ("COG", "DEFLATE", "3")
        tags = source.tags()
        assert tags["TIFFTAG_IMAGEDESCRIPTION"] == "Backscatter HH, 21 Oct 2026"
        assert tags["TIFFTAG_SOFTWARE"] == f"Lynkeus {__version__}"
        assert datetime.strptime(tags["TIFFTAG_DATETIME"], "%Y:%m:%d %H:%M:%S").year >= 2026
        assert (tags["dates"], tags["inputs"]) == ("2026-10-21", GRANULE)
        assert "method" not in tags
        band = source.tags(1)
    assert float(band["STATISTICS_MINIMUM"]) == float(delivered.min())
    assert float(band["STATISTICS_MAXIMUM"]) == float(delivered.max())
    assert float(band["STATISTICS_MEAN"]) == pytest.approx(float(delivered.mean(dtype=np.float64)), rel=1e-12)
    assert float(band["STATISTICS_STDDEV"]) == pytest.approx(float(delivered.std(dtype=np.float64)), rel=1e-12)
    assert float(band["STATISTICS_VALID_PERCENT"]) == 100.0


def test_description_gives_the_addresses_and_a_legend_from_the_data(tmp_path: Path) -> None:
    description = write(tmp_path, *read_layer(BACKSCATTER))
    delivered, _ = as_delivered(BACKSCATTER)
    assert description.id == "k3v9x2"
    assert description.url == "/files/k3v9x2/gcov-hhhh-20261021.tif"
    assert description.record == "/files/k3v9x2/gcov-hhhh-20261021.json"
    assert (description.kind, description.method, description.program) == ("layer", None, f"Lynkeus {__version__}")
    assert description.range == tuple(float(value) for value in np.percentile(delivered, (2, 98)))
    assert description.dates == (date(2026, 10, 21),)
    assert description.inputs == (GRANULE,)
    assert sorted(path.name for path in tmp_path.iterdir()) == ["gcov-hhhh-20261021.json", "gcov-hhhh-20261021.tif"]


def test_result_keeps_its_legend_and_its_method(tmp_path: Path) -> None:
    values, grid = read_layer(BACKSCATTER)
    description = write(
        tmp_path, values, grid, kind="result", legend=(0.0, 2.0), layer=None, method="Reference of the method"
    )
    assert description.range == (0.0, 2.0)
    assert description.method == "Reference of the method"
    with rasterio.open(tmp_path / "gcov-hhhh-20261021.tif") as source:
        assert source.tags()["method"] == "Reference of the method"


def test_result_carries_the_words_of_the_ends_of_its_legend_and_a_layer_carries_none(tmp_path: Path) -> None:
    values, grid = read_layer(BACKSCATTER)
    assert write(tmp_path, values, grid).ends is None
    result = write(tmp_path, values, grid, kind="result", layer=None, method="Reference of the method")
    assert result.ends is None
    result = write(
        tmp_path, values, grid, kind="result", layer=None, method="Reference of the method", ends=("low", "high")
    )
    assert result.ends == ("low", "high")
    with pytest.raises(ValueError, match="only the legend of a result has words for its two ends"):
        write(tmp_path, values, grid, ends=("low", "high"))


def test_layer_carries_its_name_inside_the_product_and_a_result_carries_none(tmp_path: Path) -> None:
    values, grid = read_layer(BACKSCATTER)
    name = "unwrappedInterferogram/HH/coherenceMagnitude"
    assert write(tmp_path, values, grid).layer == "HHHH"
    assert write(tmp_path, values, grid, layer=name).layer == name
    record = json.loads((tmp_path / "gcov-hhhh-20261021.json").read_text(encoding="utf-8"))
    assert record["assets"]["data"]["bands"][0]["name"] == name
    assert stac_faults(record) == []
    result = write(tmp_path, values, grid, kind="result", layer=None, method="Reference of the method")
    assert result.layer is None
    record = json.loads((tmp_path / "gcov-hhhh-20261021.json").read_text(encoding="utf-8"))
    assert "name" not in record["assets"]["data"]["bands"][0]
    assert stac_faults(record) == []
    with pytest.raises(ValueError, match="so it has no name of one"):
        write(tmp_path, values, grid, kind="result", method="Reference of the method")


def test_reduced_copy_of_decibels_is_the_decibels_of_the_mean_power(tmp_path: Path) -> None:
    power, grid = read_layer(BACKSCATTER)
    decibels = (10 * np.log10(power)).astype(np.float32)
    (tmp_path / "power").mkdir()
    (tmp_path / "decibels").mkdir()
    write(tmp_path / "power", power, grid)
    description = write(
        tmp_path / "decibels",
        decibels,
        grid,
        kind="result",
        unit="dB",
        legend=(-20.0, 0.0),
        layer=None,
        method="Reference of the method",
        decibels=True,
    )
    file = tmp_path / "decibels" / "gcov-hhhh-20261021.tif"
    assert sorted(path.name for path in file.parent.iterdir()) == ["gcov-hhhh-20261021.json", "gcov-hhhh-20261021.tif"]
    assert cog_validate(str(file), strict=True, quiet=True) == (True, [], [])
    # The values at full resolution are those given, bit for bit.
    written, profile = as_delivered(file)
    assert written.tobytes() == decibels.tobytes()
    assert np.isnan(profile["nodata"])
    # The reduced copy is the decibels of the reduced copy of the power, and not the mean of the decibels.
    of_power = reduced_copy(tmp_path / "power" / "gcov-hhhh-20261021.tif")
    of_decibels = reduced_copy(file)
    assert of_decibels.shape == of_power.shape == (280, 300)
    np.testing.assert_allclose(of_decibels, 10 * np.log10(of_power), rtol=0, atol=2e-5)
    mean_of_decibels = blocks(decibels).mean(axis=2, dtype=np.float64)
    assert float((of_decibels - mean_of_decibels).min()) > -2e-5
    assert float((of_decibels - mean_of_decibels).mean()) > 0.1
    # The metadata of the file and its record are those of any result.
    with rasterio.open(file) as source:
        assert source.overviews(1) == [2]
        assert source.units == ("dB",)
        assert source.descriptions == ("Radar backscatter gamma nought, HH, linear power",)
        assert source.tags()["method"] == "Reference of the method"
        assert source.tags()["dates"] == "2026-10-21"
        assert float(source.tags(1)["STATISTICS_MINIMUM"]) == float(decibels.min())
        assert source.profile["blockxsize"] == 512
    assert description.unit == "dB"
    record = json.loads((file.parent / "gcov-hhhh-20261021.json").read_text(encoding="utf-8"))
    assert stac_faults(record) == []


def test_cells_without_data_stay_without_data_in_a_reduced_copy_of_decibels(tmp_path: Path) -> None:
    power, grid = read_layer(BACKSCATTER)
    decibels = (10 * np.log10(power)).astype(np.float32)
    decibels[:200, :300] = np.nan
    decibels[300, 301] = np.nan
    write(
        tmp_path, decibels, grid, kind="result", unit="dB", legend=(-20.0, 0.0), layer=None, method="M", decibels=True
    )
    copy = reduced_copy(tmp_path / "gcov-hhhh-20261021.tif")
    assert np.isnan(copy[:100, :150]).all()
    assert not np.isnan(copy[100:, :]).any()
    assert not np.isnan(copy[:, 150:]).any()
    # A block with one cell without data holds the decibels of the mean power of its three other cells.
    three = np.array([power[300, 300], power[301, 300], power[301, 301]], dtype=np.float64)
    assert copy[150, 150] == pytest.approx(10 * np.log10(three.mean()), abs=2e-5)


def test_small_layer_in_decibels_has_no_reduced_copy(tmp_path: Path) -> None:
    power, grid = read_layer(LAYERS / "gcov-hhhh-20261021-small.tif")
    decibels = (10 * np.log10(power)).astype(np.float32)
    write(
        tmp_path, decibels, grid, kind="result", unit="dB", legend=(-20.0, 0.0), layer=None, method="M", decibels=True
    )
    file = tmp_path / "gcov-hhhh-20261021.tif"
    assert sorted(path.name for path in tmp_path.iterdir()) == ["gcov-hhhh-20261021.json", "gcov-hhhh-20261021.tif"]
    assert cog_validate(str(file), strict=True, quiet=True) == (True, [], [])
    written, _ = as_delivered(file)
    assert written.tobytes() == decibels.tobytes()
    with rasterio.open(file) as source:
        assert source.overviews(1) == []


def test_classes_are_not_written_as_decibels(tmp_path: Path) -> None:
    values, grid = read_layer(BACKSCATTER)
    with pytest.raises(ValueError, match="reduced by averaging their power"):
        write(tmp_path, values, grid, averaged=False, decibels=True)
    assert list(tmp_path.iterdir()) == []


def test_record_is_a_valid_stac_item(tmp_path: Path) -> None:
    write(tmp_path, *read_layer(BACKSCATTER))
    record = json.loads((tmp_path / "gcov-hhhh-20261021.json").read_text(encoding="utf-8"))
    assert stac_faults(record) == []
    # The same check finds the faults of a record that is not valid.
    assert stac_faults({**record, "geometry": "none"})
    broken = json.loads(json.dumps(record))
    broken["assets"]["data"]["bands"][0]["nodata"] = "none"
    broken["properties"]["proj:shape"] = [560]
    assert len(stac_faults(broken)) >= 2


def test_record_describes_the_file(tmp_path: Path) -> None:
    values, grid = read_layer(BACKSCATTER)
    write(tmp_path, values, grid)
    record = json.loads((tmp_path / "gcov-hhhh-20261021.json").read_text(encoding="utf-8"))
    assert (record["type"], record["stac_version"], record["id"]) == ("Feature", "1.1.0", "k3v9x2")
    properties = record["properties"]
    assert properties["datetime"] is None
    assert properties["start_datetime"] == "2026-10-21T00:00:00Z"
    assert properties["end_datetime"] == "2026-10-21T23:59:59Z"
    assert datetime.fromisoformat(properties["created"]).tzinfo is not None
    assert properties["proj:code"] == "EPSG:32619"
    assert properties["proj:shape"] == [560, 600]
    assert properties["proj:transform"] == [10.0, 0.0, 321040.0, 0.0, -10.0, 4733370.0]
    assert properties["proj:bbox"] == [321040.0, 4727770.0, 327040.0, 4733370.0]
    assert properties["processing:level"] == "L2"
    assert properties["processing:software"] == {"Lynkeus": __version__, "GDAL": rasterio.__gdal_version__}
    assert record["links"] == [{"rel": "via", "href": SOURCE, "type": "application/json"}]
    asset = record["assets"]["data"]
    assert asset["href"] == "./gcov-hhhh-20261021.tif"
    assert asset["type"] == "image/tiff; application=geotiff; profile=cloud-optimized"
    band = asset["bands"][0]
    assert band["name"] == "HHHH"
    assert (band["data_type"], band["nodata"], band["unit"]) == ("float32", "nan", "1")
    assert band["raster:spatial_resolution"] == 10.0
    assert band["statistics"]["minimum"] == float(values.min())
    assert band["statistics"]["maximum"] == float(values.max())
    assert band["statistics"]["valid_percent"] == 100.0


def test_outline_of_the_record_follows_the_grid(tmp_path: Path) -> None:
    write(tmp_path, *read_layer(BACKSCATTER))
    record = json.loads((tmp_path / "gcov-hhhh-20261021.json").read_text(encoding="utf-8"))
    ring = record["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1]
    assert len(ring) == 33
    # The ring runs anticlockwise, as GeoJSON asks, so twice its signed area is positive.
    assert sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in itertools.pairwise(ring)) > 0
    west, south, east, north = record["bbox"]
    assert (west, south, east, north) == (
        min(x for x, _ in ring),
        min(y for _, y in ring),
        max(x for x, _ in ring),
        max(y for _, y in ring),
    )
    # The corners of the grid, transformed one by one, are points of the ring.
    xs, ys = [321040.0, 327040.0, 327040.0, 321040.0], [4733370.0, 4733370.0, 4727770.0, 4727770.0]
    longitudes, latitudes = transform(CRS.from_epsg(32619), CRS.from_epsg(4326), xs, ys)
    corners = [
        [round(longitude, 7), round(latitude, 7)] for longitude, latitude in zip(longitudes, latitudes, strict=True)
    ]
    assert all(corner in ring for corner in corners)
    # The sides of the window are 6000 and 5600 metres long on the ground.
    assert distance(corners[0], corners[1]) == pytest.approx(6000, rel=0.005)
    assert distance(corners[1], corners[2]) == pytest.approx(5600, rel=0.005)
    # The window lies inside the box of the request to Harmony, -71.20, 42.60, -70.75, 42.95, near its western side.
    assert -71.20 < west < east < -71.10
    assert 42.60 < south < north < 42.95


def test_grid_without_a_code_is_recorded_as_well_known_text(tmp_path: Path) -> None:
    values, grid = read_layer(BACKSCATTER)
    text = CRS.from_proj4("+proj=laea +lat_0=43 +lon_0=-71 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs").to_wkt()
    plain = Grid(text, (10.0, 0.0, -3000.0, 0.0, -10.0, 2800.0), grid.width, grid.height)
    write(tmp_path, values, plain)
    record = json.loads((tmp_path / "gcov-hhhh-20261021.json").read_text(encoding="utf-8"))
    assert record["properties"]["proj:code"] is None
    assert "Lambert Azimuthal Equal Area" in record["properties"]["proj:wkt2"]
    assert stac_faults(record) == []
    west, south, east, north = record["bbox"]
    assert west < -71 < east
    assert south < 43 < north
    assert grid_of(tmp_path / "gcov-hhhh-20261021.tif").transform == plain.transform


def test_grid_in_degrees_records_no_cell_size_in_metres(tmp_path: Path) -> None:
    values, grid = read_layer(BACKSCATTER)
    degrees = Grid("EPSG:4326", (0.0001, 0.0, -71.2, 0.0, -0.0001, 42.75), grid.width, grid.height)
    write(tmp_path, values, degrees)
    record = json.loads((tmp_path / "gcov-hhhh-20261021.json").read_text(encoding="utf-8"))
    assert record["properties"]["proj:code"] == "EPSG:4326"
    assert "raster:spatial_resolution" not in record["assets"]["data"]["bands"][0]
    assert record["bbox"] == pytest.approx([-71.2, 42.694, -71.14, 42.75])
    assert stac_faults(record) == []


def test_layer_of_several_dates_records_its_period(tmp_path: Path) -> None:
    values, grid = read_layer(LAYERS / "gunw-unwrappedphase-20261009-20261021.tif")
    description = write(
        tmp_path,
        values,
        grid,
        legend="symmetric",
        colours="RdBu",
        unit="rad",
        dates=(date(2026, 10, 9), date(2026, 10, 21)),
    )
    record = json.loads((tmp_path / "gcov-hhhh-20261021.json").read_text(encoding="utf-8"))
    assert record["properties"]["start_datetime"] == "2026-10-09T00:00:00Z"
    assert record["properties"]["end_datetime"] == "2026-10-21T23:59:59Z"
    assert record["assets"]["data"]["bands"][0]["raster:spatial_resolution"] == 80.0
    assert record["assets"]["data"]["bands"][0]["statistics"]["valid_percent"] == pytest.approx(100 * 3499 / 3519)
    assert stac_faults(record) == []
    assert description.range[0] == -description.range[1]
    # A file smaller than one tile holds no reduced copy and is still valid.
    assert cog_validate(str(tmp_path / "gcov-hhhh-20261021.tif"), strict=True, quiet=True) == (True, [], [])


def test_legend_follows_its_rule() -> None:
    phase, _ = read_layer(LAYERS / "gunw-unwrappedphase-20261009-20261021.tif")
    valid = phase[~np.isnan(phase)]
    assert valid.size == 3499
    assert legend_range(phase, "percentiles") == tuple(float(value) for value in np.percentile(valid, (2, 98)))
    highest = float(np.percentile(np.abs(valid), 98))
    assert legend_range(phase, "symmetric") == (-highest, highest)
    assert legend_range(phase, "extremes") == (float(valid.min()), float(valid.max()))
    components, _ = read_layer(LAYERS / "gunw-connectedcomponents-20261009-20261021.tif")
    assert legend_range(components, "extremes") == (0.0, 1.0)
    # Nearly all cells belong to component 1, so both percentiles are 1 and the legend takes the extremes.
    assert legend_range(components, "percentiles") == (0.0, 1.0)


def test_legend_of_one_value_has_an_extent() -> None:
    constant = np.full((4, 4), 3.0, dtype=np.float32)
    constant[0, 0] = np.nan
    for rule in ("percentiles", "extremes"):
        assert legend_range(constant, rule) == (2.5, 3.5)
    assert legend_range(np.zeros((4, 4), dtype=np.float32), "symmetric") == (-0.5, 0.5)


def test_statistics_are_those_of_the_cells_with_data() -> None:
    moisture, _ = read_layer(LAYERS / "sme2-soilmoisture-20261009.tif")
    delivered, _ = as_delivered(LAYERS / "sme2-soilmoisture-20261009.tif")
    valid = delivered[delivered != -9999]
    statistics = statistics_of(moisture)
    assert valid.size == 29238
    assert statistics.minimum == float(valid.min()) == pytest.approx(0.08)
    assert statistics.maximum == float(valid.max()) == pytest.approx(0.6)
    assert statistics.mean == pytest.approx(float(valid.mean(dtype=np.float64)), rel=1e-12)
    assert statistics.deviation == pytest.approx(float(valid.std(dtype=np.float64)), rel=1e-12)
    assert statistics.valid == pytest.approx(100 * 29238 / 35424)


def test_statistics_need_data_and_finite_values() -> None:
    with pytest.raises(LayerError, match="holds no data"):
        statistics_of(np.full((3, 3), np.nan, dtype=np.float32))
    with pytest.raises(LayerError, match="infinite"):
        statistics_of(np.array([[1.0, np.inf]], dtype=np.float32))


def test_reading_turns_the_no_data_value_of_the_file_into_nan() -> None:
    moisture, grid = read_layer(LAYERS / "sme2-soilmoisture-20261009.tif")
    assert moisture.dtype == np.float32
    assert int(np.isnan(moisture).sum()) == 35424 - 29238
    assert float(np.nanmin(moisture)) == pytest.approx(0.08)
    assert grid.crs == "EPSG:6933"
    assert (grid.width, grid.height) == (216, 164)
    assert grid.transform[0] == pytest.approx(200.179, abs=1e-3)
    components, grid = read_layer(LAYERS / "gunw-connectedcomponents-20261009-20261021.tif")
    assert components.dtype == np.float32
    assert int(np.isnan(components).sum()) == 3519 - 3499
    assert grid == Grid("EPSG:32619", (80.0, 0.0, 336400.0, 0.0, -80.0, 4740480.0), 51, 69)
    assert grid_of(LAYERS / "gunw-connectedcomponents-20261009-20261021.tif") == grid


def test_written_file_is_read_back_as_it_was_written(tmp_path: Path) -> None:
    values, grid = read_layer(LAYERS / "gunw-coherence-20261009-20261021.tif")
    assert 0 < int(np.isnan(values).sum()) == 128 * 128 - 10079
    write(tmp_path, values, grid, legend=(0.0, 1.0))
    back, back_grid = read_layer(tmp_path / "gcov-hhhh-20261021.tif")
    assert np.array_equal(back, values, equal_nan=True)
    assert back_grid == grid


def test_file_that_is_not_one_band_of_numbers_is_refused(tmp_path: Path) -> None:
    (tmp_path / "text.tif").write_text("not a GeoTIFF", encoding="utf-8")
    with pytest.raises(LayerError, match="could not be read"):
        read_layer(tmp_path / "text.tif")
    with pytest.raises(LayerError, match="could not be read"):
        grid_of(tmp_path / "absent.tif")
    _, profile = as_delivered(BACKSCATTER)
    with rasterio.open(tmp_path / "two.tif", "w", **{**profile, "count": 2}) as target:
        target.write(np.zeros((2, 560, 600), dtype=np.float32))
    with pytest.raises(LayerError, match="one band of numbers"):
        read_layer(tmp_path / "two.tif")


def test_wrong_array_or_name_is_refused(tmp_path: Path) -> None:
    values, grid = read_layer(BACKSCATTER)
    with pytest.raises(ValueError, match="does not fit the grid"):
        write(tmp_path, values[:10], grid)
    with pytest.raises(ValueError, match="name of the files"):
        write(tmp_path, values, grid, name="../other")
    with pytest.raises(LayerError, match="holds no data"):
        write(tmp_path, np.full_like(values, np.nan), grid)
    assert list(tmp_path.iterdir()) == []


def test_folder_that_cannot_be_written_is_reported(tmp_path: Path) -> None:
    values, grid = read_layer(BACKSCATTER)
    with pytest.raises(LayerError, match="could not be written"):
        write(tmp_path / "absent", values, grid)
