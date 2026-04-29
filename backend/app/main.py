from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api import export, process, upload

app = FastAPI(title="Building Morphology API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(upload.router)
app.include_router(process.router)
app.include_router(export.router)
