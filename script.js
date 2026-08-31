// Stała skali: 1 px = 10 cm = 0.1 m -> 1 metr = 10 pikseli
const PIXELS_PER_METER = 10;

document.addEventListener('DOMContentLoaded', () => {
  initEvents();
  renderGrid();
});

function initEvents() {
  // Przełączanie widoczności siatki i odblokowywanie jednostek
  const showGridCheckbox = document.getElementById('showGridCheckbox');
  if (showGridCheckbox) {
    showGridCheckbox.addEventListener('change', toggleGridControls);
  }

  // Zmiana jednostek siatki (Metric / Imperial)
  document.querySelectorAll('input[name="gridUnit"]').forEach(radio => {
    radio.addEventListener('change', renderGrid);
  });

  // Przełączanie widoczności nazw budynków
  const showNamesCheckbox = document.getElementById('showNamesCheckbox');
  if (showNamesCheckbox) {
    showNamesCheckbox.addEventListener('change', (e) => {
      document.getElementById('stage')?.classList.toggle('hide-names', !e.target.checked);
    });
  }

  // Obsługa zmiany rozmiaru okna
  window.addEventListener('resize', () => {
    renderGrid();
  });
}

function toggleGridControls() {
  const showGrid = document.getElementById('showGridCheckbox').checked;
  const unitRadios = document.querySelectorAll('input[name="gridUnit"]');
  const unitSelector = document.getElementById('unitSelector');

  unitRadios.forEach(radio => {
    radio.disabled = !showGrid;
  });

  if (unitSelector) {
    unitSelector.classList.toggle('disabled', !showGrid);
  }

  renderGrid();
}

function renderGrid() {
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

  // Maksymalna wysokość w metrach, jaką może pomieścić aktualny stage
  const maxMeters = stageHeight / PIXELS_PER_METER;

  if (unit === 'metric') {
    const minorStep = 50;  // 50m (brak podpisu)
    const majorStep = 100; // 100m (z podpisem)

    for (let m = minorStep; m <= maxMeters; m += minorStep) {
      const bottomPx = m * PIXELS_PER_METER;
      if (bottomPx > stageHeight) break;

      const isMajor = (m % majorStep === 0);
      createGridLine(gridOverlay, bottomPx, isMajor ? `${m}m` : null, isMajor);
    }
  } else {
    // Imperial (ft) - 1 stopy = 0.3048 m
    const minorStepFt = 100; // 100ft (brak podpisu)
    const majorStepFt = 500; // 500ft (z podpisem)
    const maxFeet = maxMeters / 0.3048;

    for (let ft = minorStepFt; ft <= maxFeet; ft += minorStepFt) {
      const meters = ft * 0.3048;
      const bottomPx = meters * PIXELS_PER_METER;
      if (bottomPx > stageHeight) break;

      const isMajor = (ft % majorStepFt === 0);
      createGridLine(gridOverlay, bottomPx, isMajor ? `${ft}ft` : null, isMajor);
    }
  }
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

function toggleFullscreen() {
  const stageWrapper = document.getElementById('stageWrapper');
  if (!document.fullscreenElement) {
    stageWrapper.requestFullscreen().catch(err => alert(err.message));
  } else {
    document.exitFullscreen();
  }
}

function clearStage() {
  const stage = document.getElementById('stage');
  if (stage) {
    stage.innerHTML = '<div id="gridOverlay" class="grid-overlay"></div>';
    renderGrid();
  }
}
