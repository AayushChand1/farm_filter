import shutil
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter()

BACKEND_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BACKEND_DIR / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

GEOJSON_EXTENSIONS = {".geojson", ".json"}
GPKG_EXTENSIONS = {".gpkg"}
SHAPEFILE_EXTENSIONS = {".shp", ".dbf", ".shx", ".prj", ".cpg", ".qix"}


def _find_dataset_path(dataset_dir: Path) -> Path:
    shp_files = sorted(dataset_dir.glob("*.shp"))
    if shp_files:
        return shp_files[0]

    geojson_files = sorted(
        path for path in dataset_dir.iterdir() if path.suffix.lower() in GEOJSON_EXTENSIONS
    )
    if geojson_files:
        return geojson_files[0]

    gpkg_files = sorted(
        path for path in dataset_dir.iterdir() if path.suffix.lower() in GPKG_EXTENSIONS
    )
    if gpkg_files:
        return gpkg_files[0]

    raise HTTPException(
        status_code=400,
        detail="Upload a GeoJSON or GPKG file, a ZIP containing a shapefile, or all shapefile sidecar files together.",
    )


def remove_upload_dir(upload_id: str | None):
    if not upload_id:
        return

    dataset_dir = UPLOAD_DIR / upload_id
    if dataset_dir.exists():
        shutil.rmtree(dataset_dir, ignore_errors=True)


def clear_upload_dirs():
    if not UPLOAD_DIR.exists():
        return

    for child in UPLOAD_DIR.iterdir():
        if child.is_dir():
            shutil.rmtree(child, ignore_errors=True)
        else:
            child.unlink(missing_ok=True)


@router.post("/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files were uploaded.")

    dataset_dir = UPLOAD_DIR / uuid.uuid4().hex
    dataset_dir.mkdir(parents=True, exist_ok=True)

    for upload in files:
        filename = Path(upload.filename or "").name
        if not filename:
            continue

        target_path = dataset_dir / filename
        with target_path.open("wb") as buffer:
            shutil.copyfileobj(upload.file, buffer)

        if target_path.suffix.lower() == ".zip":
            with zipfile.ZipFile(target_path) as archive:
                archive.extractall(dataset_dir)

    dataset_path = _find_dataset_path(dataset_dir)

    return {
        "upload_id": dataset_dir.name,
        "file_path": str(dataset_path),
        "filename": dataset_path.name,
    }
