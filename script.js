
const PIXELS_PER_METER = 10;
const MIN_SCREEN_PADDING = 55;

const CANVAS_TOP_MARGIN = 0.20;
const EMPTY_CANVAS_HEIGHT = 450;
const STAGE_BORDER = 12;

let buildingsData = [];
let currentZoom = 1;
let panX = 0;
let panY = 0;

let isFullscreen = false;
let ticking = false;
let isExporting = false;

let stageDim = {
  wrapperW: 0,
  wrapperH: 0,
  stageW: 0,
  stageH: 0
};

let addedBuildings = new Set();


/* BUILDING DIMENSIONS */

function getBuildingHeight(img) {
  if (!img) return 0;

  const scale = Number(img.dataset.scale || 1);

  return img.offsetHeight ||
    ((img.naturalHeight || 0) * scale);
}

function getMaxBuildingHeight() {
  const images = Array.from(
    document.querySelectorAll('#stage .building-item img')
  );

  return Math.max(0, ...images.map(getBuildingHeight));
}


/* DYNAMIC PADDING */

function updateDynamicPadding() {
  const stage = document.getElementById('stage');
  if (!stage) return;

  const zoom = Math.max(currentZoom, 0.001);

  stage.style.paddingLeft =
    `${Math.round(55 / zoom)}px`;

  stage.style.paddingRight =
    `${Math.round(10 / zoom)}px`;
}


/* LOAD JSON */

async function loadData() {
  try {
    const response = await fetch('budynki.json');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    buildingsData = await response.json();

    renderGrid(buildingsData);
    initInteractions();
    renderComparisonTable();
    fitToStage();

  } catch (e) {
    console.error('JSON loading error:', e);
  }
}


/* DIMENSIONS CACHE */

function updateDimensionsCache() {
  const wrapper = document.getElementById('stageWrapper');
  const stage = document.getElementById('stage');

  stageDim.wrapperW = wrapper.clientWidth || 1;
  stageDim.wrapperH = wrapper.clientHeight || 1;
  stageDim.stageW = stage.scrollWidth || 1;
  stageDim.stageH = stage.offsetHeight || 1;
}


/* BUILDING UI AND GRID LABELS */

function updateBuildingUI() {
  const inverseScale = 1 / Math.max(currentZoom, 0.001);

  document.querySelectorAll('.grid-label').forEach(label => {
    label.style.transform = `scale(${inverseScale})`;
  });

  const items = Array.from(
    document.querySelectorAll('#stage .building-item')
  );

  items.forEach(item => {
    const img = item.querySelector('img');

    if (!img) return;

    const height = getBuildingHeight(img);
    const halfMargin = Math.round((height * 0.15) / 2);

    item.style.marginLeft = `${halfMargin}px`;
    item.style.marginRight = `${halfMargin}px`;
  });
}


/* FULLSCREEN */

function toggleFullscreen() {
  const wrapper = document.getElementById('stageWrapper');
  const btn = document.getElementById('toggleFsBtn');

  isFullscreen = !isFullscreen;

  wrapper.classList.toggle('fullscreen', isFullscreen);
  document.body.classList.toggle('no-scroll', isFullscreen);

  if (btn) {
    btn.innerText = isFullscreen
      ? 'Exit Canvas'
      : 'Open Interactive Canvas';
  }

  if (isFullscreen) {
    wrapper.style.height = '';
  }

  requestAnimationFrame(() => fitToStage());
}


/* AUTOMATIC CANVAS HEIGHT */

function updateStageHeight() {
  const stage = document.getElementById('stage');

  const maxHeight = getMaxBuildingHeight();

  const count = stage.querySelectorAll(
    '.building-item'
  ).length;

  if (!count || !maxHeight) {
    stage.style.height = EMPTY_CANVAS_HEIGHT + 'px';

  } else {
    // The canvas height depends only on the buildings.
    // The table never participates in these calculations.

    const targetHeight =
      maxHeight * (1 + CANVAS_TOP_MARGIN);

    stage.style.height =
      Math.ceil(targetHeight + STAGE_BORDER) + 'px';
  }

  renderHeightGrid();
}


/* PAN LIMITS */

function clampPan() {
  if (!isFullscreen) {
    panX = 0;
    panY = 0;
    return;
  }

  const {
    wrapperW,
    wrapperH,
    stageW,
    stageH
  } = stageDim;

  const scaledH = stageH * currentZoom;
  const scaledW = stageW * currentZoom;

  if (scaledH <= wrapperH) {
    panY = wrapperH - scaledH;
  } else {
    panY = Math.min(
      0,
      Math.max(wrapperH - scaledH, panY)
    );
  }

  if (scaledW > wrapperW) {
    panX = Math.min(
      0,
      Math.max(wrapperW - scaledW, panX)
    );
  } else {
    panX = 0;
  }
}


