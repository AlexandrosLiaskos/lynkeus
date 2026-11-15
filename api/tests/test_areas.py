"""Tests of the areas that a visitor draws on the map and of the statistics of a result inside one."""

import math

import numpy as np
import pytest
from pydantic import ValidationError
from rasterio.crs import CRS
from rasterio.warp import transform

from lynkeus.areas import MOST_OUTLINE_POINTS, cells_inside, outline_on, statistics_inside
from lynkeus.layers import MOST_CORNERS, AreaStatistics, LayerDescription, Shape
from lynkeus.writing import Grid, LayerError

NAN = float("nan")

# A grid of 8 columns and 6 rows of 10 m in UTM zone 19 N. The centre of the cell in column i and row j lies at
# x = 300005 + 10 i and y = 4700055 - 10 j.
GRID = Grid(crs="EPSG:32619", transform=(10.0, 0.0, 300000.0, 0.0, -10.0, 4700060.0), width=8, height=6)
COLUMNS, ROWS = np.meshgrid(np.arange(8), np.arange(6))
CENTRE_X, CENTRE_Y = 300005.0 + 10 * COLUMNS, 4700055.0 - 10 * ROWS
MERCATOR, UTM = CRS.from_epsg(3857), CRS.from_epsg(32619)


def shape(*corners: tuple[float, float], kind: str = "polygon", crs: str = "EPSG:32619") -> Shape:
    """Return the area of the corners, with the first repeated at the end."""
    return Shape.model_validate({"crs": crs, "kind": kind, "points": [*corners, corners[0]]})


RECTANGLE = shape((300012, 4700008), (300038, 4700008), (300038, 4700052), (300012, 4700052), kind="rectangle")


def test_a_cell_is_inside_a_rectangle_when_its_centre_is() -> None:
    expected = (CENTRE_X > 300012) & (CENTRE_X < 300038) & (CENTRE_Y > 4700008) & (CENTRE_Y < 4700052)
    assert expected.sum() == 12
    assert np.array_equal(cells_inside(RECTANGLE, GRID), expected)
    # A side that cuts a cell but leaves its centre outside leaves the cell out, as GDAL does without ALL_TOUCHED.
    narrower = shape((300017, 4700008), (300038, 4700008), (300038, 4700052), (300017, 4700052), kind="rectangle")
    inside = cells_inside(narrower, GRID)
    assert inside.sum() == 8
    assert not inside[:, 1].any()


def test_a_cell_is_inside_a_polygon_when_its_centre_is() -> None:
    triangle = shape((300000, 4700000), (300080, 4700000), (300000, 4700060))
    # The long side runs from (300080, 4700000) to (300000, 4700060), and no centre lies on it.
    expected = (CENTRE_Y - 4700000) < 60 - 0.75 * (CENTRE_X - 300000)
    assert expected.sum() == 24
    assert np.array_equal(cells_inside(triangle, GRID), expected)


def test_an_area_across_the_edge_of_the_grid_counts_the_cells_of_the_grid_inside_it() -> None:
    across = shape((299950, 4700030), (300042, 4700030), (300042, 4700200), (299950, 4700200), kind="rectangle")
    expected = (CENTRE_X < 300042) & (CENTRE_Y > 4700030)
    assert expected.sum() == 12
    assert np.array_equal(cells_inside(across, GRID), expected)
    outside = shape((310000, 4700000), (310100, 4700000), (310100, 4700100))
    assert not cells_inside(outside, GRID).any()


def test_statistics_are_those_of_the_cells_inside_the_area_that_hold_a_value() -> None:
    values = (np.arange(48) / 4).astype(np.float32).reshape(6, 8)
    values[1, 1] = NAN
    inside = cells_inside(RECTANGLE, GRID)
    statistics = statistics_inside(values, inside, RECTANGLE)
    held = [value / 4 for value in (10, 11, 17, 18, 19, 25, 26, 27, 33, 34, 35)]
    mean = sum(held) / len(held)
    assert statistics.area == RECTANGLE
    assert (statistics.cells, statistics.minimum, statistics.median, statistics.maximum) == (11, 2.5, 6.25, 8.75)
    assert statistics.mean == pytest.approx(mean, rel=1e-15)
    # The standard deviation of the population: the mean of the squared differences, without a correction.
    assert statistics.deviation == pytest.approx(math.sqrt(sum((v - mean) ** 2 for v in held) / len(held)), rel=1e-15)
    # The median of an even number of values is the mean of the two in the middle.
    values[1, 1] = 9 / 4
    assert statistics_inside(values, inside, RECTANGLE).median == (19 + 25) / 2 / 4
    empty = statistics_inside(np.full((6, 8), NAN, np.float32), inside, RECTANGLE)
    assert empty == AreaStatistics(area=RECTANGLE, cells=0)
    assert (empty.mean, empty.deviation, empty.minimum, empty.median, empty.maximum) == (None,) * 5
    with pytest.raises(ValueError, match="not on the grid"):
        statistics_inside(values[:, :4], inside, RECTANGLE)


