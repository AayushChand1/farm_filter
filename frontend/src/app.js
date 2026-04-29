(function () {
  const state = {
    hasProcessedData: false,
    exportName: "filtered_buildings",
    requestVersion: 0,
    filterTimer: null,
    totalCount: 0,
    visibleCount: 0,
  };

  const elements = {
    controls: document.getElementById("controls"),
    fileInput: document.getElementById("fileInput"),
    uploadButton: document.getElementById("uploadButton"),
    exportButton: document.getElementById("exportButton"),
    clearSessionButton: document.getElementById("clearSessionButton"),
    exportFormatSelect: document.getElementById("exportFormatSelect"),
    basemapSelect: document.getElementById("basemapSelect"),
    areaToggle: document.getElementById("areaToggle"),
    ratioToggle: document.getElementById("ratioToggle"),
    angleToggle: document.getElementById("angleToggle"),
    areaSlider: document.getElementById("areaSlider"),
    ratioSlider: document.getElementById("ratioSlider"),
    angleSlider: document.getElementById("angleSlider"),
    areaValue: document.getElementById("areaValue"),
    ratioValue: document.getElementById("ratioValue"),
    angleValue: document.getElementById("angleValue"),
    status: document.getElementById("status"),
    totalCount: document.getElementById("totalCount"),
    visibleCount: document.getElementById("visibleCount"),
  };

  function setStatus(message, isError) {
    elements.status.textContent = message;
    elements.status.classList.toggle("error", Boolean(isError));
  }

  function setLiveProgressStatus(progressState) {
    if (!progressState || !progressState.message) {
      return;
    }

    if (typeof progressState.progress === "number") {
      setStatus(`${progressState.message} (${progressState.progress}%)`);
      return;
    }

    setStatus(progressState.message);
  }

  function getFilters() {
    return {
      area: {
        enabled: elements.areaToggle.checked,
        value: Number(elements.areaSlider.value),
      },
      ratio: {
        enabled: elements.ratioToggle.checked,
        value: Number(elements.ratioSlider.value),
      },
      angle: {
        enabled: elements.angleToggle.checked,
        value: Number(elements.angleSlider.value),
      },
    };
  }

  function updateOutputs() {
    elements.areaValue.value = elements.areaSlider.value;
    elements.ratioValue.value = Number(elements.ratioSlider.value).toFixed(1);
    elements.angleValue.value = elements.angleSlider.value;
  }

  function refreshCounts() {
    elements.totalCount.textContent = String(state.totalCount || 0);
    elements.visibleCount.textContent = String(state.visibleCount || 0);
  }

  function resetState() {
    state.hasProcessedData = false;
    state.exportName = "filtered_buildings";
    state.totalCount = 0;
    state.visibleCount = 0;
    state.requestVersion += 1;
    window.clearTimeout(state.filterTimer);
    elements.fileInput.value = "";
    window.FarmDetectMap.clearLayer();
    refreshCounts();
  }

  function renderResult(payload, options) {
    const previewData = payload.data || { type: "FeatureCollection", features: [] };
    state.hasProcessedData = true;
    state.totalCount = Number(payload.totalCount || 0);
    state.visibleCount = Number(payload.visibleCount || 0);

    window.FarmDetectRender.renderFeatures(previewData, {
      fitBounds: Boolean(options && options.fitBounds),
    });
    refreshCounts();

    if (payload.previewTruncated) {
      setStatus(`Showing ${state.visibleCount} filtered features. Map preview limited to first ${payload.previewLimit}.`);
      return;
    }

    setStatus(`Showing ${state.visibleCount} filtered features.`);
  }

  function applyCurrentFilters() {
    if (!state.hasProcessedData) {
      return;
    }

    const filters = getFilters();
    window.clearTimeout(state.filterTimer);
    state.filterTimer = window.setTimeout(() => {
      const requestVersion = ++state.requestVersion;
      setStatus("Updating filtered preview...");

      window.FarmDetectUpload.fetchFilteredData(filters)
        .then((payload) => {
          if (requestVersion !== state.requestVersion) {
            return;
          }

          renderResult(payload, { fitBounds: false });
        })
        .catch((error) => {
          if (requestVersion !== state.requestVersion) {
            return;
          }

          setStatus(error.message, true);
        });
    }, 150);
  }

  async function handleUpload() {
    const files = Array.from(elements.fileInput.files || []);
    if (!files.length) {
      setStatus("Choose a GeoJSON file or shapefile parts first.", true);
      return;
    }

    setStatus("Uploading and processing dataset...");

    try {
      const data = await window.FarmDetectUpload.uploadAndProcess(files, setLiveProgressStatus);
      state.exportName = files[0].name.replace(/\.[^.]+$/, "") || "filtered_buildings";
      state.requestVersion += 1;
      window.FarmDetectFilters.configureSliders(data.sliderBounds, elements);
      updateOutputs();
      renderResult(data, { fitBounds: true });
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function handleExport(kind) {
    if (!state.hasProcessedData || !state.visibleCount) {
      setStatus("There is no filtered dataset to export.", true);
      return;
    }

    setStatus(`Preparing ${kind.toUpperCase()} export...`);

    try {
      const filters = getFilters();
      if (kind === "geojson") {
        await window.FarmDetectExport.exportGeoJSON(filters, state.exportName);
      } else if (kind === "gpkg") {
        await window.FarmDetectExport.exportGPKG(filters, state.exportName);
      } else {
        await window.FarmDetectExport.exportShapefile(filters, state.exportName);
      }
      setStatus(`Downloaded ${kind.toUpperCase()} export.`);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function handleClearSession() {
    setStatus("Clearing cached data and current session...");

    try {
      await window.FarmDetectUpload.clearSession();
      resetState();
      setStatus("Cleared cached data and reset current input/output state.");
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  [
    elements.areaSlider,
    elements.ratioSlider,
    elements.angleSlider,
    elements.areaToggle,
    elements.ratioToggle,
    elements.angleToggle,
  ].forEach((element) => {
    element.addEventListener("input", () => {
      updateOutputs();
      applyCurrentFilters();
    });
    element.addEventListener("change", () => {
      updateOutputs();
      applyCurrentFilters();
    });
  });

  elements.uploadButton.addEventListener("click", handleUpload);
  elements.exportButton.addEventListener("click", () => {
    handleExport(elements.exportFormatSelect.value);
  });
  elements.clearSessionButton.addEventListener("click", handleClearSession);
  elements.basemapSelect.addEventListener("change", () => {
    window.FarmDetectMap.setBasemap(elements.basemapSelect.value);
  });

  if (window.L && elements.controls) {
    window.L.DomEvent.disableScrollPropagation(elements.controls);
    window.L.DomEvent.disableClickPropagation(elements.controls);
  }

  if (elements.controls && window.FarmDetectMap) {
    elements.controls.addEventListener("mouseenter", () => {
      window.FarmDetectMap.setScrollWheelZoom(false);
    });

    elements.controls.addEventListener("mouseleave", () => {
      window.FarmDetectMap.setScrollWheelZoom(true);
    });
  }

  updateOutputs();
})();
