(function registerTetraVolumeReader() {
  const DEFAULT_LONG_AXIS_RESOLUTION = 128;
  const MAX_VOXELS = 2_000_000;
  const STATUS_ID = 'tetra-volume-status';
  const VIEW_MODE_STORAGE_KEY = 'editor.glance.tetraViewMode';

  let webpackRequire = null;
  self.webpackChunkglance.push([
    ['editor-tetra-volume'],
    {},
    (requireModule) => {
      webpackRequire = requireModule;
    }
  ]);

  if (!webpackRequire || !window.Glance) {
    console.error('Tetra volume extension could not access the embedded Glance runtime.');
    return;
  }

  const vtkImageData = getModuleDefault(15);
  const vtkDataArray = getModuleDefault(4);
  const vtkITKPolyDataReader = getModuleDefault(558);

  if (!vtkImageData || !vtkDataArray || !vtkITKPolyDataReader) {
    console.error('Tetra volume extension is incompatible with this Glance build.');
    return;
  }

  function getModuleDefault(moduleId) {
    const exports = webpackRequire(moduleId);
    return exports.ZP || exports.default || exports.Z || exports;
  }

  function setStatus(message, progress) {
    let status = document.getElementById(STATUS_ID);
    if (!status) {
      status = document.createElement('div');
      status.id = STATUS_ID;
      status.className = 'tetra-volume-status';
      status.innerHTML = '<span class="tetra-volume-status__spinner"></span><span></span>';
      document.body.appendChild(status);
    }

    const label = status.lastElementChild;
    label.textContent = progress == null ? message : `${message} ${Math.round(progress * 100)}%`;
    status.hidden = false;
  }

  function clearStatus() {
    const status = document.getElementById(STATUS_ID);
    if (status) status.hidden = true;
  }

  const originalReadAsArrayBuffer = FileReader.prototype.readAsArrayBuffer;
  FileReader.prototype.readAsArrayBuffer = function readAsArrayBuffer(file) {
    if (file?.name?.toLowerCase().endsWith('.vtk')) {
      window.GlanceTetraVolume.lastFile = file;
    }
    return originalReadAsArrayBuffer.call(this, file);
  };

  function readStoredViewMode() {
    try {
      const storedMode = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      return storedMode === 'volume' ? 'volume' : 'geometry';
    } catch (error) {
      return 'geometry';
    }
  }

  function storeViewMode(mode) {
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch (error) {
      // Storage can be unavailable when the embedded viewer runs from file://.
    }
  }

  function isLegacyTetraGrid(buffer) {
    const header = new TextDecoder().decode(buffer.slice(0, Math.min(buffer.byteLength, 4096)));
    return /^# vtk DataFile/m.test(header)
      && /DATASET\s+UNSTRUCTURED_GRID/i.test(header)
      && /(?:ASCII|BINARY)/i.test(header);
  }

  function findToken(tokens, name, fromIndex) {
    for (let index = fromIndex; index < tokens.length; index += 1) {
      if (tokens[index].toUpperCase() === name) return index;
    }
    return -1;
  }

  function parseLegacyTetraGrid(buffer) {
    const header = new TextDecoder().decode(buffer.slice(0, Math.min(buffer.byteLength, 512)));
    if (/^BINARY\s*$/im.test(header)) {
      return parseBinaryLegacyTetraGrid(buffer);
    }

    const text = new TextDecoder().decode(buffer);
    const tokens = text.trim().split(/\s+/);

    let index = findToken(tokens, 'POINTS', 0);
    if (index < 0) throw new Error('The VTK file has no POINTS section.');

    const pointCount = Number(tokens[index + 1]);
    index += 3;
    const points = new Float64Array(pointCount * 3);
    for (let valueIndex = 0; valueIndex < points.length; valueIndex += 1) {
      points[valueIndex] = Number(tokens[index++]);
    }

    index = findToken(tokens, 'CELLS', index);
    if (index < 0) throw new Error('The VTK file has no CELLS section.');

    const cellCount = Number(tokens[index + 1]);
    index += 3;
    const cells = new Array(cellCount);
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      const vertexCount = Number(tokens[index++]);
      const cell = new Uint32Array(vertexCount);
      for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
        cell[vertexIndex] = Number(tokens[index++]);
      }
      cells[cellIndex] = cell;
    }

    index = findToken(tokens, 'CELL_TYPES', index);
    if (index < 0) throw new Error('The VTK file has no CELL_TYPES section.');

    const declaredTypeCount = Number(tokens[index + 1]);
    index += 2;
    const cellTypes = new Uint8Array(declaredTypeCount);
    let tetraCount = 0;
    for (let cellIndex = 0; cellIndex < declaredTypeCount; cellIndex += 1) {
      cellTypes[cellIndex] = Number(tokens[index++]);
      if (cellTypes[cellIndex] === 10 && cells[cellIndex]?.length === 4) tetraCount += 1;
    }

    if (!tetraCount) throw new Error('The unstructured grid contains no linear tetrahedral cells (VTK type 10).');

    const scalar = parseFirstScalarArray(tokens, index, pointCount, cellCount);
    return { points, cells, cellTypes, tetraCount, scalar };
  }

  function parseBinaryLegacyTetraGrid(buffer) {
    const reader = createBinaryReader(buffer);
    const versionLine = reader.readLine();
    reader.readLine();
    const formatLine = reader.readLine();
    const datasetLine = reader.readLine();

    if (!/^# vtk DataFile/i.test(versionLine)
      || formatLine.trim().toUpperCase() !== 'BINARY'
      || !/DATASET\s+UNSTRUCTURED_GRID/i.test(datasetLine)) {
      throw new Error('This is not a legacy binary VTK unstructured grid.');
    }

    const pointsHeader = reader.readNonEmptyLine().trim().split(/\s+/);
    if (pointsHeader[0].toUpperCase() !== 'POINTS') {
      throw new Error('The binary VTK file has no POINTS section.');
    }
    const pointCount = Number(pointsHeader[1]);
    const pointValues = reader.readValues(pointCount * 3, pointsHeader[2]);
    const points = Float64Array.from(pointValues);

    const cellsHeader = reader.readNonEmptyLine().trim().split(/\s+/);
    if (cellsHeader[0].toUpperCase() !== 'CELLS') {
      throw new Error('The binary VTK file has no CELLS section.');
    }
    const cellCount = Number(cellsHeader[1]);
    const connectivityValueCount = Number(cellsHeader[2]);
    const connectivity = reader.readValues(connectivityValueCount, 'int');
    const cells = new Array(cellCount);
    for (let cellIndex = 0, offset = 0; cellIndex < cellCount; cellIndex += 1) {
      const vertexCount = connectivity[offset++];
      const cell = new Uint32Array(vertexCount);
      for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
        cell[vertexIndex] = connectivity[offset++];
      }
      cells[cellIndex] = cell;
    }

    const typesHeader = reader.readNonEmptyLine().trim().split(/\s+/);
    if (typesHeader[0].toUpperCase() !== 'CELL_TYPES') {
      throw new Error('The binary VTK file has no CELL_TYPES section.');
    }
    const declaredTypeCount = Number(typesHeader[1]);
    const cellTypes = Uint8Array.from(reader.readValues(declaredTypeCount, 'int'));
    let tetraCount = 0;
    for (let cellIndex = 0; cellIndex < cellTypes.length; cellIndex += 1) {
      if (cellTypes[cellIndex] === 10 && cells[cellIndex]?.length === 4) tetraCount += 1;
    }
    if (!tetraCount) throw new Error('The unstructured grid contains no linear tetrahedral cells (VTK type 10).');

    const scalar = parseBinaryScalarArray(reader, pointCount, cellCount);
    return { points, cells, cellTypes, tetraCount, scalar };
  }

  function createBinaryReader(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let offset = 0;
    const typeReaders = {
      char: [1, (position) => view.getInt8(position)],
      signed_char: [1, (position) => view.getInt8(position)],
      unsigned_char: [1, (position) => view.getUint8(position)],
      short: [2, (position) => view.getInt16(position, false)],
      unsigned_short: [2, (position) => view.getUint16(position, false)],
      int: [4, (position) => view.getInt32(position, false)],
      unsigned_int: [4, (position) => view.getUint32(position, false)],
      long: [4, (position) => view.getInt32(position, false)],
      unsigned_long: [4, (position) => view.getUint32(position, false)],
      float: [4, (position) => view.getFloat32(position, false)],
      double: [8, (position) => view.getFloat64(position, false)]
    };

    return {
      readLine() {
        const start = offset;
        while (offset < bytes.length && bytes[offset] !== 10 && bytes[offset] !== 13) offset += 1;
        const line = new TextDecoder().decode(bytes.subarray(start, offset));
        if (bytes[offset] === 13) offset += 1;
        if (bytes[offset] === 10) offset += 1;
        return line;
      },
      readNonEmptyLine() {
        let line = this.readLine();
        while (!line.trim() && offset < bytes.length) line = this.readLine();
        return line;
      },
      readValues(count, typeName) {
        const normalizedType = String(typeName).toLowerCase();
        const typeReader = typeReaders[normalizedType];
        if (!typeReader) throw new Error(`Unsupported binary VTK value type: ${typeName}`);
        const [byteSize, readValue] = typeReader;
        const values = new Array(count);
        for (let index = 0; index < count; index += 1) {
          values[index] = readValue(offset);
          offset += byteSize;
        }
        return values;
      }
    };
  }

  function parseBinaryScalarArray(reader, pointCount, cellCount) {
    let association = null;
    let tupleCount = 0;

    for (let lineIndex = 0; lineIndex < 32; lineIndex += 1) {
      const line = reader.readNonEmptyLine();
      if (!line) break;
      const header = line.trim().split(/\s+/);
      const keyword = header[0].toUpperCase();

      if (keyword === 'POINT_DATA' || keyword === 'CELL_DATA') {
        association = keyword === 'POINT_DATA' ? 'point' : 'cell';
        tupleCount = Number(header[1]);
        continue;
      }

      if (keyword !== 'SCALARS' || !association || !tupleCount) continue;
      const name = header[1] || 'Scalars';
      const type = header[2];
      const componentCount = Number(header[3]) || 1;
      const lookupTableLine = reader.readNonEmptyLine();
      if (!/^LOOKUP_TABLE\s+/i.test(lookupTableLine)) {
        throw new Error('The binary scalar array has no LOOKUP_TABLE declaration.');
      }

      const rawValues = reader.readValues(tupleCount * componentCount, type);
      const expectedTupleCount = association === 'point' ? pointCount : cellCount;
      const values = new Float64Array(expectedTupleCount);
      for (let tupleIndex = 0; tupleIndex < Math.min(tupleCount, expectedTupleCount); tupleIndex += 1) {
        values[tupleIndex] = rawValues[tupleIndex * componentCount];
      }
      return { name, association, values };
    }

    return {
      name: 'Tetra density',
      association: 'cell',
      values: new Float64Array(cellCount).fill(1)
    };
  }

  function parseFirstScalarArray(tokens, fromIndex, pointCount, cellCount) {
    let association = null;
    let tupleCount = 0;

    for (let index = fromIndex; index < tokens.length; index += 1) {
      const token = tokens[index].toUpperCase();
      if (token === 'POINT_DATA' || token === 'CELL_DATA') {
        association = token === 'POINT_DATA' ? 'point' : 'cell';
        tupleCount = Number(tokens[++index]);
        continue;
      }

      if (token !== 'SCALARS' || !association || !tupleCount) continue;

      const name = tokens[index + 1] || 'Scalars';
      let componentCount = Number(tokens[index + 3]);
      if (!Number.isFinite(componentCount)) componentCount = 1;
      index += componentCount === 1 && !/^\d+$/.test(tokens[index + 3] || '') ? 3 : 4;

      if ((tokens[index] || '').toUpperCase() === 'LOOKUP_TABLE') index += 2;

      const expectedTupleCount = association === 'point' ? pointCount : cellCount;
      const values = new Float64Array(expectedTupleCount);
      const availableTupleCount = Math.min(tupleCount, expectedTupleCount);
      for (let tupleIndex = 0; tupleIndex < availableTupleCount; tupleIndex += 1) {
        values[tupleIndex] = Number(tokens[index + tupleIndex * componentCount]);
      }
      return { name, association, values };
    }

    return {
      name: 'Tetra density',
      association: 'cell',
      values: new Float64Array(cellCount).fill(1)
    };
  }

  function computeBounds(points) {
    const bounds = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (let index = 0; index < points.length; index += 3) {
      bounds[0] = Math.min(bounds[0], points[index]);
      bounds[1] = Math.max(bounds[1], points[index]);
      bounds[2] = Math.min(bounds[2], points[index + 1]);
      bounds[3] = Math.max(bounds[3], points[index + 1]);
      bounds[4] = Math.min(bounds[4], points[index + 2]);
      bounds[5] = Math.max(bounds[5], points[index + 2]);
    }
    return bounds;
  }

  function chooseGrid(bounds, requestedResolution) {
    const extents = [
      bounds[1] - bounds[0],
      bounds[3] - bounds[2],
      bounds[5] - bounds[4]
    ];
    const longest = Math.max(...extents);
    let longAxisResolution = requestedResolution;
    let dimensions;

    do {
      dimensions = extents.map((extent) => Math.max(2, Math.round((extent / longest) * (longAxisResolution - 1)) + 1));
      if (dimensions[0] * dimensions[1] * dimensions[2] <= MAX_VOXELS) break;
      longAxisResolution = Math.max(32, Math.floor(longAxisResolution * 0.9));
    } while (longAxisResolution > 32);

    const spacing = extents.map((extent, axis) => extent > 0 ? extent / (dimensions[axis] - 1) : 1);
    return { dimensions, spacing };
  }

  function getPoint(points, pointId) {
    const offset = pointId * 3;
    return [points[offset], points[offset + 1], points[offset + 2]];
  }

  function makeTetraTransform(a, b, c, d) {
    const m00 = b[0] - a[0];
    const m01 = c[0] - a[0];
    const m02 = d[0] - a[0];
    const m10 = b[1] - a[1];
    const m11 = c[1] - a[1];
    const m12 = d[1] - a[1];
    const m20 = b[2] - a[2];
    const m21 = c[2] - a[2];
    const m22 = d[2] - a[2];
    const determinant = m00 * (m11 * m22 - m12 * m21)
      - m01 * (m10 * m22 - m12 * m20)
      + m02 * (m10 * m21 - m11 * m20);

    if (Math.abs(determinant) < 1e-20) return null;
    const inverseDeterminant = 1 / determinant;
    return [
      (m11 * m22 - m12 * m21) * inverseDeterminant,
      (m02 * m21 - m01 * m22) * inverseDeterminant,
      (m01 * m12 - m02 * m11) * inverseDeterminant,
      (m12 * m20 - m10 * m22) * inverseDeterminant,
      (m00 * m22 - m02 * m20) * inverseDeterminant,
      (m02 * m10 - m00 * m12) * inverseDeterminant,
      (m10 * m21 - m11 * m20) * inverseDeterminant,
      (m01 * m20 - m00 * m21) * inverseDeterminant,
      (m00 * m11 - m01 * m10) * inverseDeterminant
    ];
  }

  function barycentricCoordinates(point, origin, inverse) {
    const x = point[0] - origin[0];
    const y = point[1] - origin[1];
    const z = point[2] - origin[2];
    const b1 = inverse[0] * x + inverse[1] * y + inverse[2] * z;
    const b2 = inverse[3] * x + inverse[4] * y + inverse[5] * z;
    const b3 = inverse[6] * x + inverse[7] * y + inverse[8] * z;
    return [1 - b1 - b2 - b3, b1, b2, b3];
  }

  function scalarRange(values) {
    let minimum = Infinity;
    let maximum = -Infinity;
    for (let index = 0; index < values.length; index += 1) {
      if (!Number.isFinite(values[index])) continue;
      minimum = Math.min(minimum, values[index]);
      maximum = Math.max(maximum, values[index]);
    }
    if (!Number.isFinite(minimum)) return [0, 1];
    return [minimum, maximum];
  }

  async function voxelizeTetraGrid(grid, requestedResolution) {
    const bounds = computeBounds(grid.points);
    const { dimensions, spacing } = chooseGrid(bounds, requestedResolution);
    const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];
    const values = new Float32Array(voxelCount);
    const occupied = new Uint8Array(voxelCount);
    const [scalarMinimum, scalarMaximum] = scalarRange(grid.scalar.values);
    const scalarSpan = scalarMaximum - scalarMinimum || Math.max(Math.abs(scalarMinimum), 1);
    const outsideValue = scalarMinimum - scalarSpan * 0.01;
    values.fill(outsideValue);

    const origin = [bounds[0], bounds[2], bounds[4]];
    const tolerance = 1e-7;
    let convertedTetraCount = 0;
    let lastYield = performance.now();

    setStatus('Voxelizing tetrahedral cells…', 0);
    for (let cellIndex = 0; cellIndex < grid.cells.length; cellIndex += 1) {
      const cell = grid.cells[cellIndex];
      if (grid.cellTypes[cellIndex] !== 10 || cell.length !== 4) continue;

      const tetraPoints = Array.from(cell, (pointId) => getPoint(grid.points, pointId));
      const inverse = makeTetraTransform(tetraPoints[0], tetraPoints[1], tetraPoints[2], tetraPoints[3]);
      if (!inverse) continue;

      const cellMinimum = [0, 1, 2].map((axis) => Math.min(...tetraPoints.map((point) => point[axis])));
      const cellMaximum = [0, 1, 2].map((axis) => Math.max(...tetraPoints.map((point) => point[axis])));
      const start = cellMinimum.map((value, axis) => Math.max(0, Math.floor((value - origin[axis]) / spacing[axis])));
      const end = cellMaximum.map((value, axis) => Math.min(dimensions[axis] - 1, Math.ceil((value - origin[axis]) / spacing[axis])));
      const pointScalars = grid.scalar.association === 'point'
        ? Array.from(cell, (pointId) => grid.scalar.values[pointId])
        : null;
      const cellScalar = grid.scalar.values[cellIndex] ?? 1;

      for (let zIndex = start[2]; zIndex <= end[2]; zIndex += 1) {
        const z = origin[2] + zIndex * spacing[2];
        for (let yIndex = start[1]; yIndex <= end[1]; yIndex += 1) {
          const y = origin[1] + yIndex * spacing[1];
          for (let xIndex = start[0]; xIndex <= end[0]; xIndex += 1) {
            const x = origin[0] + xIndex * spacing[0];
            const barycentric = barycentricCoordinates([x, y, z], tetraPoints[0], inverse);
            if (barycentric.some((weight) => weight < -tolerance || weight > 1 + tolerance)) continue;

            const voxelIndex = xIndex + dimensions[0] * (yIndex + dimensions[1] * zIndex);
            values[voxelIndex] = pointScalars
              ? barycentric.reduce((sum, weight, vertexIndex) => sum + weight * pointScalars[vertexIndex], 0)
              : cellScalar;
            occupied[voxelIndex] = 1;
          }
        }
      }

      convertedTetraCount += 1;
      if (performance.now() - lastYield > 24) {
        setStatus('Voxelizing tetrahedral cells…', convertedTetraCount / grid.tetraCount);
        await new Promise((resolve) => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }

    const imageData = vtkImageData.newInstance({ origin, spacing });
    imageData.setDimensions(...dimensions);
    imageData.getPointData().setScalars(vtkDataArray.newInstance({
      name: grid.scalar.name,
      numberOfComponents: 1,
      values
    }));

    imageData.tetraVolumeMetadata = {
      dimensions,
      occupiedVoxelCount: occupied.reduce((sum, value) => sum + value, 0),
      tetraCount: convertedTetraCount,
      originalScalarRange: [scalarMinimum, scalarMaximum],
      outsideValue
    };
    clearStatus();
    return imageData;
  }

  function createReader() {
    let fileName = '';
    return {
      setFileName(name) {
        fileName = name;
      },
      async parseAsArrayBuffer(buffer) {
        if (isLegacyTetraGrid(buffer)) {
          try {
            const grid = parseLegacyTetraGrid(buffer);
            const resolution = window.GlanceTetraVolume.resolution;
            return await voxelizeTetraGrid(grid, resolution);
          } catch (error) {
            clearStatus();
            console.error('Tetra volume conversion failed; using the geometry reader.', error);
          }
        }

        const fallbackReader = vtkITKPolyDataReader.newInstance();
        if (fallbackReader.setFileName) fallbackReader.setFileName(fileName);
        const parsed = await fallbackReader.parseAsArrayBuffer(buffer);
        return parsed && parsed.isA ? parsed : fallbackReader.getOutputData();
      }
    };
  }

  function registerGeometryReader() {
    window.Glance.registerReader({
      extension: 'vtk',
      name: 'Legacy VTK geometry reader',
      vtkReader: vtkITKPolyDataReader,
      binary: true,
      fileNameMethod: 'setFileName'
    });
  }

  function registerVolumeReader() {
    window.Glance.registerReader({
      extension: 'vtk',
      name: 'Legacy VTK tetra volume reader',
      vtkReader: { newInstance: createReader },
      binary: true,
      fileNameMethod: 'setFileName'
    });
  }

  function registerReaderForMode(mode) {
    if (mode === 'geometry') {
      registerGeometryReader();
    } else {
      registerVolumeReader();
    }
  }

  async function reloadCurrentFile() {
    const file = window.GlanceTetraVolume.lastFile;
    const store = window.glanceInstance?.store;
    const proxyManager = window.glanceInstance?.proxyManager;
    if (!file || !store || !proxyManager) return false;

    setStatus(`Loading ${window.GlanceTetraVolume.mode} view…`);
    store.dispatch('resetWorkspace');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await store.dispatch('files/resetQueue');
    await store.dispatch('files/openFiles', [file]);
    await store.dispatch('files/load');
    await store.dispatch('files/resetQueue');
    store.commit('showApp');
    proxyManager.resetCameraInAllViews();
    clearStatus();
    return true;
  }

  window.GlanceTetraVolume = {
    mode: readStoredViewMode(),
    resolution: DEFAULT_LONG_AXIS_RESOLUTION,
    lastFile: null,
    setMode(value) {
      const mode = String(value).toLowerCase();
      if (mode !== 'geometry' && mode !== 'volume') {
        throw new Error('Tetra view mode must be "geometry" or "volume".');
      }
      this.mode = mode;
      storeViewMode(mode);
      registerReaderForMode(mode);
      window.dispatchEvent(new CustomEvent('glance-tetra-view-mode', {
        detail: { mode }
      }));
      return reloadCurrentFile();
    },
    setResolution(value) {
      const resolution = Math.round(Number(value));
      if (!Number.isFinite(resolution) || resolution < 32 || resolution > 256) {
        throw new Error('Tetra volume resolution must be between 32 and 256.');
      }
      this.resolution = resolution;
    },
    parseLegacyTetraGrid,
    voxelizeTetraGrid
  };

  registerReaderForMode(window.GlanceTetraVolume.mode);
})();
