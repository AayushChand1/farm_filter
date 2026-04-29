(function () {
  function configureSliders(sliderBounds, elements) {
    if (!sliderBounds) {
      return;
    }

    elements.areaSlider.max = String(sliderBounds.areaMax || 100);
    elements.ratioSlider.max = String(sliderBounds.ratioMax || 5);
    elements.angleSlider.max = String(sliderBounds.angleMax || 90);
  }

  window.FarmDetectFilters = {
    configureSliders,
  };
})();
