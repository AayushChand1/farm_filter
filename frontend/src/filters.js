(function () {
  function applyFilters(featureCollection, filters) {
    return {
      type: "FeatureCollection",
      features: (featureCollection.features || []).filter((feature) => {
        const props = feature.properties || {};
        const area = Number(props.area || 0);
        const ratio = Number(props.ratio || 0);
        const orientation = Number(props.orientation || 0);

        const areaOk = !filters.area.enabled || area >= filters.area.value;
        const ratioOk = !filters.ratio.enabled || ratio >= filters.ratio.value;
        const angleOk = !filters.angle.enabled || orientation >= filters.angle.value;

        return areaOk && ratioOk && angleOk;
      }),
    };
  }

  function configureSliders(sliderBounds, elements) {
    if (!sliderBounds) {
      return;
    }

    elements.areaSlider.max = String(sliderBounds.areaMax || 100);
    elements.ratioSlider.max = String(sliderBounds.ratioMax || 5);
    elements.angleSlider.max = String(sliderBounds.angleMax || 90);
  }

  window.FarmDetectFilters = {
    applyFilters,
    configureSliders,
  };
})();
