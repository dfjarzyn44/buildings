const PIXELS_PER_METER = 10;
const MIN_SCREEN_PADDING = 55;

const CANVAS_TOP_MARGIN = 0.20;
const EMPTY_CANVAS_HEIGHT = 450;
const LABEL_TOP_SPACE = 270;
const STAGE_BORDER = 12;

let buildingsData = [];
let currentZoom = 1;
let panX = 0;
let panY = 0;

let isFullscreen = false;
let ticking = false;

let stageDim = {
  wrapperW: 0,
  wrapperH: 0,
  stageW: 0,
  stageH: 0
};

let addedBuildings = new Set();


/* LABEL VISIBILITY */

function hasVisibleLabels() {
  return [
    'showNamesCheckbox',
    'showHeightCheckbox',
    'showYearsCheckbox'
  ].some(id => {
    return document.getElementById(id)?.checked ?? false;
  });
}


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

  return Math.max(
    0,
    ...images.map(getBuildingHeight)
  );
}


/* DYNAMIC PADDING */

function updateDynamicPadding() {
  const stage = document.getElementById('stage');
  if (!stage) return;

  const labels = hasVisibleLabels();
  const zoom = Math.max(currentZoom, 0.001);

  const leftPadding = labels ? 80 : 55;
  const rightPadding = labels ? 90 : 10;

  stage.style.paddingLeft =
    `${Math.round(leftPadding / zoom)}px`;

  stage.style.paddingRight =
    `${Math.round(rightPadding / zoom)}px`;
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


/* BUILDING UI */

function updateBuildingUI() {
  const inverseScale = 1 / Math.max(currentZoom, 0.001);

  document.querySelectorAll('.grid-label').forEach(label => {
    label.style.transform = `scale(${inverseScale})`;
  });

  const items = Array.from(
    document.querySelectorAll('#stage .building-item')
  );

  const maxHeight = getMaxBuildingHeight();
  const zoomedIn = currentZoom > 1.2;

  items.forEach((item, index) => {
    const ui = item.querySelector('.building-ui');
    const img = item.querySelector('img');

    if (!ui || !img) return;

    const height = getBuildingHeight(img);

    const halfMargin = Math.round((height * 0.15) / 2);
    item.style.marginLeft = `${halfMargin}px`;
    item.style.marginRight = `${halfMargin}px`;

    let rowOffsetScreen = 30;

    if (!zoomedIn && items.length > 1) {
      rowOffsetScreen = [30, 105, 180][index % 3];
    }

    const totalShift =
      maxHeight - height + rowOffsetScreen * inverseScale;

    ui.style.transform =
      `scale(${inverseScale}) translateY(${-totalShift * currentZoom}px)`;
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

    stage.style.height =
      EMPTY_CANVAS_HEIGHT + 'px';

  } else if (!hasVisibleLabels()) {

    // No labels:
    // Tallest building + 20% empty space.
    // Ground stays at the bottom.

    const targetHeight =
      maxHeight * (1 + CANVAS_TOP_MARGIN);

    stage.style.height =
      Math.ceil(targetHeight + STAGE_BORDER) + 'px';

  } else {

    // Labels enabled:
    // Preserve additional space for staggered labels.

    const zoom = Math.max(currentZoom, 0.001);

    const targetHeight =
      maxHeight + LABEL_TOP_SPACE / zoom;

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

  const labels = hasVisibleLabels();

  const wrapperW = wrapper.clientWidth || 1;
  const wrapperH = wrapper.clientHeight || EMPTY_CANVAS_HEIGHT;

  // Iterative fitting accounts for dynamic padding,
  // which changes depending on the zoom level.

  for (let i = 0; i < 8; i++) {

    currentZoom = zoom;

    updateDynamicPadding();
    updateBuildingUI();
    updateStageHeight();
    updateDimensionsCache();

    const horizontalPadding = labels ? 170 : 65;

    const widthFit = Math.max(
      0.001,
      (wrapperW - horizontalPadding) /
      Math.max(
        1,
        stageDim.stageW - horizontalPadding / zoom
      )
    );

    // Compact preview uses width-based fitting.
    // Height follows the actual building comparison.

    const heightFit = (labels || isFullscreen)
      ? wrapperH / Math.max(1, stageDim.stageH)
      : Infinity;

    const next = Math.min(
      1,
      widthFit,
      heightFit
    );

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

  // Normal preview without labels:
  // Container height follows the scaled canvas.

  if (!isFullscreen && !labels) {
    wrapper.style.height =
      Math.ceil(stageDim.stageH * currentZoom) + 'px';
  }

  panX = 0;

  panY = isFullscreen
    ? stageDim.wrapperH - stageDim.stageH * currentZoom
    : 0;

  applyTransform();
}


/* USER INTERACTIONS */

function initInteractions() {
  const stage = document.getElementById('stage');

  const labelControls = [
    ['showNamesCheckbox', 'hide-names'],
    ['showHeightCheckbox', 'hide-height'],
    ['showYearsCheckbox', 'hide-years']
  ];

  labelControls.forEach(([id, cls]) => {
    const checkbox = document.getElementById(id);

    if (!checkbox) return;

    stage.classList.toggle(cls, !checkbox.checked);

    checkbox.addEventListener('change', () => {
      stage.classList.toggle(cls, !checkbox.checked);
      fitToStage();
    });
  });

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
    radio.addEventListener('change', renderHeightGrid);
  });

  toggleGridControls();

  const wrapper = document.getElementById('stageWrapper');


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

  const checkbox =
    document.getElementById('showGridCheckbox');

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

  let heightStr = '';

  if (building.height_m && building.height_m !== 'N/A') {

    heightStr = `${building.height_m} m`;

    if (building.height_ft && building.height_ft !== 'N/A') {
      heightStr += ` / ${building.height_ft} ft`;
    }

  } else if (building.height_ft && building.height_ft !== 'N/A') {

    heightStr = `${building.height_ft} ft`;
  }

  const year = building.year_built || building.built;

  const builtStr =
    year && year !== 'N/A' ? String(year) : '';

  const info = document.createElement('div');
  info.className = 'building-ui';

  const bubble = document.createElement('div');
  bubble.className = 'building-info';

  const name = document.createElement('div');

  name.className = 'building-name';
  name.textContent = building.name;

  bubble.appendChild(name);

  if (heightStr) {
    const el = document.createElement('div');

    el.className = 'building-height';
    el.textContent = heightStr;

    bubble.appendChild(el);
  }

  if (builtStr) {
    const el = document.createElement('div');

    el.className = 'building-years';
    el.textContent = builtStr;

    bubble.appendChild(el);
  }

  info.appendChild(bubble);
  item.appendChild(info);

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


/* START APPLICATION */

setupFilters();
loadData();
