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
    box-sizing: border-box;
    transform-origin: 0 0 !important;
  }
  .stage-wrapper.fullscreen #toggleFsBtn {
    position: fixed !important;
    top: 15px !important;
    right: 15px !important;
    z-index: 9999 !important;
  }
  .card.added { border: 3px solid #28a745; position: relative; box-sizing: border-box; }
  .card.added img { opacity: 0.85; }
  .card-remove-indicator { 
    position: absolute; 
    top: 5px; 
    right: 8px; 
    color: #dc3545; 
    font-size: 22px; 
    font-weight: bold; 
    z-index: 10; 
    pointer-events: none; 
  }
  .building-ui {
    transition: transform 0.1s ease-out;
  }
  .grid-label {
    position: absolute;
    left: 4px;
    transform-origin: left center !important;
    white-space: nowrap;
  }
  .building-info {
    max-width: 120px !important;
    padding: 4px 6px !important;
    font-size: 11px !important;
    line-height: 1.2 !important;
    text-align: center;
  }
  .building-name {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-weight: bold;
    word-break: break-word;
  }
  .building-height, .building-years {
    white-space: nowrap !important;
    font-size: 10px !important;
  }
`;
document.head.appendChild(injectedStyles);

function updateDynamicPadding() {
  const stage = document.getElementById('stage');
  if (!stage) return;

  const showNames = document.getElementById('showNamesCheckbox')?.checked ?? true;
  const showHeight = document.getElementById('showHeightCheckbox')?.checked ?? true;
  const showYears = document.getElementById('showYearsCheckbox')?.checked ?? true;
  const hasLabels = showNames || showHeight || showYears;

  const minLeftPadScreen = hasLabels ? 80 : 55;

  stage.style.paddingLeft = `${Math.round(minLeftPadScreen / currentZoom)}px`;
  
  // Sztywny prawy bufor płótna: 100px
  stage.style.paddingRight = '100px';
}

async function loadData() {
  try {
    const response = await fetch('budynki.json');
    buildingsData = await response.json();
    renderGrid(buildingsData);
    setupFilters();
    initInteractions();
    renderHeightGrid();
  } catch (e) {
    console.error("JSON loading error:", e);
  }
}

function updateDimensionsCache() {
  const wrapper = document.getElementById('stageWrapper');
  const stage = document.getElementById('stage');

  stageDim.wrapperW = wrapper.clientWidth || 1;
  stageDim.wrapperH = wrapper.clientHeight || 1;
  stageDim.stageW = stage.scrollWidth || 1;
  stageDim.stageH = stage.offsetHeight || 1;
}

function updateBuildingUI() {
  const inverseScale = 1 / currentZoom;

  const gridLabels = document.querySelectorAll('.grid-label');
  gridLabels.forEach(label => {
    label.style.transform = `scale(${inverseScale})`;
  });

  const buildingItems = Array.from(document.querySelectorAll('#stage .building-item'));
  if (buildingItems.length === 0) return;

  let maxBuildingHeight = 0;
  buildingItems.forEach(item => {
    const img = item.querySelector('img');
    if (img) {
      const scale = parseFloat(img.dataset.scale || 1);
      const effHeight = img.offsetHeight * scale;
      if (effHeight > maxBuildingHeight) {
        maxBuildingHeight = effHeight;
      }
    }
  });

  const isZoomedIn = currentZoom > 1.2;

  buildingItems.forEach((item, index) => {
    const ui = item.querySelector('.building-ui');
    const img = item.querySelector('img');
    if (!ui || !img) return;

    // Sztywny odstęp 200px między budynkami (poza ostatnim)
    const isLast = (index === buildingItems.length - 1);
    item.style.marginRight = isLast ? '0px' : '200px';

    const scale = parseFloat(img.dataset.scale || 1);
    const currentHeight = img.offsetHeight * scale;
    const heightDiff = maxBuildingHeight - currentHeight;

    let rowOffsetScreen = 30;

    if (!isZoomedIn && buildingItems.length > 1) {
      const rowChoice = index % 3;
      if (rowChoice === 0) rowOffsetScreen = 30;
      else if (rowChoice === 1) rowOffsetScreen = 105;
      else rowOffsetScreen = 180;
    }

    const rowOffsetStage = rowOffsetScreen * inverseScale;
    const totalShiftPx = heightDiff + rowOffsetStage;

    const localY = -totalShiftPx * currentZoom;
    ui.style.transform = `scale(${inverseScale}) translateY(${localY}px)`;
  });

  // Synchronizacja szerokości siatki z faktyczną szerokością stage'a
  const gridOverlay = document.getElementById('gridOverlay');
  const stage = document.getElementById('stage');
  if (gridOverlay && stage) {
    gridOverlay.style.width = `${stage.scrollWidth}px`;
  }
}

function toggleFullscreen() {
  const wrapper = document.getElementById('stageWrapper');
  const btn = document.getElementById('toggleFsBtn');

  isFullscreen = !isFullscreen;

  if (isFullscreen) {
    wrapper.classList.add('fullscreen');
    document.body.classList.add('no-scroll');
    if (btn) btn.innerText = " Exit Canvas";
  } else {
    wrapper.classList.remove('fullscreen');
    document.body.classList.remove('no-scroll');
    if (btn) btn.innerText = " Open Interactive Canvas";
  }

  setTimeout(() => {
    fitToStage();
  }, 50);
}

function updateStageHeight() {
  const wrapper = document.getElementById('stageWrapper');
  const stage = document.getElementById('stage');
  const buildingItems = stage.querySelectorAll('.building-item');

  let maxBHeight = 0;
  buildingItems.forEach(item => {
    const img = item.querySelector('img');
    if (img) {
      const scale = parseFloat(img.dataset.scale || 1);
      const effHeight = img.offsetHeight * scale;
      if (effHeight > maxBHeight) {
        maxBHeight = effHeight;
      }
    }
  });

  const showNames = document.getElementById('showNamesCheckbox')?.checked ?? true;
  const showHeight = document.getElementById('showHeightCheckbox')?.checked ?? true;
  const showYears = document.getElementById('showYearsCheckbox')?.checked ?? true;
  const hasLabels = showNames || showHeight || showYears;

  const wrapperH = wrapper.clientHeight || 500;

  // Przestrzeń nad najwyższym budynkiem na dymki (gdy włączone)
  const topBuffer = hasLabels ? 400 : 100;
  
  // Faktyczna wysokość uwzględniająca giganty (>850m) i dymki bez sztucznych ograniczeń
  const neededH = maxBHeight > 0 ? (maxBHeight + topBuffer) : wrapperH;

  stage.style.height = `${Math.max(neededH, wrapperH)}px`;
  renderHeightGrid();
}

function clampPan() {
  const { wrapperW, wrapperH, stageW, stageH } = stageDim;
  const scaledH = stageH * currentZoom;
  const scaledW = stageW * currentZoom;

  if (scaledH <= wrapperH) {
    panY = wrapperH - scaledH;
  } else {
    const minPanY = wrapperH - scaledH;
    const maxPanY = 0;
    panY = Math.min(maxPanY, Math.max(minPanY, panY));
  }

  if (scaledW > wrapperW) {
    const minPanX = wrapperW - scaledW;
    panX = Math.min(0, Math.max(minPanX, panX));
  } else {
    panX = 0;
  }
}

function applyTransform() {
  if (!ticking) {
    requestAnimationFrame(() => {
      updateDynamicPadding();
      updateDimensionsCache();
      clampPan();

      const displayZoom = Math.round(currentZoom * 100);

      const zoomValElem = document.getElementById('zoomVal');
      if (zoomValElem) {
        zoomValElem.innerText = (isNaN(displayZoom) ? 100 : displayZoom) + '%';
      }

      document.getElementById('stage').style.transform =
        `translate3d(${panX}px, ${panY}px, 0) scale(${currentZoom})`;

      updateBuildingUI();

      ticking = false;
    });

    ticking = true;
  }
}

function initInteractions() {
  const stage = document.getElementById('stage');

  const showNamesCheckbox = document.getElementById('showNamesCheckbox');
  if (showNamesCheckbox) {
    showNamesCheckbox.addEventListener('change', (e) => {
      stage.classList.toggle('hide-names', !e.target.checked);
      fitToStage();
    });
  }

  const showHeightCheckbox = document.getElementById('showHeightCheckbox');
  if (showHeightCheckbox) {
    showHeightCheckbox.addEventListener('change', (e) => {
      stage.classList.toggle('hide-height', !e.target.checked);
      fitToStage();
    });
  }

  const showYearsCheckbox = document.getElementById('showYearsCheckbox');
  if (showYearsCheckbox) {
    showYearsCheckbox.addEventListener('change', (e) => {
      stage.classList.toggle('hide-years', !e.target.checked);
      fitToStage();
    });
  }

  const showGridCheckbox = document.getElementById('showGridCheckbox');
  if (showGridCheckbox) {
    showGridCheckbox.addEventListener('change', toggleGridControls);
  }

  document.querySelectorAll('input[name="gridUnit"]').forEach(radio => {
    radio.addEventListener('change', renderHeightGrid);
  });

  const wrapper = document.getElementById('stageWrapper');

  wrapper.addEventListener('wheel', (e) => {
    if (!isFullscreen) return;
    e.preventDefault();

    const zoomStep = 0.12;
    const factor = e.deltaY < 0 ? (1 + zoomStep) : (1 / (1 + zoomStep));
    const newZoom = Math.min(Math.max(currentZoom * factor, 0.05), 5);
    const actualFactor = newZoom / currentZoom;

    const rect = wrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    panX = mouseX - MIN_SCREEN_PADDING - (mouseX - panX - MIN_SCREEN_PADDING) * actualFactor;
    panY = mouseY - (mouseY - panY) * actualFactor;
    
    currentZoom = newZoom;
    applyTransform();
  }, { passive: false });

  let isDown = false;
  let startX, startY;
  let touchStartDist = 0;
  let touchStartZoom = 1;
  let touchStartPanX = 0, touchStartPanY = 0;
  let touchStartMidX = 0, touchStartMidY = 0;

  wrapper.addEventListener('mousedown', (e) => {
    if (!isFullscreen) return;
    isDown = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
  });

  window.addEventListener('mouseup', () => {
    isDown = false;
  });

  wrapper.addEventListener('mousemove', (e) => {
    if (!isDown || !isFullscreen) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    applyTransform();
  });

  wrapper.addEventListener('touchstart', (e) => {
    if (!isFullscreen) return;

    if (e.touches.length >= 3) {
      isDown = false;
      touchStartDist = 0;
      return;
    }

    if (e.touches.length === 1) {
      isDown = true;
      startX = e.touches[0].clientX - panX;
      startY = e.touches[0].clientY - panY;
    } else if (e.touches.length === 2) {
      isDown = false;
      touchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const rect = wrapper.getBoundingClientRect();
      touchStartMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      touchStartMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      touchStartZoom = currentZoom;
      touchStartPanX = panX;
      touchStartPanY = panY;
    }
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (!isFullscreen) return;

    if (e.touches.length >= 3) {
      isDown = false;
      touchStartDist = 0;
      return;
    }

    if (e.touches.length === 2) {
      if (e.cancelable) e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (currentDist === 0 || touchStartDist === 0) return;

      const rect = wrapper.getBoundingClientRect();
      const currentMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const currentMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

      const factor = currentDist / touchStartDist;
      const newZoom = Math.min(Math.max(touchStartZoom * factor, 0.05), 5);
      const scaleFactor = newZoom / touchStartZoom;

      panX = currentMidX - MIN_SCREEN_PADDING - (touchStartMidX - touchStartPanX - MIN_SCREEN_PADDING) * scaleFactor;
      panY = currentMidY - (touchStartMidY - touchStartPanY) * scaleFactor;

      currentZoom = newZoom;
      applyTransform();
    } else if (e.touches.length === 1 && isDown) {
      panX = e.touches[0].clientX - startX;
      panY = e.touches[0].clientY - startY;
      applyTransform();
    }
  }, { passive: false });

  wrapper.addEventListener('touchend', (e) => {
    if (e.touches.length >= 3) {
      isDown = false;
      touchStartDist = 0;
      return;
    }

    if (e.touches.length < 2) {
      touchStartDist = 0;
    }
    if (e.touches.length === 1) {
      isDown = true;
      startX = e.touches[0].clientX - panX;
      startY = e.touches[0].clientY - panY;
    } else {
      isDown = false;
    }
  });

  window.addEventListener('resize', () => {
    fitToStage();
    renderHeightGrid();
  });
}

function renderHeightGrid() {
  const gridOverlay = document.getElementById('gridOverlay');
  const showGridCheckbox = document.getElementById('showGridCheckbox');
  if (!gridOverlay || !showGridCheckbox) return;

  gridOverlay.innerHTML = '';

  if (!showGridCheckbox.checked) {
    gridOverlay.style.display = 'none';
    return;
  }

  gridOverlay.style.display = 'block';

  const unit = document.querySelector('input[name="gridUnit"]:checked')?.value || 'metric';
  const stage = document.getElementById('stage');
  const stageHeight = stage ? stage.clientHeight : 500;

  const maxMeters = stageHeight / PIXELS_PER_METER;

  if (unit === 'metric') {
    const minorStep = 50; 
    const majorStep = 100;

    for (let m = minorStep; m <= maxMeters; m += minorStep) {
      const bottomPx = m * PIXELS_PER_METER;
      if (bottomPx > stageHeight) break;

      const isMajor = (m % majorStep === 0);
      createGridLine(gridOverlay, bottomPx, isMajor ? `${m}m` : null, isMajor);
    }
  } else {
    const minorStepFt = 100;
    const majorStepFt = 500;
    const maxFeet = maxMeters / 0.3048;

    for (let ft = minorStepFt; ft <= maxFeet; ft += minorStepFt) {
      const meters = ft * 0.3048;
      const bottomPx = meters * PIXELS_PER_METER;
      if (bottomPx > stageHeight) break;

      const isMajor = (ft % majorStepFt === 0);
      createGridLine(gridOverlay, bottomPx, isMajor ? `${ft}ft` : null, isMajor);
    }
  }

  updateBuildingUI();
}

function createGridLine(container, bottomPx, labelText, isMajor) {
  const line = document.createElement('div');
  line.className = `grid-line ${isMajor ? 'major' : 'minor'}`;
  line.style.bottom = `${bottomPx}px`;

  if (labelText) {
    const label = document.createElement('span');
    label.className = 'grid-label';
    label.textContent = labelText;
    line.appendChild(label);
  }

  container.
