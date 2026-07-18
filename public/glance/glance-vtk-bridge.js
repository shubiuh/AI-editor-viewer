(() => {
  const originalAddEventListener = HTMLInputElement.prototype.addEventListener;
  const originalSetAttribute = HTMLInputElement.prototype.setAttribute;

  function forwardLegacyVtkFile(file) {
    file.arrayBuffer().then((data) => {
      window.parent.postMessage(
        {
          type: 'ai-editor:open-legacy-vtk',
          fileName: file.name,
          data
        },
        '*',
        [data]
      );
    });
  }

  HTMLInputElement.prototype.setAttribute = function setAttribute(name, value) {
    if (this.type === 'file' && name.toLowerCase() === 'accept') {
      const acceptedTypes = String(value).split(',').filter(Boolean);
      if (!acceptedTypes.includes('.vtk')) {
        acceptedTypes.push('.vtk');
      }
      return originalSetAttribute.call(this, name, acceptedTypes.join(','));
    }

    return originalSetAttribute.call(this, name, value);
  };

  HTMLInputElement.prototype.addEventListener = function addEventListener(type, listener, options) {
    if (this.type === 'file' && type === 'change' && !this.dataset.legacyVtkBridge) {
      this.dataset.legacyVtkBridge = 'true';
      window.__glanceLegacyVtkInputs = window.__glanceLegacyVtkInputs || [];
      window.__glanceLegacyVtkInputs.push(this);
      originalAddEventListener.call(this, type, (event) => {
        const vtkFile = [...event.target.files].find((file) =>
          file.name.toLowerCase().endsWith('.vtk')
        );

        if (vtkFile) {
          event.stopImmediatePropagation();
          forwardLegacyVtkFile(vtkFile);
        }
      }, options);
    }

    return originalAddEventListener.call(this, type, listener, options);
  };
})();
