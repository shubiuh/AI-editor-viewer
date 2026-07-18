function simplifyGlance() {
  const logo = document.querySelector('header a[href="#"]');
  if (logo) {
    logo.remove();
  }

  const aboutButton = [...document.querySelectorAll('button')].find(
    (button) => button.textContent.trim() === 'About'
  );
  if (aboutButton) {
    aboutButton.remove();
  }

  addTetraViewSelector();

  const sampleHeading = [...document.querySelectorAll('*')].find(
    (element) => element.children.length === 0 && element.textContent.trim() === 'Sample Data'
  );
  const sampleContainer = sampleHeading?.closest('.container');
  if (sampleContainer) {
    sampleContainer.style.display = 'none';
  }

  const landingTitle = [...document.querySelectorAll('*')].find(
    (element) => element.children.length === 0 && element.textContent.trim() === 'Visualize your data with Kitware Glance'
  );
  if (landingTitle) {
    landingTitle.textContent = 'Open a scientific dataset';
  }

  const landingFooter = [...document.querySelectorAll('*')].find(
    (element) => element.children.length === 0 && element.textContent.includes('Kitware, Inc.')
  );
  if (landingFooter?.parentElement?.parentElement) {
    landingFooter.parentElement.parentElement.style.display = 'none';
  }

  const versionFooter = [...document.querySelectorAll('*')].find(
    (element) => element.children.length === 0 && element.textContent.trim().startsWith('Glance (')
  );
  if (versionFooter?.parentElement) {
    versionFooter.parentElement.style.display = 'none';
  }

  const dropColumn = document.querySelector('[class*="Landing-dnd"]')?.parentElement;
  const landingRow = dropColumn?.parentElement;
  if (landingRow && !document.querySelector('.editor-glance-intro')) {
    const layout = document.createElement('div');
    layout.className = 'editor-glance-layout';
    const intro = document.createElement('section');
    intro.className = 'editor-glance-intro';
    intro.innerHTML = `
      <div class="editor-glance-intro__content">
        <p class="editor-glance-intro__eyebrow">DATA VIEWER</p>
        <h1>Inspect scientific data</h1>
        <p>Open a supported dataset to explore its geometry and scalar fields in the Glance workspace.</p>
        <ul>
          <li>Use <strong>Open</strong> to choose a file.</li>
          <li>Drop a supported file into the panel.</li>
          <li>Choose <strong>Geometry</strong> for surface/wireframe views or <strong>Volume</strong> for ray casting.</li>
        </ul>
      </div>
    `;
    landingRow.insertBefore(layout, dropColumn);
    layout.append(intro, dropColumn);
  }
}

function addTetraViewSelector() {
  const volumeExtension = window.GlanceTetraVolume;
  if (!volumeExtension) return;

  const existingSelect = document.querySelector('#tetra-view-mode');
  if (existingSelect) {
    existingSelect.value = volumeExtension.mode;
    return;
  }

  const openButton = [...document.querySelectorAll('button')].find(
    (button) => button.textContent.trim().toUpperCase() === 'OPEN'
  );
  if (!openButton?.parentElement) return;

  const control = document.createElement('label');
  control.className = 'tetra-view-mode';
  control.title = 'Switch between geometry and volume rendering for the current tetrahedral VTK file.';

  const label = document.createElement('span');
  label.className = 'tetra-view-mode__label';
  label.textContent = 'VTK TETRA VIEW';

  const select = document.createElement('select');
  select.id = 'tetra-view-mode';
  select.className = 'tetra-view-mode__select';
  select.setAttribute('aria-label', 'VTK tetrahedral view mode');
  select.innerHTML = `
    <option value="geometry">Geometry</option>
    <option value="volume">Volume</option>
  `;
  select.value = volumeExtension.mode;
  select.addEventListener('change', async () => {
    control.dataset.changed = 'true';
    hint.textContent = 'Switching view…';
    try {
      const reloaded = await volumeExtension.setMode(select.value);
      hint.textContent = reloaded ? 'View switched' : 'Applies to the next VTK file';
    } catch (error) {
      console.error('Failed to switch tetra view mode.', error);
      hint.textContent = 'Unable to switch view';
    }
    window.setTimeout(() => delete control.dataset.changed, 2400);
  });

  const hint = document.createElement('span');
  hint.className = 'tetra-view-mode__hint';
  hint.textContent = 'Switching view…';

  control.append(label, select, hint);
  openButton.parentElement.insertBefore(control, openButton);
}

new MutationObserver(() => {
  simplifyGlance();
}).observe(document.body, {
  childList: true,
  subtree: true
});

simplifyGlance();