/* APPLY TRANSFORM */

function applyTransform() {
  if (ticking) return;

  ticking = true;

  requestAnimationFrame(() => {
    updateDynamicPadding();
    updateDimensionsCache();
    clampPan();

    const zoomValue = document.getElementById('zoomVal');

    if (zoomValue) {
      zoomValue.innerText =
        `${Math.round(currentZoom * 100)}%`;
    }

    document.getElementById('stage').style.transform =
      `translate3d(${panX}px, ${panY}px, 0) scale(${currentZoom})`;

    updateBuildingUI();

    ticking = false;
  });
}


/* FIT CANVAS TO BUILDINGS */

function fitToStage() {
  const stage = document.getElementById('stage');
  const wrapper = document.getElementById('stageWrapper');

  if (!stage || !wrapper) return;

  const items = stage.querySelectorAll('.building-item');

  if (!isFullscreen) {
    wrapper.style.height = EMPTY_CANVAS_HEIGHT + 'px';
  }

  if (!items.length) {
    currentZoom = 1;

    updateDynamicPadding();
    updateStageHeight();

    panX = 0;
    panY = 0;

    applyTransform();
    return;
  }

  let zoom = 1;

  const wrapperW = wrapper.clientWidth || 1;
  const wrapperH = wrapper.clientHeight || EMPTY_CANVAS_HEIGHT;

  // Fit the canvas using its own dimensions.
  // Table visibility does not affect zoom or building positions.

  for (let i = 0; i < 8; i++) {
    currentZoom = zoom;

    updateDynamicPadding();
    updateBuildingUI();
    updateStageHeight();
    updateDimensionsCache();

    const horizontalPadding = 65;

    const widthFit = Math.max(
      0.001,
      (wrapperW - horizontalPadding) /
      Math.max(
        1,
        stageDim.stageW - horizontalPadding / zoom
      )
    );

    const heightFit = isFullscreen
      ? wrapperH / Math.max(1, stageDim.stageH)
      : Infinity;

    const next = Math.min(1, widthFit, heightFit);

    if (!Number.isFinite(next) || next <= 0) {
      break;
    }

    if (Math.abs(next - zoom) < 0.0001) {
      zoom = next;
      break;
    }

    zoom = next;
  }

  currentZoom = zoom;

  updateDynamicPadding();
  updateBuildingUI();
  updateStageHeight();
  updateDimensionsCache();

  if (!isFullscreen) {
    wrapper.style.height =
      `${Math.ceil(stageDim.stageH * currentZoom)}px`;
  }

  panX = 0;

  panY = isFullscreen
    ? stageDim.wrapperH - stageDim.stageH * currentZoom
    : 0;

  applyTransform();
}


/* USER INTERACTIONS */

