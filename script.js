const PIXELS_PER_METER = 10;

let buildingsData = [], currentZoom = 1, panX = 0, panY = 0;
let isFullscreen = false;
let stageDim = { wrapperW: 0, wrapperH: 0, stageW: 0, stageH: 0 };
let ticking = false;
let addedBuildings = new Set(); 

const injectedStyles = document.createElement('style');
injectedStyles.innerHTML = `
  #stageWrapper {
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 500px;
    background: #ffffff;
  }
  #stageWrapper.fullscreen {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 99999 !important;
    border-radius: 0 !important;
  }
  #stageWrapper.fullscreen #toggleFsBtn {
    position: fixed !important;
    top: 15px !important;
    right: 15px !important;
    z-index: 100000 !important;
  }
  #stage {
    display: flex;
    align-items: flex-end;
    gap: 280px !important;
    box-sizing: border-box;
    padding-left: 90px !important;
    padding-right: 80px !important;
    transform-origin: 0 100%;
    position: absolute;
    bottom: 0;
    left: 0;
  }
  #gridOverlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2;
  }
  .grid-line {
    position: absolute;
    left: 0;
    width: 100%;
    border-top: 1px dashed #e0e0e0;
  }
  .grid-line.major {
    border-top: 1px solid #ccc;
  }
  .grid-label {
    position: absolute;
    left: 10px;
    transform: translateY(50%);
    white-space: nowrap;
    font-weight: bold;
    color: #333;
    font-size: 13px;
  }
  .building-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
  }
  .building-item img {
    display: block;
    width: auto;
    object-fit: contain;
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
  body.no-scroll {
    overflow: hidden !important;
  }
`;
document.head.appendChild(injectedStyles);

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

function updateStageHeight() {
  const wrapper = document.getElementById('stageWrapper');
  const stage = document.getElementById('stage');
  if (!wrapper || !stage) return;

  const buildingItems = stage.querySelectorAll('.building-item');
  let maxBHeight = 0;

  buildingItems.forEach(item => {
    const img = item.querySelector('img');
    const h = img ? (img.offsetHeight || item.offsetHeight) : item.offsetHeight;
    if (h > maxBHeight) {
      maxBHeight = h;
    }
  });

  const wrapperH = wrapper.clientHeight || 500;
  const neededH = maxBHeight > 0 ? (maxBHeight + 200) : wrapperH;

  stage.style.height = neededH + 'px';
}

function updateDimensionsCache() {
  const wrapper = document.getElementById('stageWrapper');
  const stage = document.getElementById('stage');

  stageDim.wrapperW = wrapper ? wrapper.clientWidth : 1;
  stageDim.wrapperH = wrapper ? wrapper.clientHeight : 1;
  stageDim.stageW = stage ? stage.scrollWidth : 1;
  stageDim.stageH = stage ? stage.offsetHeight : 1;
}