def test_the_statistics_are_computed_in_64_bit_numbers() -> None:
    # In 32-bit numbers the running sum of sixteen million cells of 0.1 and one cell of 1 loses the last cell.
    values = np.full((4001, 4000), np.float32(0.1))
    values[0, 0] = 1
    grid = Grid(crs="EPSG:32619", transform=(10.0, 0.0, 300000.0, 0.0, -10.0, 4800000.0), width=4000, height=4001)
    area = shape((299000, 4700000), (341000, 4700000), (341000, 4801000), (299000, 4801000), kind="rectangle")
    statistics = statistics_inside(values, cells_inside(area, grid), area)
    expected = (float(np.float32(0.1)) * (values.size - 1) + 1) / values.size
    assert statistics.cells == values.size
    assert statistics.mean == pytest.approx(expected, rel=1e-12)


def test_the_sides_of_an_area_of_the_map_follow_the_lines_that_the_map_draws() -> None:
    # The pilot box of Lynkeus as a rectangle of the map (Web Mercator), about 37 km by 39 km.
    (west, east), (south, north) = transform(CRS.from_epsg(4326), MERCATOR, [-71.2, -70.75], [42.6, 42.95])
    corners = [(west, south), (east, south), (east, north), (west, north)]
    area = shape(*corners, kind="rectangle", crs="EPSG:3857")
    grid = Grid(crs="EPSG:32619", transform=(10.0, 0.0, 316000.0, 0.0, -10.0, 4760000.0), width=4000, height=4000)
    outline = outline_on(area, grid)
    xs, ys = [x for x, _ in outline], [y for _, y in outline]
    corner_xs, corner_ys = transform(MERCATOR, UTM, [x for x, _ in corners], [y for _, y in corners])
    for corner in zip(corner_xs, corner_ys, strict=True):
        assert corner in outline
    assert outline[0] == outline[-1]
    # Every point lies on a side of the rectangle of the map.
    back_xs, back_ys = transform(UTM, MERCATOR, xs, ys)
    for x, y in zip(back_xs, back_ys, strict=True):
        assert min(abs(x - west), abs(x - east), abs(y - south), abs(y - north)) < 1e-6
    # Each piece is about one cell long, and the outline is far from the largest number of points.
    pieces = [math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]) for i in range(len(xs) - 1)]
    assert min(pieces) > 9.9
    assert max(pieces) <= 10.1
    assert len(outline) < MOST_OUTLINE_POINTS
    # The straight line between the two north corners on the grid passes far from the middle of the north side.
    (middle_x,), (middle_y,) = transform(MERCATOR, UTM, [(west + east) / 2], [north])
    (x1, x2), (y1, y2) = (corner_xs[3], corner_xs[2]), (corner_ys[3], corner_ys[2])
    away = abs((x2 - x1) * (y1 - middle_y) - (x1 - middle_x) * (y2 - y1)) / math.hypot(x2 - x1, y2 - y1)
    assert away > 10


def test_an_outline_has_at_most_its_largest_number_of_points() -> None:
    (west, east), (south, north) = transform(CRS.from_epsg(4326), MERCATOR, [-80.0, -60.0], [30.0, 50.0])
    area = shape((west, south), (east, south), (east, north), (west, north), kind="rectangle", crs="EPSG:3857")
    # Each side gives at most one piece more than its share of the largest number, and the first point closes.
    assert len(outline_on(area, GRID)) <= MOST_OUTLINE_POINTS + len(area.points)


def test_an_area_in_the_coordinates_of_the_grid_keeps_its_corners() -> None:
    assert outline_on(RECTANGLE, GRID) == list(RECTANGLE.points)


def test_an_area_that_cannot_be_placed_on_the_grid_is_refused() -> None:
    unknown = shape((0, 0), (1, 0), (1, 1), crs="EPSG:999999")
    with pytest.raises(LayerError, match="coordinates that Lynkeus does not know"):
        cells_inside(unknown, GRID)
    # A polygon on the other side of the Earth is given numbers by the projection of the zone of the grid, which
    # even return to the polygon, so it is refused by its longitude.
    far = shape((1.0e7, 0), (1.9e7, 0), (1.9e7, 1.0e6), crs="EPSG:3857")
    (x,), (y,) = transform(MERCATOR, UTM, [1.0e7], [0.0])
    assert math.isfinite(x) and math.isfinite(y)
    with pytest.raises(LayerError, match="too far from the layers"):
        cells_inside(far, GRID)
    # About 77 degrees of longitude from the centre of the grid, near -71.4 degrees, is near enough.
    (west, east), (south, north) = transform(CRS.from_epsg(4326), MERCATOR, [-148.0, -147.0], [42.0, 43.0])
    near = shape((west, south), (east, south), (east, north), (west, north), kind="rectangle", crs="EPSG:3857")
    assert not cells_inside(near, GRID).any()


