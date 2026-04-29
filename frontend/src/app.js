(function () {
  const state = {
    sourceData: null,
    filteredData: null,
    exportName: "filtered_buildings",
  };

  const elements = {
    controls: document.getElementById("controls"),
    fileInput: document.getElementById("fileInput"),
    uploadButton: document.getElementById("uploadButton"),
    exportButton: document.getElementById("exportButton"),
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
    elements.totalCount.textContent = String(state.sourceData ? state.sourceData.features.length : 0);
    elements.visibleCount.textContent = String(state.filteredData ? state.filteredData.features.length : 0);
  }

  function applyCurrentFilters() {
    if (!state.sourceData) {
      return;
    }

    state.filteredData = window.FarmDetectFilters.applyFilters(state.sourceData, getFilters());
    window.FarmDetectRender.renderFeatures(state.filteredData, { fitBounds: false });
    refreshCounts();
    setStatus(`Showing ${state.filteredData.features.length} filtered features.`);
  }

  async function handleUpload() {
    const files = Array.from(elements.fileInput.files || []);
    if (!files.length) {
      setStatus("Choose a GeoJSON file or shapefile parts first.", true);
      return;
    }

    setStatus("Uploading and processing dataset...");

    try {
      const data = await window.FarmDetectUpload.uploadAndProcess(files);
      state.sourceData = data;
      state.filteredData = data;
      state.exportName = files[0].name.replace(/\.[^.]+$/, "") || "filtered_buildings";

      window.FarmDetectFilters.configureSliders(data, elements);
      updateOutputs();
      state.filteredData = window.FarmDetectFilters.applyFilters(state.sourceData, getFilters());
      window.FarmDetectRender.renderFeatures(state.filteredData, { fitBounds: true });
      refreshCounts();
      setStatus(`Showing ${state.filteredData.features.length} filtered features.`);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function handleExport(kind) {
    if (!state.filteredData || !state.filteredData.features.length) {
      setStatus("There is no filtered dataset to export.", true);
      return;
    }

      setStatus(`Preparing ${kind.toUpperCase()} export...`);

    try {
      if (kind === "geojson") {
        await window.FarmDetectExport.exportGeoJSON(state.filteredData, state.exportName);
      } else if (kind === "gpkg") {
        await window.FarmDetectExport.exportGPKG(state.filteredData, state.exportName);
      } else {
        await window.FarmDetectExport.exportShapefile(state.filteredData, state.exportName);
      }
      setStatus(`Downloaded ${kind.toUpperCase()} export.`);
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
