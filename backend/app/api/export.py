import json
import shutil
import tempfile
import zipfile
from pathlib import Path

import geopandas as gpd
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response
from starlette.background import BackgroundTask

from app.api.process import DATA_CACHE, _filter_gdf
from app.models.schemas import ExportRequest, FilterRequest

router = APIRouter()


def _request_to_gdf(request: ExportRequest | None) -> tuple[gpd.GeoDataFrame, str]:
    if request and request.data:
        feature_collection = request.data
        filename = request.filename or "filtered_buildings"
        gdf = gpd.GeoDataFrame.from_features(feature_collection["features"], crs="EPSG:4326")
        return gdf, filename

    cached_gdf = DATA_CACHE.get("data")
    filename = request.filename if request and request.filename else DATA_CACHE.get("source_name", "buildings")
    if cached_gdf is None or cached_gdf.empty:
        raise HTTPException(status_code=400, detail="No processed data is available for export.")

    if request and request.filters:
        filters = FilterRequest.model_validate(request.filters)
        return _filter_gdf(cached_gdf, filters), filename

    return cached_gdf, filename


@router.get("/export")
def export_latest_geojson():
    gdf = DATA_CACHE.get("data")
    filename = DATA_CACHE.get("source_name", "buildings")
    if gdf is None or gdf.empty:
        raise HTTPException(status_code=400, detail="No processed data is available for export.")

    geojson_text = gdf.to_json()
    headers = {"Content-Disposition": f'attachment; filename="{filename}.geojson"'}
    return Response(content=geojson_text, media_type="application/geo+json", headers=headers)


@router.post("/export/geojson")
def export_geojson(request: ExportRequest):
    gdf, filename = _request_to_gdf(request)
    content = gdf.to_json()
    headers = {"Content-Disposition": f'attachment; filename="{filename}.geojson"'}
    return Response(content=content, media_type="application/geo+json", headers=headers)


@router.post("/export/shapefile")
def export_shapefile(request: ExportRequest):
    gdf, filename = _request_to_gdf(request)
    shapefile_gdf = gdf.rename(columns={"orientation": "orient_deg"}).copy()

    temp_dir = Path(tempfile.mkdtemp(prefix="farm_detect_export_"))
    shapefile_path = temp_dir / f"{filename}.shp"
    zip_path = temp_dir / f"{filename}.zip"

    shapefile_gdf.to_file(shapefile_path, driver="ESRI Shapefile")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for child in temp_dir.iterdir():
            archive.write(child, arcname=child.name)

    return FileResponse(
        zip_path,
        filename=f"{filename}.zip",
        media_type="application/zip",
        background=BackgroundTask(shutil.rmtree, temp_dir, True),
    )


@router.post("/export/gpkg")
def export_gpkg(request: ExportRequest):
    gdf, filename = _request_to_gdf(request)
    temp_dir = Path(tempfile.mkdtemp(prefix="farm_detect_export_"))
    gpkg_path = temp_dir / f"{filename}.gpkg"

    gdf.to_file(gpkg_path, driver="GPKG")
    return FileResponse(
        gpkg_path,
        filename=f"{filename}.gpkg",
        media_type="application/geopackage+sqlite3",
        background=BackgroundTask(shutil.rmtree, temp_dir, True),
    )
