from typing import Any

from pydantic import BaseModel


class ProcessRequest(BaseModel):
    file_path: str
    upload_id: str | None = None


class ExportRequest(BaseModel):
    data: dict[str, Any] | None = None
    filename: str | None = None
