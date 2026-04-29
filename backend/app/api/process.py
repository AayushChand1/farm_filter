import logging
import uuid
from pathlib import Path
from time import perf_counter

import geopandas as gpd
from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.api.upload import clear_upload_dirs, remove_upload_dir
from app.core.geometry import compute_area, compute_ratio_and_orientation
from app.models.schemas import FilterRequest, ProcessRequest

router = APIRouter()
logger = logging.getLogger(__name__)

DATA_CACHE = {}
PROCESS_JOBS = {}


def clear_data_cache():
    DATA_CACHE.clear()


def _set_job_state(job_id: str, **updates):
    job = PROCESS_JOBS.setdefault(
        job_id,
        {
            "jobId": job_id,
            "status": "queued",
            "progress": 0,
            "message": "Queued for processing...",
        },
    )
    job.update(updates)
    return job


def _feature_collection_from_gdf(gdf: gpd.GeoDataFrame) -> dict:
    if gdf.empty:
        return {"type": "FeatureCollection", "features": []}

    feature_gdf = gdf.copy()
    available_columns = set(feature_gdf.columns)
    props_to_keep = [column for column in ("name", "area", "ratio", "orientation") if column in available_columns]
    feature_gdf = feature_gdf.loc[:, props_to_keep + ["geometry"]]
    return feature_gdf.__geo_interface__


def _slider_bounds_from_gdf(gdf: gpd.GeoDataFrame) -> dict[str, float]:
    if gdf.empty:
        return {
            "areaMax": 100,
            "ratioMax": 5,
            "angleMax": 90,
        }

    area_max = max(100, int(gdf["area"].max() + 10))
    ratio_max = max(5, int(gdf["ratio"].max() + 1))
    return {
        "areaMax": area_max,
        "ratioMax": ratio_max,
        "angleMax": 90,
    }


def _filter_gdf(gdf: gpd.GeoDataFrame, filters: FilterRequest) -> gpd.GeoDataFrame:
    filtered_gdf = gdf

    if filters.area.enabled:
        filtered_gdf = filtered_gdf.loc[filtered_gdf["area"] >= filters.area.value]

    if filters.ratio.enabled:
        filtered_gdf = filtered_gdf.loc[filtered_gdf["ratio"] >= filters.ratio.value]

    if filters.angle.enabled:
        filtered_gdf = filtered_gdf.loc[filtered_gdf["orientation"] >= filters.angle.value]

    return filtered_gdf


def _cache_payload(gdf: gpd.GeoDataFrame) -> dict:
    return {
        "data": _feature_collection_from_gdf(gdf),
        "totalCount": int(DATA_CACHE["data"].shape[0]),
        "visibleCount": int(gdf.shape[0]),
        "sliderBounds": DATA_CACHE["slider_bounds"],
        "sourceName": DATA_CACHE.get("source_name", "buildings"),
    }


def _process_dataset(file_path: Path, job_id: str | None = None) -> dict:
    started_at = perf_counter()
    logger.info("Starting dataset processing for %s", file_path)

    if job_id:
        _set_job_state(job_id, status="running", progress=10, message="Reading dataset from file...")

    read_started_at = perf_counter()
    gdf = gpd.read_file(file_path)
    read_elapsed = perf_counter() - read_started_at

    if gdf.empty:
        raise HTTPException(status_code=400, detail="The uploaded dataset does not contain any features.")

    calc_started_at = perf_counter()
    calc_gdf = _calculation_frame(gdf)
    total_features = len(calc_gdf.geometry)

    if job_id:
        _set_job_state(
            job_id,
            status="running",
            progress=35,
            message=f"Loaded {total_features} features. Computing area, ratio, and orientation...",
        )

    ratios = []
    areas = []
    angles = []
    progress_step = max(1, total_features // 20) if total_features else 1

    for index, geom in enumerate(calc_gdf.geometry, start=1):
        ratio, angle = compute_ratio_and_orientation(geom)
        ratios.append(ratio)
        angles.append(angle)
        areas.append(compute_area(geom))

        if job_id and (index == total_features or index % progress_step == 0):
            progress = 35 + int((index / total_features) * 45)
            _set_job_state(
                job_id,
                status="running",
                progress=min(progress, 80),
                message=f"Computing building metrics... {index}/{total_features}",
            )

    calc_elapsed = perf_counter() - calc_started_at

    result_started_at = perf_counter()
    result_gdf = gdf.copy()
    result_gdf["ratio"] = ratios
    result_gdf["area"] = areas
    result_gdf["orientation"] = angles

    if result_gdf.crs:
        result_gdf = result_gdf.to_crs(4326)

    if job_id:
        _set_job_state(job_id, status="running", progress=90, message="Preparing map preview and counts...")

    DATA_CACHE["data"] = result_gdf
    DATA_CACHE["source_name"] = file_path.stem
    DATA_CACHE["slider_bounds"] = _slider_bounds_from_gdf(result_gdf)
    payload = _cache_payload(result_gdf)
    result_elapsed = perf_counter() - result_started_at

    total_elapsed = perf_counter() - started_at
    logger.info(
        "Processed %s: features=%s read=%.2fs compute=%.2fs serialize=%.2fs total=%.2fs preview_features=%s",
        file_path.name,
        len(result_gdf),
        read_elapsed,
        calc_elapsed,
        result_elapsed,
        total_elapsed,
        len(payload["data"]["features"]),
    )

    if job_id:
        _set_job_state(job_id, status="completed", progress=100, message="Processing complete.", result=payload)

    return payload


def _run_process_job(file_path_str: str, upload_id: str | None, job_id: str):
    file_path = Path(file_path_str)

    try:
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Uploaded dataset was not found.")

        _process_dataset(file_path, job_id)
    except HTTPException as error:
        _set_job_state(job_id, status="failed", message=str(error.detail), error=str(error.detail))
    except Exception:
        logger.exception("Unexpected processing error for %s", file_path)
        _set_job_state(
            job_id,
            status="failed",
            message="Processing failed unexpectedly on the server.",
            error="Processing failed unexpectedly on the server.",
        )
    finally:
        remove_upload_dir(upload_id)


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

    try:
        return _process_dataset(file_path)
    finally:
        remove_upload_dir(request.upload_id)


@router.post("/process/start")
def start_process(request: ProcessRequest, background_tasks: BackgroundTasks):
    file_path = Path(request.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Uploaded dataset was not found.")

    job_id = uuid.uuid4().hex
    _set_job_state(job_id, status="queued", progress=5, message="Queued for processing...")
    background_tasks.add_task(_run_process_job, request.file_path, request.upload_id, job_id)
    return PROCESS_JOBS[job_id]


@router.get("/process/status/{job_id}")
def process_status(job_id: str):
    job = PROCESS_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Processing job was not found.")

    return job


@router.post("/filter")
def filter_data(filters: FilterRequest):
    gdf = DATA_CACHE.get("data")
    if gdf is None or gdf.empty:
        raise HTTPException(status_code=400, detail="No processed data is available to filter.")

    filtered_gdf = _filter_gdf(gdf, filters)
    return _cache_payload(filtered_gdf)


@router.delete("/cache")
def clear_cache():
    clear_data_cache()
    PROCESS_JOBS.clear()
    clear_upload_dirs()
    return {"detail": "Cleared processed data cache and uploaded temp files."}
