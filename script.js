let buildingsData = [], currentZoom = 1, panX = 0, panY = 0;
let isFullscreen = false;
let stageDim = { wrapperW: 0, wrapperH: 0, stageW: 0, stageH: 0 };
let ticking = false;
let addedBuildings = new Set(); 

// Zaktualizowane style: 3px zielona ramka, delikatne rozjaśnienie (opacity: 0.85) i dyskretny krzyżyk
const injectedStyles = document.createElement('style');
injectedStyles.innerHTML = `
  .fullscreen .remove-btn { display: none !important; }
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
`;
document.head.appendChild(injectedStyles);

async function loadData() {
  try {
    const response = await fetch('budynki.json');
    buildingsData = await response.json();
    renderGrid(buildingsData);
    setupFilters();
    initInteractions();
  } catch (e) {
    console.error("Błąd ładowania JSON:", e);
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
  const uiElements = document.querySelectorAll('.building-ui');
  const inverseScale = 1 / currentZoom;

  uiElements.forEach(ui => {
    ui.style.transform = `scale(${inverseScale})`;
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
  const neededH = maxBHeight > 0 ? (maxBHeight + 200) : wrapperH;

  stage.style.height = neededH + 'px';
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

      document.getElementById('zoomVal').innerText =
        (isNaN(displayZoom) ? 100 : displayZoom) + '%';

      document.getElementById('stage').style.transform =
        `translate3d(${panX}px, ${panY}px, 0) scale(${currentZoom})`;

      updateBuildingUI();

      ticking = false;
    });

    ticking = true;
  }
}

function initInteractions() {
  const wrapper = document.getElementById('stageWrapper');
  const showInfoCheckbox = document.getElementById('showInfoCheckbox');

  showInfoCheckbox.addEventListener('change', (e) => {
    const stage = document.getElementById('stage');
    if (e.target.checked) {
      stage.classList.add('show-details');
    } else {
      stage.classList.remove('show-details');
    }
    setTimeout(fitToStage, 10);
  });

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
    if (!isFullscreen || e.target.closest('.remove-btn')) return;
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
  });
}

function clearStage() {
  const stage = document.getElementById('stage');
  stage.innerHTML = '';
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

  const built = building.built || 'N/A';
  const h_m = building.height_m || 'N/A';
  const h_ft = building.height_ft || 'N/A';
  const safeName = building.name.replace(/'/g, "\\'");

  item.innerHTML = `
    <div class="building-ui">
      <button class="remove-btn" onclick="removeBuilding('${safeName}')">&times;</button>
      <div class="building-info">
        <strong>${building.name}</strong>
        <div class="extra-info">
          Built: ${built}<br>
          Height: ${h_m}m / ${h_ft}ft
        </div>
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
  const search = document.getElementById('searchInput').value.toLowerCase();
  
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