@pytest.mark.parametrize(
    ("points", "kind", "fault"),
    [
        ([(0, 0), (1, 0), (1, 1), (0, 1)], "polygon", "the last point of an area must repeat its first"),
        ([(0, 0), (1, 0), (1, 0), (0, 0)], "polygon", "at least three different corners"),
        ([(0, 0), (2, 0), (2, 1), (1, 2), (0, 0)], "rectangle", "a rectangle has four corners"),
        ([(0, 0), (2, 0), (2, 1), (0, 0)], "rectangle", "a rectangle has four corners"),
        ([(0, 0), (2, 2), (2, 0), (0, 2), (0, 0)], "polygon", "cross or overlap"),
        ([(0, 0), (2, 0), (2, 2), (0, 2), (0, 0), (1, 1), (1, 3), (0, 0)], "polygon", "cross or overlap"),
        ([(0, 0), (4, 0), (2, 0), (2, 2), (0, 0)], "polygon", "cross or overlap"),
        ([(0, 0), (1, 1), (2, 2), (0, 0)], "polygon", "cross or overlap"),
        ([(0, 0), (1, 0), (1, 1), (0, 0)], "triangle", "Input should be 'rectangle' or 'polygon'"),
        ([(0, 0), (1, 0), (1, 1), (0, 0)], "polygon", None),
    ],
)
def test_an_area_is_one_rectangle_or_polygon_whose_sides_do_not_cross(
    points: list[tuple[float, float]], kind: str, fault: str | None
) -> None:
    given = {"crs": "EPSG:3857", "kind": kind, "points": points}
    if fault is None:
        assert Shape.model_validate(given).points == tuple(points)
    else:
        with pytest.raises(ValidationError, match=fault):
            Shape.model_validate(given)


def test_an_area_names_its_coordinates_and_has_at_most_its_largest_number_of_corners() -> None:
    triangle = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 0.0)]
    with pytest.raises(ValidationError, match="String should match pattern"):
        Shape.model_validate({"crs": "WGS 84", "kind": "polygon", "points": triangle})
    circle = [
        (math.cos(2 * math.pi * k / MOST_CORNERS), math.sin(2 * math.pi * k / MOST_CORNERS))
        for k in range(MOST_CORNERS)
    ]
    assert (
        len(Shape.model_validate({"crs": "EPSG:3857", "kind": "polygon", "points": [*circle, circle[0]]}).points) == 251
    )
    more = [(math.cos(2 * math.pi * k / 251), math.sin(2 * math.pi * k / 251)) for k in range(251)]
    with pytest.raises(ValidationError, match="at most 251 items"):
        Shape.model_validate({"crs": "EPSG:3857", "kind": "polygon", "points": [*more, more[0]]})
    # A point that repeats the one before it is no corner, and a rectangle may have one.
    repeated = [(0, 0), (2, 0), (2, 0), (2, 1), (0, 1), (0, 0)]
    assert Shape.model_validate({"crs": "EPSG:3857", "kind": "rectangle", "points": repeated}).kind == "rectangle"


def test_statistics_have_every_value_when_and_only_when_they_have_cells() -> None:
    values = {"mean": 1.0, "deviation": 0.5, "minimum": 0.0, "median": 1.0, "maximum": 2.0}
    assert AreaStatistics(area=RECTANGLE, cells=3, **values).median == 1.0
    with pytest.raises(ValidationError, match="without cells have no values"):
        AreaStatistics(area=RECTANGLE, cells=0, mean=1.0)
    with pytest.raises(ValidationError, match="have every value"):
        AreaStatistics(area=RECTANGLE, cells=3, **{**values, "median": None})
    with pytest.raises(ValidationError, match="the median lies between"):
        AreaStatistics(area=RECTANGLE, cells=3, **{**values, "median": 3.0})
    with pytest.raises(ValidationError, match="greater than or equal to 0"):
        AreaStatistics(area=RECTANGLE, cells=3, **{**values, "deviation": -1.0})


def test_only_a_result_has_statistics_in_an_area() -> None:
    statistics = AreaStatistics(area=RECTANGLE, cells=0)
    layer = {
        "id": "a1",
        "title": "Backscatter HH",
        "kind": "layer",
        "url": "/files/a1/a1.tif",
        "quantity": "Radar backscatter gamma0",
        "unit": "1",
        "range": [0.0, 1.0],
        "colours": "grey",
        "dates": ["2026-10-21"],
        "inputs": ["product.h5"],
        "program": "Lynkeus 0.1.0",
        "record": "/files/a1/a1.json",
    }
    assert LayerDescription.model_validate(layer).statistics is None
    with pytest.raises(ValidationError, match="only a result has statistics in an area"):
        LayerDescription.model_validate({**layer, "statistics": statistics.model_dump()})
    result = {**layer, "kind": "result", "unit": "dB", "method": "Reference", "statistics": statistics.model_dump()}
    assert LayerDescription.model_validate(result).statistics == statistics
