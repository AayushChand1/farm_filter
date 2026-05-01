from typing import Any

from pydantic import BaseModel


class ProcessRequest(BaseModel):
    file_path: str
    upload_id: str | None = None


class ExportRequest(BaseModel):
    data: dict[str, Any] | None = None
    filename: str | None = None
    filters: dict[str, Any] | None = None


class FilterThreshold(BaseModel):
    enabled: bool = False
    value: float = 0


class FilterRequest(BaseModel):
    area: FilterThreshold
    ratio: FilterThreshold
    angle: FilterThreshold
    rectangularity: FilterThreshold
