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

  async function checkBackendReachable() {
    const response = await fetch(`${API_BASE}/health`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("Backend health check failed.");
    }
  }

  function uploadFiles(formData, onProgress) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", `${API_BASE}/upload`);
      request.responseType = "json";

      request.upload.addEventListener("progress", (event) => {
        if (!onProgress || !event.lengthComputable) {
          return;
        }

        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress({
          phase: "upload",
          progress: percent,
          message: `Uploading dataset... ${percent}%`,
        });
      });

      request.addEventListener("load", () => {
        const payload = request.response;
        if (request.status >= 200 && request.status < 300) {
          resolve(payload);
          return;
        }

        const message = payload && payload.detail ? payload.detail : "Upload failed.";
        reject(new Error(message));
      });

      request.addEventListener("error", () => {
        reject(new Error(`Upload failed. The backend may be unreachable at ${API_BASE}.`));
      });

      request.send(formData);
    });
  }

  async function pollProcess(jobId, onProgress) {
    while (true) {
      const response = await fetch(`${API_BASE}/process/status/${jobId}`);
      if (response.status === 404) {
        throw new Error("__PROCESS_STATUS_NOT_FOUND__");
      }

      const payload = await parseJsonResponse(response);

      if (onProgress) {
        onProgress(payload);
      }

      if (payload.status === "completed") {
        return payload.result;
      }

      if (payload.status === "failed") {
        throw new Error(payload.error || payload.message || "Processing failed.");
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
  }

  async function uploadAndProcess(files, onProgress) {
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
      if (onProgress) {
        onProgress({
          phase: "health",
          message: "Checking backend connection...",
        });
      }

      await checkBackendReachable();

      if (onProgress) {
        onProgress({
          phase: "upload",
          progress: 0,
          message: "Uploading dataset...",
        });
      }

      const uploadPayload = await uploadFiles(formData, onProgress);

      if (onProgress) {
        onProgress({
          phase: "process",
          progress: 5,
          message: "Upload complete. Queuing dataset for processing...",
        });
      }

      const processRequest = {
        file_path: uploadPayload.file_path,
        upload_id: uploadPayload.upload_id,
      };

      const processResponse = await fetch(`${API_BASE}/process/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(processRequest),
      });

      if (processResponse.status === 404) {
        if (onProgress) {
          onProgress({
            phase: "process",
            message: "Live progress is unavailable on this backend. Processing dataset...",
          });
        }

        const fallbackResponse = await fetch(`${API_BASE}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(processRequest),
        });

        return parseJsonResponse(fallbackResponse);
      }

      const processPayload = await parseJsonResponse(processResponse);

      try {
        return await pollProcess(processPayload.jobId, onProgress);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "__PROCESS_STATUS_NOT_FOUND__") {
          throw error;
        }

        if (onProgress) {
          onProgress({
            phase: "process",
            message: "Live status endpoint unavailable. Waiting for processing to finish...",
          });
        }

        const fallbackResponse = await fetch(`${API_BASE}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(processRequest),
        });

        return parseJsonResponse(fallbackResponse);
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(
          "Large dataset transfer failed. Try GPKG or zipped GeoJSON for big areas, or wait for the backend to wake up if it is hosted on Render."
        );
      }
      throw error;
    }
  }

  async function fetchFilteredData(filters) {
    if (!API_BASE) {
      throw new Error("API base URL is not configured. Set `apiBase` in frontend/config.js for deployment.");
    }

    const response = await fetch(`${API_BASE}/filter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filters),
    });

    return parseJsonResponse(response);
  }

  async function clearSession() {
    if (!API_BASE) {
      return;
    }

    const response = await fetch(`${API_BASE}/cache`, {
      method: "DELETE",
    });

    await parseJsonResponse(response);
  }

  window.FarmDetectUpload = {
    API_BASE,
    clearSession,
    fetchFilteredData,
    uploadAndProcess,
  };
})();
