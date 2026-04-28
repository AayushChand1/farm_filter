(function () {
  function applyFilters(featureCollection, filters) {
    return {
      type: "FeatureCollection",
      features: featureCollection.features.filter((feature) => {
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

  function sliderMax(values, fallback, padding) {
    if (!values.length) {
      return fallback;
    }
    return Math.max(fallback, Math.ceil(Math.max.apply(null, values) + padding));
  }

  function configureSliders(featureCollection, elements) {
    const features = featureCollection.features || [];
    const areas = features.map((feature) => Number((feature.properties || {}).area || 0));
    const ratios = features.map((feature) => Number((feature.properties || {}).ratio || 0));

    elements.areaSlider.max = String(sliderMax(areas, 100, 10));
    elements.ratioSlider.max = String(sliderMax(ratios, 5, 1));
  }

  window.FarmDetectFilters = {
    applyFilters,
    configureSliders,
  };
})();
