import logging
from pathlib import Path
from time import perf_counter

import geopandas as gpd
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.api.upload import remove_upload_dir
from app.core.geometry import compute_area, compute_ratio_and_orientation
from app.models.schemas import ProcessRequest

router = APIRouter()
logger = logging.getLogger(__name__)

DATA_CACHE = {}


def _calculation_frame(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    calc_gdf = gdf.copy()
    if calc_gdf.crs and calc_gdf.crs.is_geographic:
        utm_crs = calc_gdf.estimate_utm_crs()
        if utm_crs:
            calc_gdf = calc_gdf.to_crs(utm_crs)
    return calc_gdf


@router.post("/process")
def process(request: ProcessRequest):
    file_path = Path(request.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Uploaded dataset was not found.")

    started_at = perf_counter()
    logger.info("Starting dataset processing for %s", file_path)

    try:
        read_started_at = perf_counter()
        gdf = gpd.read_file(file_path)
        read_elapsed = perf_counter() - read_started_at

        if gdf.empty:
            raise HTTPException(status_code=400, detail="The uploaded dataset does not contain any features.")

        calc_started_at = perf_counter()
        calc_gdf = _calculation_frame(gdf)

        ratios = []
        areas = []
        angles = []

        for geom in calc_gdf.geometry:
            ratio, angle = compute_ratio_and_orientation(geom)
            ratios.append(ratio)
            angles.append(angle)
            areas.append(compute_area(geom))

        calc_elapsed = perf_counter() - calc_started_at

        result_started_at = perf_counter()
        result_gdf = gdf.copy()
        result_gdf["ratio"] = ratios
        result_gdf["area"] = areas
        result_gdf["orientation"] = angles

        if result_gdf.crs:
            result_gdf = result_gdf.to_crs(4326)

        geojson_text = result_gdf.to_json()
        result_elapsed = perf_counter() - result_started_at

        DATA_CACHE["data"] = result_gdf
        DATA_CACHE["geojson_text"] = geojson_text
        DATA_CACHE["source_name"] = file_path.stem

        total_elapsed = perf_counter() - started_at
        logger.info(
            "Processed %s: features=%s read=%.2fs compute=%.2fs serialize=%.2fs total=%.2fs response_bytes=%s",
            file_path.name,
            len(result_gdf),
            read_elapsed,
            calc_elapsed,
            result_elapsed,
            total_elapsed,
            len(geojson_text.encode("utf-8")),
        )

        return Response(content=geojson_text, media_type="application/json")
    finally:
        remove_upload_dir(request.upload_id)
