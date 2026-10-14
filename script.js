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
    right: 15px !important;
    z-index: 10000 !important;
  }
`;
document.head.appendChild(injectedStyles);

document.addEventListener('DOMContentLoaded', () => {
  loadBuildings();
  setupUIEventListeners();
  setupPanAndZoom();
});

async function loadBuildings() {
  try {
    const response = await fetch('budynki.json');
    buildingsData = await response.json();
    renderGrid(buildingsData);
  } catch (error) {
    console.error('Błąd ładowania bazy budynków:', error);
  }
}

function renderGrid(data) {
  const gridEl = document.getElementById('buildingsGrid');
  if (!gridEl) return;
  
  gridEl.innerHTML = '';
  data.forEach(building => {
    const card = document.createElement('div');
    card.className = 'building-card';
    card.innerHTML = `
      <img src="${building.thumbnail}" alt="${building.name}" loading="lazy">
      <h3>${building.name}</h3>
      <p>${building.city}, ${building.country}</p>
      <span>${building.height_m}</span>
    `;
    card.addEventListener('click', () => addBuildingToStage(building));
    gridEl.appendChild(card);
  });
}

function parseHeightMeters(heightStr) {
  if (!heightStr) return 0;
  const match = String(heightStr).match(/^([\d.]+)\s*m/);
  return match ? parseFloat(match[1]) : parseFloat(heightStr) || 0;
}

function addBuildingToStage(building) {
  if (addedBuildings.has(building.id)) return;
  addedBuildings.add(building.id);

  const stage = document.getElementById('stage');
  const heightMeters = parseHeightMeters(building.height_m);
  
  const scaleMultiplier = building.scale_multiplier !== undefined ? building.scale_multiplier : 1.0;
  const calculatedHeightPx = heightMeters * PIXELS_PER_METER * scaleMultiplier;

  const itemEl = document.createElement('div');
  itemEl.className = 'stage-building-item';
  itemEl.dataset.id = building.id;

  itemEl.innerHTML = `
    <img src="${building.image_2d}" alt="${building.name}" style="height: ${calculatedHeightPx}px;">
    <div class="building-info">
      <span class="b-name">${building.name}</span>
      <span class="b-height">${building.height_m}</span>
      <span class="b-year">Rok: ${building.year_built}</span>
    </div>
    <button class="remove-btn" style="position:absolute; top:0; right:0; background:rgba(0,0,0,0.6); color:#fff; border:none; border-radius:50%; width:20px; height:20px; font-size:10px; cursor:pointer; display:none;">×</button>
  `;

  itemEl.addEventListener('mouseenter', () => itemEl.querySelector('.remove-btn').style.display = 'block');
  itemEl.addEventListener('mouseleave', () => itemEl.querySelector('.remove-btn').style.display = 'none');
  
  itemEl.querySelector('.remove-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    addedBuildings.delete(building.id);
    itemEl.remove();
  });

  stage.appendChild(itemEl);
}

function clearStage() {
  const stage = document.getElementById('stage');
  stage.innerHTML = '';
  addedBuildings.clear();
}

function toggleFullscreen() {
  isFullscreen = !isFullscreen;
  const wrapper = document.getElementById('stageWrapper');
  wrapper.classList.toggle('fullscreen', isFullscreen);
  const btn = document.getElementById('toggleFsBtn');
  btn.textContent = isFullscreen ? 'Close Interactive Canvas' : 'Open Interactive Canvas';
}

function setupUIEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      const filtered = buildingsData.filter(b => 
        b.name.toLowerCase().includes(term) ||
        b.city.toLowerCase().includes(term) ||
        b.country.toLowerCase().includes(term)
      );
      renderGrid(filtered);
    });
  }

  const stage = document.getElementById('stage');
  
  const namesCb = document.getElementById('showNamesCheckbox');
  if (namesCb) {
    namesCb.addEventListener('change', (e) => stage.classList.toggle('hide-names', !e.target.checked));
    stage.classList.add('hide-names');
  }

  const heightCb = document.getElementById('showHeightCheckbox');
  if (heightCb) {
    heightCb.addEventListener('change', (e) => stage.classList.toggle('hide-height', !e.target.checked));
    stage.classList.add('hide-height');
  }

  const yearsCb = document.getElementById('showYearsCheckbox');
  if (yearsCb) {
    yearsCb.addEventListener('change', (e) => stage.classList.toggle('hide-years', !e.target.checked));
    stage.classList.add('hide-years');
  }

  const gridCb = document.getElementById('showGridCheckbox');
  if (gridCb) {
    gridCb.addEventListener('change', (e) => stage.classList.toggle('show-grid', e.target.checked));
  }
}

function setupPanAndZoom() {
  const wrapper = document.getElementById('stageWrapper');
  let isDragging = false;
  let startX = 0, startY = 0;

  wrapper.addEventListener('mousedown', (e) => {
    if (e.target.closest('.stage-building-item')) return;
    isDragging = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    wrapper.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    updateStageTransform();
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    wrapper.style.cursor = 'default';
  });

  wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const oldZoom = currentZoom;
    
    if (e.deltaY < 0) {
      currentZoom *= (1 + zoomIntensity);
    } else {
      currentZoom /= (1 + zoomIntensity);
    }

    currentZoom = Math.max(0.2, Math.min(5, currentZoom));

    const rect = wrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    panX = mouseX - (mouseX - panX) * (currentZoom / oldZoom);
    panY = mouseY - (mouseY - panY) * (currentZoom / oldZoom);

    updateStageTransform();
  }, { passive: false });
}

function updateStageTransform() {
  const stage = document.getElementById('stage');
  if (!stage) return;
  stage.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
}