function updateBuildingUI() {
  const inverseScale = 1 / currentZoom;
  const buildingItems = Array.from(document.querySelectorAll('#stage .building-item'));
  if (buildingItems.length === 0) return;

  let maxBuildingHeight = 0;
  buildingItems.forEach(item => {
    const img = item.querySelector('img');
    if (img && img.offsetHeight > maxBuildingHeight) {
      maxBuildingHeight = img.offsetHeight;
    }
  });

  const isZoomedIn = currentZoom > 1.2;

  buildingItems.forEach((item, index) => {
    const ui = item.querySelector('.building-ui');
    const img = item.querySelector('img');
    if (!ui || !img) return;

    const currentHeight = img.offsetHeight;
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

function clampPan() {
  const { wrapperW, wrapperH, stageW, stageH } = stageDim;
  const scaledH = stageH * currentZoom;
  const scaledW = stageW * currentZoom;

  if (scaledH <= wrapperH) {
    panY = 0;
  } else {
    const minPanY = 0;
    const maxPanY = scaledH - wrapperH;
    panY = Math.min(maxPanY, Math.max(minPanY, panY));
  }

  if (scaledW <= wrapperW) {
    panX = 0;
  } else {
    const minPanX = wrapperW - scaledW;
    const maxPanX = 0;
    panX = Math.min(maxPanX, Math.max(minPanX, panX));
  }
}

function applyTransform() {
  if (!ticking) {
    requestAnimationFrame(() => {
      clampPan();

      const displayZoom = Math.round(currentZoom * 100);
      const zoomValElem = document.getElementById('zoomVal');
      if (zoomValElem) {
        zoomValElem.innerText = (isNaN(displayZoom) ? 100 : displayZoom) + '%';
      }

      document.getElementById('stage').style.transform =
        `translate3d(${panX}px, ${panY}px, 0) scale(${currentZoom})`;

      renderHeightGrid();

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
    });
  }

  const showHeightCheckbox = document.getElementById('showHeightCheckbox');
  if (showHeightCheckbox) {
    showHeightCheckbox.addEventListener('change', (e) => {
      stage.classList.toggle('hide-height', !e.target.checked);
    });
  }

  const showYearsCheckbox = document.getElementById('showYearsCheckbox');
  if (showYearsCheckbox) {
    showYearsCheckbox.addEventListener('change', (e) => {
      stage.classList.toggle('hide-years', !e.target.checked);
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
    const newZoom = Math.min(Math.max(currentZoom * factor, 0.03), 5);
    const actualFactor = newZoom / currentZoom;

    const rect = wrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    panX = mouseX - (mouseX - panX) * actualFactor;
    panY = mouseY - (mouseY - panY) * actualFactor;
    currentZoom = newZoom;

    applyTransform();
  }, { passive: false });

  let isDown = false;
  let startX, startY;
  let touchStartDist = 0;

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
    }
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (!isFullscreen) return;

    if (e.touches.length === 2) {
      if (e.cancelable) e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (currentDist === 0 || touchStartDist === 0) return;

      const factor = currentDist / touchStartDist;
      const newZoom = Math.min(Math.max(currentZoom * factor, 0.03), 5);

      currentZoom = newZoom;
      touchStartDist = currentDist;
      applyTransform();
    } else if (e.touches.length === 1 && isDown) {
      panX = e.touches[0].clientX - startX;
      panY = e.touches[0].clientY - startY;
      applyTransform();
    }
  }, { passive: false });

  wrapper.addEventListener('touchend', () => {
    isDown = false;
    touchStartDist = 0;
  });

  window.addEventListener('resize', () => {
    fitToStage();
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
  const stageH = stageDim.stageH || 500;
  const maxMeters = stageH / PIXELS_PER_METER;

  if (unit === 'metric') {
    const minorStep = 50; 
    const majorStep = 100;

    for (let m = minorStep; m <= maxMeters; m += minorStep) {
      const bottomPxStage = m * PIXELS_PER_METER;
      const bottomPxScreen = (bottomPxStage * currentZoom) - panY;

      if (bottomPxScreen < -20 || bottomPxScreen > stageDim.wrapperH + 20) continue;

      const isMajor = (m % majorStep === 0);
      createGridLine(gridOverlay, bottomPxScreen, isMajor ? `${m}m` : null, isMajor);
    }
  } else {
    const minorStepFt = 100;
    const majorStepFt = 500;
    const maxFeet = maxMeters / 0.3048;

    for (let ft = minorStepFt; ft <= maxFeet; ft += minorStepFt) {
      const meters = ft * 0.3048;
      const bottomPxStage = meters * PIXELS_PER_METER;
      const bottomPxScreen = (bottomPxStage * currentZoom) - panY;

      if (bottomPxScreen < -20 || bottomPxScreen > stageDim.wrapperH + 20) continue;

      const isMajor = (ft % majorStepFt === 0);
      createGridLine(gridOverlay, bottomPxScreen, isMajor ? `${ft}ft` : null, isMajor);
    }
  }

  updateBuildingUI();
}

function createGridLine(container, bottomPxScreen, labelText, isMajor) {
  const line = document.createElement('div');
  line.className = `grid-line ${isMajor ? 'major' : 'minor'}`;
  line.style.bottom = `${bottomPxScreen}px`;

  if (labelText) {
    const label = document.createElement('span');
    label.className = 'grid-label';
    label.textContent = labelText;
    line.appendChild(label);
  }

  container.appendChild(line);
}

function toggleGridControls() {
  const showGridCheckbox = document.getElementById('showGridCheckbox');
  const showGrid = showGridCheckbox ? showGridCheckbox.checked : false;
  const unitRadios = document.querySelectorAll('input[name="gridUnit"]');
  const unitSelector = document.getElementById('unitSelector');

  unitRadios.forEach(radio => {
    radio.disabled = !showGrid;
  });

  if (unitSelector) {
    unitSelector.classList.toggle('disabled', !showGrid);
  }

  renderHeightGrid();
}

function clearStage() {
  const stage = document.getElementById('stage');
  if (stage) {
    stage.innerHTML = '';
  }
  addedBuildings.clear();
  filterData();
  fitToStage();
}

function fitToStage() {
  updateStageHeight();
  updateDimensionsCache();

  const stage = document.getElementById('stage');
  if (!stage) return;

  const buildingItems = stage.querySelectorAll('.building-item');

  if (buildingItems.length === 0) {
    currentZoom = 1;
    panX = 0;
    panY = 0;
    applyTransform();
    return;
  }

  const scaleX = stageDim.wrapperW / stageDim.stageW;
  const scaleY = stageDim.wrapperH / stageDim.stageH;
  let newZoom = Math.min(scaleX, scaleY, 1);

  if (isNaN(newZoom) || !isFinite(newZoom) || newZoom <= 0) {
    newZoom = 1;
  }

  currentZoom = newZoom;
  panX = 0;
  panY = 0;

  applyTransform();
}

function removeBuilding(name) {
  addedBuildings.delete(name);
  const stage = document.getElementById('stage');
  const items = stage.querySelectorAll('.building-item');
  
  items.forEach(item => {
    if (item.dataset.name === name) {
      item.remove();
    }
  });

  filterData(); 
  fitToStage();
}

function addToStage(building) {
  if (addedBuildings.has(building.name)) return;
  addedBuildings.add(building.name);

  const stage = document.getElementById('stage');

  const item = document.createElement('div');
  item.className = 'building-item';
  item.dataset.name = building.name;

  let heightStr = '';
  if (building.height_m && building.height_m !== 'N/A') {
    heightStr = `${building.height_m} m`;
    if (building.height_ft && building.height_ft !== 'N/A') {
      heightStr += ` / ${building.height_ft} ft`;
    }
  } else if (building.height_ft && building.height_ft !== 'N/A') {
    heightStr = `${building.height_ft} ft`;
  }

  let builtStr = '';
  const year = building.year_built || building.built;
  if (year && year !== 'N/A') {
    builtStr = `${year}`;
  }

  let uiContent = `<div class="building-name">${building.name}</div>`;
  if (heightStr) {
    uiContent += `<div class="building-height">${heightStr}</div>`;
  }
  if (builtStr) {
    uiContent += `<div class="building-years">${builtStr}</div>`;
  }

  const imgHeightPx = (building.height_m && !isNaN(building.height_m)) ? (building.height_m * PIXELS_PER_METER) : null;

  item.innerHTML = `
    <div class="building-ui">
      <div class="building-info">
        ${uiContent}
      </div>
    </div>
    <img src="${building.image_2d}" alt="${building.name}" ${imgHeightPx ? `style="height: ${imgHeightPx}px;"` : ''}>
  `;

  const img = item.querySelector('img');
  img.onload = () => {
    fitToStage();
  };

  stage.appendChild(item);
  filterData(); 
  fitToStage();
}

function renderGrid(data) {
  const grid = document.getElementById('buildingsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  data.forEach(b => {
    const isAdded = addedBuildings.has(b.name);
    const card = document.createElement('div');
    card.className = `card ${isAdded ? 'added' : ''}`;

    const city = b.city || '';
    const country = b.country || '';
    const locationText = [city, country].filter(Boolean).join(', ');

    card.innerHTML = `
      ${isAdded ? `<div class="card-remove-indicator">&times;</div>` : ''}
      <img src="${b.thumbnail}" alt="${b.name}">
      <h3>${b.name}</h3>
      ${locationText ? `<p class="card-location">${locationText}</p>` : ''}
    `;

    card.onclick = () => {
      if (isAdded) {
        removeBuilding(b.name);
      } else {
        addToStage(b);
      }
    };

    grid.appendChild(card);
  });
}

function setupFilters() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', filterData);
  }
}

function filterData() {
  const searchInput = document.getElementById('searchInput');
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  
  const filtered = buildingsData.filter(b => {
    const name = (b.name || '').toLowerCase();
    const city = (b.city || '').toLowerCase();
    const country = (b.country || '').toLowerCase();
    
    return (
      name.includes(search) ||
      city.includes(search) ||
      country.includes(search)
    );
  });

  renderGrid(filtered);
}

loadData();