function initInteractions() {
  const wrapper = document.getElementById('stageWrapper');

  /* SHOW DETAILS */

  const detailsCheckbox =
    document.getElementById('showDetailsCheckbox');

  if (detailsCheckbox) {
    detailsCheckbox.addEventListener('change', () => {
      renderComparisonTable();
    });
  }

  /* GRID */

  const gridCheckbox =
    document.getElementById('showGridCheckbox');

  if (gridCheckbox) {
    gridCheckbox.checked = true;

    gridCheckbox.addEventListener(
      'change',
      toggleGridControls
    );
  }

  document.querySelectorAll(
    'input[name="gridUnit"]'
  ).forEach(radio => {
    radio.addEventListener('change', () => {
      renderHeightGrid();
      renderComparisonTable();
    });
  });

  toggleGridControls();


  /* MOUSE WHEEL ZOOM */

  wrapper.addEventListener('wheel', e => {
    if (!isFullscreen) return;

    e.preventDefault();

    const factor = e.deltaY < 0
      ? 1.12
      : 1 / 1.12;

    const newZoom = Math.min(
      5,
      Math.max(0.05, currentZoom * factor)
    );

    const actualFactor = newZoom / currentZoom;
    const rect = wrapper.getBoundingClientRect();

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    panX =
      mouseX - MIN_SCREEN_PADDING -
      (mouseX - panX - MIN_SCREEN_PADDING) * actualFactor;

    panY =
      mouseY - (mouseY - panY) * actualFactor;

    currentZoom = newZoom;

    applyTransform();

  }, { passive: false });


  /* MOUSE DRAG */

  let isDown = false;
  let startX = 0;
  let startY = 0;

  wrapper.addEventListener('mousedown', e => {
    if (!isFullscreen) return;

    isDown = true;

    startX = e.clientX - panX;
    startY = e.clientY - panY;
  });

  window.addEventListener('mouseup', () => {
    isDown = false;
  });

  wrapper.addEventListener('mousemove', e => {
    if (!isDown || !isFullscreen) return;

    panX = e.clientX - startX;
    panY = e.clientY - startY;

    applyTransform();
  });


  /* TOUCH CONTROLS */

  let touchStartDist = 0;
  let touchStartZoom = 1;

  let touchStartPanX = 0;
  let touchStartPanY = 0;

  let touchStartMidX = 0;
  let touchStartMidY = 0;

  wrapper.addEventListener('touchstart', e => {
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

      touchStartMidX =
        (e.touches[0].clientX + e.touches[1].clientX) / 2 -
        rect.left;

      touchStartMidY =
        (e.touches[0].clientY + e.touches[1].clientY) / 2 -
        rect.top;

      touchStartZoom = currentZoom;

      touchStartPanX = panX;
      touchStartPanY = panY;
    }

  }, { passive: true });


  wrapper.addEventListener('touchmove', e => {
    if (!isFullscreen) return;

    if (e.touches.length >= 3) {
      isDown = false;
      touchStartDist = 0;
      return;
    }

    if (e.touches.length === 2) {
      if (e.cancelable) {
        e.preventDefault();
      }

      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );

      if (!dist || !touchStartDist) return;

      const rect = wrapper.getBoundingClientRect();

      const midX =
        (e.touches[0].clientX + e.touches[1].clientX) / 2 -
        rect.left;

      const midY =
        (e.touches[0].clientY + e.touches[1].clientY) / 2 -
        rect.top;

      const newZoom = Math.min(
        5,
        Math.max(
          0.05,
          touchStartZoom * dist / touchStartDist
        )
      );

      const scaleFactor = newZoom / touchStartZoom;

      panX =
        midX - MIN_SCREEN_PADDING -
        (touchStartMidX - touchStartPanX - MIN_SCREEN_PADDING) *
        scaleFactor;

      panY =
        midY -
        (touchStartMidY - touchStartPanY) * scaleFactor;

      currentZoom = newZoom;

      applyTransform();

    } else if (e.touches.length === 1 && isDown) {
      panX = e.touches[0].clientX - startX;
      panY = e.touches[0].clientY - startY;

      applyTransform();
    }

  }, { passive: false });


  wrapper.addEventListener('touchend', e => {
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

  window.addEventListener('resize', fitToStage);
}


/* HEIGHT GRID */

function renderHeightGrid() {
  const overlay = document.getElementById('gridOverlay');
  const checkbox = document.getElementById('showGridCheckbox');

  if (!overlay || !checkbox) return;

  overlay.innerHTML = '';

  if (!checkbox.checked) {
    overlay.style.display = 'none';
    return;
  }

  overlay.style.display = 'block';

  const unit = document.querySelector(
    'input[name="gridUnit"]:checked'
  )?.value || 'metric';

  const stageHeight =
    document.getElementById('stage')?.clientHeight ||
    EMPTY_CANVAS_HEIGHT;

  const maxMeters = stageHeight / PIXELS_PER_METER;

  if (unit === 'metric') {
    const has100 = maxMeters >= 100;

    const loopMax = Math.max(
      maxMeters,
      has100 ? 0 : 50
    );

    for (let m = 50; m <= loopMax; m += 50) {
      const bottomPx = m * PIXELS_PER_METER;

      if (has100 && bottomPx > stageHeight) {
        break;
      }

      const major =
        m % 100 === 0 || (!has100 && m === 50);

      createGridLine(
        overlay,
        bottomPx,
        major ? `${m}m` : null,
        major
      );
    }

  } else {
    const maxFeet = maxMeters / 0.3048;

    for (let ft = 100; ft <= maxFeet; ft += 100) {
      const bottomPx =
        ft * 0.3048 * PIXELS_PER_METER;

      if (bottomPx > stageHeight) break;

      const major = ft % 500 === 0;

      createGridLine(
        overlay,
        bottomPx,
        major ? `${ft}ft` : null,
        major
      );
    }
  }

  updateBuildingUI();
}


/* CREATE GRID LINE */

function createGridLine(container, bottomPx, labelText, isMajor) {
  const line = document.createElement('div');

  line.className =
    `grid-line ${isMajor ? 'major' : 'minor'}`;

  line.style.bottom = `${bottomPx}px`;

  if (labelText) {
    const label = document.createElement('span');

    label.className = 'grid-label';
    label.textContent = labelText;

    line.appendChild(label);
  }

  container.appendChild(line);
}


/* GRID CONTROLS */

function toggleGridControls() {
  const show =
    document.getElementById('showGridCheckbox')?.checked ??
    false;

  document.querySelectorAll(
    'input[name="gridUnit"]'
  ).forEach(radio => {
    radio.disabled = !show;
  });

  document.getElementById('unitSelector')
    ?.classList.toggle('disabled', !show);

  renderHeightGrid();
}


/* CLEAR CANVAS */

function clearStage() {
  document.querySelectorAll(
    '#stage .building-item'
  ).forEach(item => item.remove());

  addedBuildings.clear();

  filterData();
  renderComparisonTable();
  fitToStage();
}


/* REMOVE BUILDING */

function removeBuilding(name) {
  addedBuildings.delete(name);

  document.querySelectorAll(
    '#stage .building-item'
  ).forEach(item => {
    if (item.dataset.name === name) {
      item.remove();
    }
  });

  filterData();
  renderComparisonTable();
  fitToStage();
}


/* ADD BUILDING */

function addToStage(building) {
  if (addedBuildings.has(building.name)) return;

  addedBuildings.add(building.name);

  const stage = document.getElementById('stage');
  const item = document.createElement('div');

  item.className = 'building-item';
  item.dataset.name = building.name;

  const img = document.createElement('img');

  img.src = building.image_2d;
  img.alt = building.name;

  const scale = building.scale_multiplier != null
    ? Number(building.scale_multiplier)
    : 1;

  img.dataset.scale = String(
    Number.isFinite(scale) && scale > 0 ? scale : 1
  );

  item.appendChild(img);
  stage.appendChild(item);

  const ready = () => {
    img.style.height =
      `${img.naturalHeight * Number(img.dataset.scale)}px`;

    img.style.width = 'auto';
    img.style.transformOrigin = 'bottom center';

    fitToStage();
  };

  if (img.complete && img.naturalHeight) {
    requestAnimationFrame(ready);
  } else {
    img.onload = ready;

    img.onerror = () => {
      console.error('Image loading error:', img.src);
      fitToStage();
    };
  }

  filterData();
  renderComparisonTable();
  fitToStage();
}


/* RENDER BUILDING CARDS */

function renderGrid(data) {
  const grid = document.getElementById('buildingsGrid');

  if (!grid) return;

  grid.innerHTML = '';

  data.forEach(b => {
    const added = addedBuildings.has(b.name);

    const card = document.createElement('div');

    card.className = `card ${added ? 'added' : ''}`;

    if (added) {
      const indicator = document.createElement('div');

      indicator.className = 'card-remove-indicator';
      indicator.textContent = '×';

      card.appendChild(indicator);
    }

    const img = document.createElement('img');

    img.src = b.thumbnail;
    img.alt = b.name;

    card.appendChild(img);

    const title = document.createElement('h3');

    title.textContent = b.name;

    card.appendChild(title);

    const location = [b.city, b.country]
      .filter(Boolean)
      .join(', ');

    if (location) {
      const p = document.createElement('p');

      p.className = 'card-location';
      p.textContent = location;

      card.appendChild(p);
    }

    card.onclick = () => {
      if (addedBuildings.has(b.name)) {
        removeBuilding(b.name);
      } else {
        addToStage(b);
      }
    };

    grid.appendChild(card);
  });
}


/* SEARCH */

function setupFilters() {
  document.getElementById('searchInput')
    ?.addEventListener('input', filterData);
}

function filterData() {
  const search = (
    document.getElementById('searchInput')?.value || ''
  ).toLowerCase();

  const filtered = buildingsData.filter(b => {
    return [b.name, b.city, b.country].some(value =>
      (value || '').toLowerCase().includes(search)
    );
  });

  renderGrid(filtered);
}


/* TABLE: HEIGHT FORMATTING */

function getTableHeight(building) {
  const raw = String(building.height_m ?? '').trim();

  if (!raw || raw === 'N/A') {
    return 'N/A';
  }

  // The JSON stores metric and imperial values together.
  // Take the first value from each side of the slash.
  const parts = raw.split('/');

  const metric = parts[0]?.trim() || '';
  const imperial = parts[1]?.trim() || '';

  const unit = document.querySelector(
    'input[name="gridUnit"]:checked'
  )?.value || 'metric';

  if (unit === 'imperial') {
    const feetMatch = imperial.match(/^[\d,.]+(?:\s*ft)?/i);

    if (feetMatch) {
      const value = feetMatch[0].trim();

      return /\bft\b/i.test(value)
        ? value
        : `${value} ft`;
    }

    return imperial || 'N/A';
  }

  const metricMatch = metric.match(/^[\d,.]+(?:\s*m)?/i);

  if (metricMatch) {
    const value = metricMatch[0].trim();

    return /\bm\b/i.test(value)
      ? value
      : `${value} m`;
  }

  return metric || 'N/A';
}


/* TABLE: YEAR FORMATTING */

function getTableYear(building) {
  const year = building.year_built ?? building.built;

  if (year == null || String(year).trim() === '' ||
      String(year).trim() === 'N/A') {
    return 'N/A';
  }

  return String(year);
}


/* RENDER COMPARISON TABLE */

function renderComparisonTable() {
  const container = document.getElementById(
    'comparisonTableContainer'
  );

  const tbody = document.getElementById(
    'comparisonTableBody'
  );

  const checkbox = document.getElementById(
    'showDetailsCheckbox'
  );

  if (!container || !tbody || !checkbox) return;

  container.hidden = !checkbox.checked;
  tbody.innerHTML = '';

  if (!checkbox.checked) return;

  // Use the order in which the buildings appear on the canvas.
  const selectedNames = Array.from(
    document.querySelectorAll('#stage .building-item')
  ).map(item => item.dataset.name);

  selectedNames.forEach(name => {
    const building = buildingsData.find(
      item => item.name === name
    );

    if (!building) return;

    const row = document.createElement('tr');

    /* Thumbnail and name */

    const buildingCell = document.createElement('td');
    buildingCell.className = 'building-cell';

    const thumbnail = document.createElement('img');

    thumbnail.className = 'table-thumbnail';
    thumbnail.src = building.thumbnail;
    thumbnail.alt = '';

    thumbnail.onerror = () => {
      thumbnail.style.visibility = 'hidden';
    };

    const nameElement = document.createElement('span');

    nameElement.className = 'table-building-name';
    nameElement.textContent = building.name;

    buildingCell.appendChild(thumbnail);
    buildingCell.appendChild(nameElement);

    /* Height */

    const heightCell = document.createElement('td');

    heightCell.className = 'table-height';
    heightCell.textContent = getTableHeight(building);

    /* Year */

    const yearCell = document.createElement('td');

    yearCell.textContent = getTableYear(building);

    row.appendChild(buildingCell);
    row.appendChild(heightCell);
    row.appendChild(yearCell);

    tbody.appendChild(row);
  });
}


/* EXPORT ENTIRE COMPARISON AS PNG */

async function exportComparison() {
  if (isExporting) return;

  const area = document.getElementById(
    'capture-export-area'
  );

  const button = document.getElementById('exportBtn');

  if (!area) return;

  if (typeof html2canvas !== 'function') {
    alert(
      'The image export library could not be loaded. ' +
      'Check your internet connection and try again.'
    );
    return;
  }

  // Avoid exporting the fullscreen viewport/pan state.
  // Restore the normal canvas layout before capturing.
  if (isFullscreen) {
    toggleFullscreen();

    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  }

  isExporting = true;

  if (button) {
    button.disabled = true;
    button.textContent = 'Preparing image...';
  }

  try {
    // Make sure the table reflects the current checkbox state.
    renderComparisonTable();

    // Wait for layout and visible thumbnails to settle.
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

    const canvas = await html2canvas(area, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: area.clientWidth,
      height: area.scrollHeight,
      windowWidth: Math.max(
        document.documentElement.clientWidth,
        area.clientWidth
      ),
      scrollX: 0,
      scrollY: 0,
      ignoreElements: element => {
        return element.classList?.contains(
          'close-fullscreen-btn'
        );
      }
    });

    const link = document.createElement('a');

    link.download = 'building-comparison.png';
    link.href = canvas.toDataURL('image/png');

    document.body.appendChild(link);
    link.click();
    link.remove();

  } catch (error) {
    console.error('Image export error:', error);

    alert(
      'Could not create the image. Please try again.'
    );

  } finally {
    isExporting = false;

    if (button) {
      button.disabled = false;
      button.textContent = 'Download Image';
    }
  }
}


/* START APPLICATION */

setupFilters();
loadData();
