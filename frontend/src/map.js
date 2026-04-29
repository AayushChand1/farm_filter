(function () {
  const map = L.map("map", {
    preferCanvas: true,
    scrollWheelZoom: true,
  }).setView([28.2, 84.1], 8);

  const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 22,
  });

  const satelliteLayer = L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    attribution: "&copy; Google",
    maxZoom: 22,
  });

  let activeBaseLayer = osmLayer.addTo(map);

  let geoJsonLayer = null;

  function renderLayer(featureCollection, style, onEachFeature, options) {
    if (geoJsonLayer) {
      map.removeLayer(geoJsonLayer);
    }

    geoJsonLayer = L.geoJSON(featureCollection, {
      style,
      onEachFeature,
    }).addTo(map);

    if (options && options.fitBounds && geoJsonLayer.getLayers().length > 0) {
      map.fitBounds(geoJsonLayer.getBounds(), { padding: [24, 24] });
    }
  }

  function clearLayer() {
    if (!geoJsonLayer) {
      return;
    }

    map.removeLayer(geoJsonLayer);
    geoJsonLayer = null;
  }

  function setBasemap(kind) {
    map.removeLayer(activeBaseLayer);
    activeBaseLayer = kind === "satellite" ? satelliteLayer : osmLayer;
    activeBaseLayer.addTo(map);
  }

  function setScrollWheelZoom(enabled) {
    if (enabled) {
      map.scrollWheelZoom.enable();
      return;
    }

    map.scrollWheelZoom.disable();
  }

  window.FarmDetectMap = {
    clearLayer,
    map,
    renderLayer,
    setBasemap,
    setScrollWheelZoom,
  };
})();
