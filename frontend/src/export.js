(function () {
  async function exportDataset(endpoint, payload, filename) {
    const response = await fetch(`${window.FarmDetectUpload.API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const message = errorPayload && errorPayload.detail ? errorPayload.detail : "Export failed.";
      throw new Error(message);
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(downloadUrl);
  }

  function buildPayload(featureCollection, filename) {
    return {
      filename,
      data: featureCollection,
    };
  }

  window.FarmDetectExport = {
    exportGeoJSON(featureCollection, filename) {
      return exportDataset("/export/geojson", buildPayload(featureCollection, filename), `${filename}.geojson`);
    },
    exportGPKG(featureCollection, filename) {
      return exportDataset("/export/gpkg", buildPayload(featureCollection, filename), `${filename}.gpkg`);
    },
    exportShapefile(featureCollection, filename) {
      return exportDataset("/export/shapefile", buildPayload(featureCollection, filename), `${filename}.zip`);
    },
  };
})();
