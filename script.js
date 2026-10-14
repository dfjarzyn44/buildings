const PIXELS_PER_METER = 10;
const MIN_SCREEN_PADDING = 55;

let buildingsData = [], currentZoom = 1, panX = 0, panY = 0;
let isFullscreen = false;
let stageDim = { wrapperW: 0, wrapperH: 0, stageW: 0, stageH: 0 };
let ticking = false;
let addedBuildings = new Set(); 

const injectedStyles = document.createElement('style');
injectedStyles.innerHTML = `
  #stageWrapper {
    touch-action: pan-x pan-y !important;
  }
  #stage {
    gap: 280px !important;
    box-sizing: border-box;
    transform-origin: 0 0 !important;
  }
  .stage-wrapper.fullscreen #toggleFsBtn {
    position: fixed !important;
    top: 15px !important;
