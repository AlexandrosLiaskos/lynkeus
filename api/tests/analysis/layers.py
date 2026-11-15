"""Descriptions of the three sample layers of the pilot area, for the tests of the analysis tools."""

from typing import Any

import numpy as np
from numpy.typing import NDArray

from lynkeus.layers import LayerDescription

GCOV_21_OCT = "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001"
GCOV_2_NOV = "NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405_P05036_N_F_J_001"
GUNW_9_21_OCT = (
    "NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_"
    "20261021T234330_20261021T234405_P05036_N_F_J_001"
)


def layer(granule: str, *dates: str, **changes: Any) -> LayerDescription:
    """Describe a layer received from a product file, with the unit that the product declares."""
    name = "-".join(day.replace("-", "") for day in dates)
    description = {
        "id": f"layer-{name}",
        "title": f"Layer of {' and '.join(dates)}",
        "kind": "layer",
        "url": f"/files/layer-{name}.tif",
        "quantity": "Quantity of the product",
        "unit": "1",
        "range": [0, 1],
        "colours": "grey",
        "dates": dates,
        "inputs": [f"{granule}.h5"],
        "program": "Lynkeus 0.1.0",
        "method": None,
        "record": f"/files/layer-{name}.json",
    }
    return LayerDescription.model_validate({**description, **changes})


def grid(*rows: list[float]) -> NDArray[np.float32]:
    """Return the rows as the array of a layer."""
    return np.array(rows, dtype=np.float32)


EARLIER = layer(GCOV_21_OCT, "2026-10-21")
LATER = layer(GCOV_2_NOV, "2026-11-02")
PAIR = layer(GUNW_9_21_OCT, "2026-10-09", "2026-10-21")
