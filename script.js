let zoomLevel = 1;
let isPanning = false;
let startX = 0, startY = 0;
let translateX = 0, translateY = 0;

let buildingsData = [];

const searchInput = document.getElementById('searchInput');
const buildingsGrid = document.getElementById('buildingsGrid');
const stage = document.getElementById('stage');
const stageWrapper = document.getElementById('stageWrapper');
const zoomVal = document.getElementById('zoomVal');
const showInfoCheckbox = document.getElementById('showInfoCheckbox');

fetch('data.json')
  .then(res => res.json())
  .then(data => {
    buildingsData = data;
    renderGrid(buildingsData);
  })
  .catch(err => console.error("Error loading data:", err));

function renderGrid(data) {
  buildingsGrid.innerHTML = '';
  data.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = () => addBuildingToStage(item);

    const locationText = [item.city, item.country].filter(Boolean).join(', ');

    card.innerHTML = `
      <img src="${item.image}" alt="${item.name}" loading="lazy">
      <h3>${item.name} (${item.height}m)</h3>
      ${locationText ? `<p class="card-location">${locationText}</p>` : ''}
    `;
    buildingsGrid.appendChild(card);
  });
}

searchInput.addEventListener('input', (e) => {
  const val = e.target.value.toLowerCase();
  const filtered = buildingsData.filter(item => 
    item.name.toLowerCase().includes(val) ||
    (item.city && item.city.toLowerCase().includes(val)) ||
    (item.country && item.country.toLowerCase().includes(val))
  );
  renderGrid(filtered);
});

function addBuildingToStage(item) {
  const bEl = document.createElement('div');
  bEl.className = 'building-item';
  
  const targetHeight = item.height * 2;

  const img = document.createElement('img');
  img.src = item.image;
  img.alt = item.name;
  img.style.height = `${targetHeight}px`;

  const uiContainer = document.createElement('div');
  uiContainer.className = 'building-ui-container';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.innerHTML = '✕';
  removeBtn.onclick = (e) => {
    e.stopPropagation();
    bEl.remove();
  };

  const info = document.createElement('div');
  info.className = 'building-info';
  
  const locationText = [item.city, item.country].filter(Boolean).join(', ');
  info.innerHTML = `
    <div>${item.name} (${item.height}m)</div>
    <div class="extra-info">
      ${item.year ? `<div>Built: ${item.year}</div>` : ''}
      ${locationText ? `<div>${locationText}</div>` : ''}
    </div>
  `;

  uiContainer.appendChild(removeBtn);
  uiContainer.appendChild(info);

  bEl.appendChild(uiContainer);
  bEl.appendChild(img);
  
  stage.appendChild(bEl);
  updateTransform();
}

function clearStage() {
  stage.innerHTML = '';
  resetTransform();
}

function updateTransform() {
  stage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoomLevel})`;
  stageWrapper.style.setProperty('--zoom-level', zoomLevel);
  zoomVal.innerText = `${Math.round(zoomLevel * 100)}%`;
}

function resetTransform() {
  zoomLevel = 1;
  translateX = 0;
  translateY = 0;
  updateTransform();
}

stageWrapper.addEventListener('mousedown', (e) => {
  if (e.target.closest('.building-ui-container') || e.target.closest('.close-fullscreen-btn')) return;
  isPanning = true;
  startX = e.clientX - translateX;
  startY = e.clientY - translateY;
});

window.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  translateX = e.clientX - startX;
  translateY = e.clientY - startY;
  updateTransform();
});

window.addEventListener('mouseup', () => { isPanning = false; });

stageWrapper.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = 1.1;
  if (e.deltaY < 0) {
    zoomLevel = Math.min(zoomLevel * zoomFactor, 5);
  } else {
    zoomLevel = Math.max(zoomLevel / zoomFactor, 0.2);
  }
  updateTransform();
}, { passive: false });

showInfoCheckbox.addEventListener('change', (e) => {
  if (e.target.checked) {
    stage.classList.add('show-details');
  } else {
    stage.classList.remove('show-details');
  }
});

function toggleFullscreen() {
  stageWrapper.classList.toggle('fullscreen');
  document.body.classList.toggle('no-scroll');
  const btn = document.getElementById('toggleFsBtn');
  if (stageWrapper.classList.contains('fullscreen')) {
    btn.innerText = 'Exit Canvas';
  } else {
    btn.innerText = 'Open Interactive Canvas';
  }
}
