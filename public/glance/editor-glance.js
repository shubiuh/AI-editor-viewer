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
          <li>Use the VTK tab for legacy <code>.vtk</code> datasets.</li>
        </ul>
      </div>
    `;
    landingRow.insertBefore(layout, dropColumn);
    layout.append(intro, dropColumn);
  }
}

new MutationObserver(simplifyGlance).observe(document.body, {
  childList: true,
  subtree: true
});

simplifyGlance();
