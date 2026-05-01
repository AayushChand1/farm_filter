(function () {
  function featureStyle() {
    return {
      color: "#185adb",
      weight: 1.2,
      fillColor: "#65a30d",
      fillOpacity: 0.35,
    };
  }

  function popupContent(feature) {
    const props = feature.properties || {};
    return [
      `<strong>${props.name || "Building"}</strong>`,
      `Area: ${Number(props.area || 0).toFixed(2)}`,
      `Ratio: ${Number(props.ratio || 0).toFixed(2)}`,
      `Orientation: ${Number(props.orientation || 0).toFixed(1)}°`,
      `Rectangularity: ${Number(props.rectangularity || 0).toFixed(2)}`,
    ].join("<br>");
  }

  function renderFeatures(featureCollection, options) {
    window.FarmDetectMap.renderLayer(
      featureCollection,
      featureStyle,
      (feature, layer) => {
        layer.bindPopup(popupContent(feature));
      },
      options || {}
    );
  }

  window.FarmDetectRender = {
    renderFeatures,
  };
})();
