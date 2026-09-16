const PIXELS_PER_METER = 10;

let buildingsData = [], currentZoom = 1, panX = 0, panY = 0;
let isFullscreen = false;
let stageDim = { wrapperW: 0, wrapperH: 0, stageW: 0, stageH: 0 };
let ticking = false;
let addedBuildings = new Set(); 

const injectedStyles = document.createElement('style');
injectedStyles.innerHTML = `
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

function updateDimensionsCache() {
  const wrapper = document.getElementById('stageWrapper');
  const stage = document.getElementById('stage');

  stageDim.wrapperW = wrapper.clientWidth || 1;
  stageDim.wrapperH = wrapper.clientHeight || 1;
  stageDim.stageW = stage.scrollWidth || 1;
  stageDim.stageH = stage.offsetHeight || 1;
}

// INTELIGENTNY UKŁAD LOKALNY: DYMKI IDĄ WYŻEJ TYLKO W MIEJSCACH KOLIZJI
function updateBuildingUI() {
  const inverseScale = 1 / currentZoom;

  const gridLabels = document.querySelectorAll('.grid-label');
  gridLabels.forEach(label => {
    label.style.transform = `scale(${inverseScale})`;
  });

  const buildingItems = Array.from(document.querySelectorAll('#stage .building-item'));
  if (buildingItems.length === 0) return;

  // 1. Znajdujemy najwyższy budynek na scenie w pikselach
  let maxBuildingHeight = 0;
  buildingItems.forEach(item => {
    const img = item.querySelector('img');
    if (img && img.offsetHeight > maxBuildingHeight) {
      maxBuildingHeight = img.offsetHeight;
    }
  });

  // Jeśli użytkownik mocno przybliżył, wymuszamy bazowy układ nisko nad dachami
  const isZoomedIn = currentZoom > 1.2;

  // Sortujemy budynki od lewej do prawej na podstawie ich pozycji na scenie
  const sortedItems = [...buildingItems].sort((a, b) => a.offsetLeft - b.offsetLeft);

  // Definiujemy 3 poziomy wysokości (rzędy) w pikselach ekranu
  const rowOffsets = [30, 105, 180];
  const rowIntervals = [[], [], []]; // do śledzenia zajętości poziomej w rzędach
  const cardWidth = 190; // szacowana szerokość dymku z zapasem

  sortedItems.forEach(item => {
    const ui = item.querySelector('.building-ui');
    const img = item.querySelector('img');
    if (!ui || !img) return;

    const left = item.offsetLeft;
    const right = left + cardWidth;

    let assignedRow = 0;

    if (!isZoomedIn) {
      // Szukamy pierwszego rzędu od dołu, w którym nie ma kolizji w poziomie
      for (let r = 0; r < rowOffsets.length; r++) {
        let hasOverlap = false;
        for (const interval of rowIntervals[r]) {
          if (!(right + 15 < interval.left || left - 15 > interval.right)) {
            hasOverlap = true;
            break;
          }
        }
        if (!hasOverlap) {
          assignedRow = r;
          break;
        }
        assignedRow = rowOffsets.length - 1; // jak tłok wszędzie, dajemy w najwyższy rząd
      }
    }

    // Zapisujemy zajętość w wybranym rzędzie
    rowIntervals[assignedRow].push({ left, right });

    const rowOffsetScreen = rowOffsets[assignedRow];
    const currentHeight = img.offsetHeight;
    const heightDiff = maxBuildingHeight - currentHeight;

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
    btn.innerText = " Exit Canvas";
  } else {
    wrapper.classList.remove('fullscreen');
    document.body.classList.remove('no-scroll');
    btn.innerText = " Open Interactive Canvas";
  }

  fitToStage();
}

function updateStageHeight() {
  const wrapper = document.getElementById('stageWrapper');
  const stage = document.getElementById('stage');
  const buildingItems = stage.querySelectorAll('.building-item');

  let maxBHeight = 0;

  buildingItems.forEach(item => {
    if (item.offsetHeight > maxBHeight) {
      maxBHeight = item.offsetHeight;
    }
  });

  const wrapperH = wrapper.clientHeight;
  const neededH = maxBHeight > 0 ? (maxBHeight + 1500) : wrapperH;

  stage.style.height = neededH + 'px';
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
    const newZoom = Math.min(Math.max(currentZoom * factor, 0.05), 5);
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

  let lastTouchDist = 0;

  wrapper.addEventListener('touchstart', (e) => {
    if (!isFullscreen) return;

    if (e.touches.length === 1) {
      isDown = true;
      startX = e.touches[0].clientX - panX;
      startY = e.touches[0].clientY - panY;
    } else if (e.touches.length === 2) {
      isDown = false;
      lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (!isFullscreen) return;

    const rect = wrapper.getBoundingClientRect();

    if (e.touches.length === 1 && isDown) {
      panX = e.touches[0].clientX - startX;
      panY = e.touches[0].clientY - startY;
      applyTransform();
    } else if (e.touches.length === 2 && lastTouchDist > 0) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );

      if (currentDist === 0) return;

      const factor = currentDist / lastTouchDist;
      const newZoom = Math.min(Math.max(currentZoom * factor, 0.05), 5);
      const actualFactor = newZoom / currentZoom;

      const currentMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const currentMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

      panX = currentMidX - (currentMidX - panX) * actualFactor;
      panY = currentMidY - (currentMidY - panY) * actualFactor;
      currentZoom = newZoom;
      lastTouchDist = currentDist;

      applyTransform();
    }
  }, { passive: true });

  wrapper.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      lastTouchDist = 0;
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
    const items = stage.querySelectorAll('.building-item');
    items.forEach(item => item.remove());
  }
  addedBuildings.clear();
  filterData();
  fitToStage();
}

function fitToStage() {
  updateStageHeight();
  updateDimensionsCache();

  const stage = document.getElementById('stage');
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
  panY = stageDim.wrapperH - (stageDim.stageH * currentZoom);

  if (isNaN(panY)) {
    panY = 0;
  }

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

  item.innerHTML = `
    <div class="building-ui">
      <div class="building-info">
        ${uiContent}
      </div>
    </div>
    <img src="${building.image_2d}" alt="${building.name}">
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
