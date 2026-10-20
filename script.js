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
  const minRightPadScreen = hasLabels ? 90 : 10;

  stage.style.paddingLeft = `${Math.round(minLeftPadScreen / currentZoom)}px`;
  stage.style.paddingRight = `${Math.round(minRightPadScreen / currentZoom)}px`;
}

async function loadData() {
  try {
    const response = await fetch('budynki.json');
    buildingsData = await response.json();
    renderGrid(buildingsData);
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
      const imgH = img.offsetHeight > 0 ? img.offsetHeight : ((img.naturalHeight || 400) * scale);
      if (imgH > maxBuildingHeight) {
        maxBuildingHeight = imgH;
      }
    }
  });

  const isZoomedIn = currentZoom > 1.2;

  buildingItems.forEach((item, index) => {
    const ui = item.querySelector('.building-ui');
    const img = item.querySelector('img');
    if (!ui || !img) return;

    const scale = parseFloat(img.dataset.scale || 1);
    const currentHeight = img.offsetHeight > 0 ? img.offsetHeight : ((img.naturalHeight || 400) * scale);
    const heightDiff = maxBuildingHeight - currentHeight;

    const dynamicMargin = Math.round(currentHeight * 0.15);
    item.style.marginRight = `${dynamicMargin}px`;

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

function updateStageHeight() {
  const wrapper = document.getElementById('stageWrapper');
  const stage = document.getElementById('stage');
  const buildingItems = stage.querySelectorAll('.building-item');

  if (buildingItems.length === 0) {
    stage.style.height = '';
    renderHeightGrid();
    return;
  }

  let maxBHeight = 0;
  buildingItems.forEach(item => {
    const img = item.querySelector('img');
    if (img) {
      const scale = parseFloat(img.dataset.scale || 1);
      const imgH = img.offsetHeight > 0 ? img.offsetHeight : ((img.naturalHeight || 400) * scale);
      if (imgH > maxBHeight) {
        maxBHeight = imgH;
      }
    }
  });

  const showNames = document.getElementById('showNamesCheckbox')?.checked ?? true;
  const showHeight = document.getElementById('showHeightCheckbox')?.checked ?? true;
  const showYears = document.getElementById('showYearsCheckbox')?.checked ?? true;
  const hasLabels = showNames || showHeight || showYears;

  let neededH;

  if (!hasLabels) {
    // Tryb czystego wykresu (bez etykiet): ciasne dopasowanie do najwyższego budynku + 15% naddatku na górze
    neededH = maxBHeight * 1.15;
    
    // Zabezpieczenie minimalnej wysokości, żeby niższe sety pomieściły siatkę (np. linię 50m)
    if (neededH < 500) {
      neededH = 500;
    }
  } else {
    // Tryb z etykietami: zachowujemy oryginalną logikę zapewniającą miejsce na opisy
    const wrapperH = wrapper.clientHeight || 500;
    const topPaddingScreen = 270;
    const safeTopPadding = Math.min(topPaddingScreen, wrapperH - 100);
    const targetBuildingScreenH = Math.max(50, wrapperH - safeTopPadding);
    neededH = maxBHeight > 0 ? (maxBHeight * wrapperH / targetBuildingScreenH) : wrapperH;
  }

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
    showGridCheckbox.checked = true; 
    showGridCheckbox.addEventListener('change', toggleGridControls);
  }

  document.querySelectorAll('input[name="gridUnit"]').forEach(radio => {
    radio.addEventListener('change', renderHeightGrid);
  });

  toggleGridControls();

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

    const has100mLine = maxMeters >= 100;
    const loopMax = Math.max(maxMeters, has100mLine ? 0 : 50);

    for (let m = minorStep; m <= loopMax; m += minorStep) {
      const bottomPx = m * PIXELS_PER_METER;
      if (has100mLine && bottomPx > stageHeight) break;

      let isMajor = (m % majorStep === 0);
      let labelText = isMajor ? `${m}m` : null;

      if (!has100mLine && m === 50) {
        isMajor = true;
        labelText = '50m';
      }

      createGridLine(gridOverlay, bottomPx, labelText, isMajor);
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
  renderHeightGrid();
}

function fitToStage() {
  updateStageHeight();
  updateDynamicPadding();
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

  const showNames = document.getElementById('showNamesCheckbox')?.checked ?? true;
  const showHeight = document.getElementById('showHeightCheckbox')?.checked ?? true;
  const showYears = document.getElementById('showYearsCheckbox')?.checked ?? true;
  const hasLabels = showNames || showHeight || showYears;

  const wrapperW = stageDim.wrapperW;
  const wrapperH = stageDim.wrapperH;

  let newZoom;
  if (!hasLabels) {
    let maxBHeight = 0;
    buildingItems.forEach(item => {
      const img = item.querySelector('img');
      if (img) {
        const scale = parseFloat(img.dataset.scale || 1);
        const imgH = img.offsetHeight > 0 ? img.offsetHeight : ((img.naturalHeight || 400) * scale);
        if (imgH > maxBHeight) maxBHeight = imgH;
      }
    });

    const targetH = wrapperH - 55;
    const zoomY = maxBHeight > 0 ? (targetH / maxBHeight) : 1;

    const leftPad = 55;
    const rightPad = 15;
    const availableW = wrapperW - leftPad - rightPad;
    
    const baseContentW = stageDim.stageW - (leftPad / (currentZoom || 1));
    const zoomX = baseContentW > 0 ? (availableW / baseContentW) : 1;

    newZoom = Math.max(zoomX, zoomY);

    const maxAllowedZoomByHeight = targetH / maxBHeight;
    const maxAllowedZoomByWidth = availableW / baseContentW;
    
    newZoom = Math.min(newZoom, maxAllowedZoomByHeight, maxAllowedZoomByWidth);
    if (isNaN(newZoom) || newZoom <= 0) newZoom = 1;

  } else {
    const scaleX = wrapperW / stageDim.stageW;
    const scaleY = wrapperH / stageDim.stageH;
    newZoom = Math.min(scaleX, scaleY, 1);
  }

  if (isNaN(newZoom) || !isFinite(newZoom) || newZoom <= 0) {
    newZoom = 1;
  }

  currentZoom = newZoom;

  updateDynamicPadding();
  updateDimensionsCache();

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

  const scaleMultiplier = (building.scale_multiplier !== undefined && building.scale_multiplier !== null) ? Number(building.scale_multiplier) : 1;

  item.innerHTML = `
    <div class="building-ui">
      <div class="building-info">
        ${uiContent}
      </div>
    </div>
    <img src="${building.image_2d}" alt="${building.name}" data-scale="${scaleMultiplier}">
  `;

  const img = item.querySelector('img');
  
  const handleImageReady = () => {
    const natH = img.naturalHeight || 400;
    img.style.height = (natH * scaleMultiplier) + 'px';
    img.style.width = 'auto';
    img.style.transformOrigin = 'bottom center';
    fitToStage();
  };

  if (img.complete) {
    requestAnimationFrame(handleImageReady);
  } else {
    img.onload = handleImageReady;
  }

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

setupFilters();

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
