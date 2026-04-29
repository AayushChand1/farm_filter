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

  function buildPayload(filters, filename) {
    return {
      filename,
      filters,
    };
  }

  window.FarmDetectExport = {
    exportGeoJSON(filters, filename) {
      return exportDataset("/export/geojson", buildPayload(filters, filename), `${filename}.geojson`);
    },
    exportGPKG(filters, filename) {
      return exportDataset("/export/gpkg", buildPayload(filters, filename), `${filename}.gpkg`);
    },
    exportShapefile(filters, filename) {
      return exportDataset("/export/shapefile", buildPayload(filters, filename), `${filename}.zip`);
    },
  };
})();
