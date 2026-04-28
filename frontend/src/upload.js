(function () {
  const MAX_RAW_GEOJSON_BYTES = 75 * 1024 * 1024;

  function resolveApiBase() {
    const configuredBase =
      window.FarmDetectConfig && typeof window.FarmDetectConfig.apiBase === "string"
        ? window.FarmDetectConfig.apiBase.trim()
        : "";

    if (configuredBase) {
      return configuredBase.replace(/\/+$/, "");
    }

    const hostname = window.location.hostname;
    const isLocalHost =
      window.location.protocol === "file:" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1";

    return isLocalHost ? "http://localhost:8000" : "";
  }

  function formatBytes(bytes) {
    if (!bytes) {
      return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function validateFiles(files) {
    const geojsonFiles = files.filter((file) => /\.(geojson|json)$/i.test(file.name));
    const oversizedGeojson = geojsonFiles.find((file) => file.size > MAX_RAW_GEOJSON_BYTES);

    if (oversizedGeojson) {
      throw new Error(
        `Raw GeoJSON file ${oversizedGeojson.name} is ${formatBytes(oversizedGeojson.size)}. For large areas, use GPKG or zipped GeoJSON instead of raw GeoJSON.`
      );
    }
  }

  const API_BASE = resolveApiBase();

  async function parseJsonResponse(response) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && payload.detail ? payload.detail : "Request failed.";
      throw new Error(message);
    }
    return payload;
  }

  async function uploadAndProcess(files) {
    if (!API_BASE) {
      throw new Error("API base URL is not configured. Set `apiBase` in frontend/config.js for deployment.");
    }

    if (!files.length) {
      throw new Error("Choose a GeoJSON file or shapefile parts before uploading.");
    }

    validateFiles(files);

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      const uploadResponse = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });
      const uploadPayload = await parseJsonResponse(uploadResponse);

      const processResponse = await fetch(`${API_BASE}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_path: uploadPayload.file_path,
          upload_id: uploadPayload.upload_id,
        }),
      });

      return parseJsonResponse(processResponse);
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(
          "Large dataset transfer failed. Try GPKG or zipped GeoJSON for big areas, or wait for the backend to wake up if it is hosted on Render."
        );
      }
      throw error;
    }
  }

  window.FarmDetectUpload = {
    API_BASE,
    uploadAndProcess,
  };
})();
