function simplifyGlance() {
  const logo = document.querySelector('header a[href="#"]');
  if (logo) {
    logo.remove();
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
}

new MutationObserver(simplifyGlance).observe(document.body, {
  childList: true,
  subtree: true
});

simplifyGlance();
