import "@kitware/vtk.js/Rendering/Profiles/Geometry";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkCellArray from "@kitware/vtk.js/Common/Core/CellArray";
import vtkPoints from "@kitware/vtk.js/Common/Core/Points";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkPolyDataReader from "@kitware/vtk.js/IO/Legacy/PolyDataReader";

export function createVtkViewer(container) {
  const genericRenderWindow = vtkGenericRenderWindow.newInstance({
    background: [0.055, 0.075, 0.095]
  });
  genericRenderWindow.setContainer(container);
  genericRenderWindow.resize();

  const renderer = genericRenderWindow.getRenderer();
  const renderWindow = genericRenderWindow.getRenderWindow();
  let actor = null;

  function renderData(data, extension) {
    const dataset = parseLegacyData(data, extension);
    if (!dataset) {
      throw new Error("VTK 文件没有可渲染的数据集");
    }

    if (actor) {
      renderer.removeActor(actor);
      actor.delete();
    }

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(dataset);

    actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    const property = actor.getProperty();
    property.setColor(0.86, 0.63, 0.25);
    property.setEdgeVisibility(true);
    property.setEdgeColor(0.16, 0.2, 0.24);

    if (dataset.getNumberOfPolys() === 0 && dataset.getNumberOfVerts() > 0) {
      property.setRepresentationToPoints();
      property.setPointSize(12);
    }

    renderer.addActor(actor);
    renderer.resetCamera();
    renderWindow.render();
  }

  function resetCamera() {
    renderer.resetCamera();
    renderWindow.render();
  }

  function resize() {
    genericRenderWindow.resize();
  }

  return {
    renderData,
    resetCamera,
    resize,
    delete() {
      genericRenderWindow.delete();
    }
  };
}

function parseLegacyData(data, extension) {
  if (extension !== ".vtk") {
    throw new Error(`不支持的 VTK 文件类型：${extension}`);
  }

  const text = new TextDecoder().decode(data);
  const datasetType = text.match(/^DATASET\s+(\S+)/m)?.[1];

  if (datasetType === "POLYDATA") {
    const reader = vtkPolyDataReader.newInstance();
    reader.parseAsText(text);
    return reader.getOutputData();
  }

  if (datasetType === "UNSTRUCTURED_GRID") {
    return parseUnstructuredGrid(text);
  }

  throw new Error(`不支持的 VTK 数据集类型：${datasetType || "未知"}`);
}

function parseUnstructuredGrid(text) {
  const tokens = text.trim().split(/\s+/);
  let index = 0;

  const readSection = (name) => {
    while (index < tokens.length && tokens[index] !== name) index += 1;
    if (index >= tokens.length) {
      throw new Error(`VTK 文件缺少 ${name} 数据`);
    }
    index += 1;
  };

  readSection("POINTS");
  const pointCount = Number(tokens[index++]);
  index += 1;
  const pointValues = new Float64Array(pointCount * 3);
  for (let pointIndex = 0; pointIndex < pointValues.length; pointIndex += 1) {
    pointValues[pointIndex] = Number(tokens[index++]);
  }

  readSection("CELLS");
  const cellCount = Number(tokens[index++]);
  const cellValues = [];
  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    const vertexCount = Number(tokens[index++]);
    const cell = [];
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      cell.push(Number(tokens[index++]));
    }
    cellValues.push(cell);
  }

  readSection("CELL_TYPES");
  const cellTypes = cellValues.map(() => Number(tokens[index++]));
  const polygonValues = [];
  const faceDefinitions = {
    10: [[0, 1, 2], [0, 3, 1], [1, 3, 2], [2, 3, 0]],
    11: [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [4, 0, 3, 7]],
    12: [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [4, 0, 3, 7]],
    13: [[0, 1, 2], [3, 5, 4], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]],
    14: [[0, 2, 1], [0, 3, 4, 1], [1, 4, 3, 2], [2, 3, 0], [3, 4, 0]]
  };

  cellValues.forEach((cell, cellIndex) => {
    const cellType = cellTypes[cellIndex];

    if (cellType === 5 || cellType === 9) {
      polygonValues.push(cell.length, ...cell);
      return;
    }

    const faces = faceDefinitions[cellType];
    if (!faces || faces.some((face) => face.some((vertexIndex) => vertexIndex >= cell.length))) {
      throw new Error(`暂不支持 VTK 单元类型：${cellType}`);
    }

    faces.forEach((face) => {
      polygonValues.push(face.length, ...face.map((vertexIndex) => cell[vertexIndex]));
    });
  });

  const dataset = vtkPolyData.newInstance();
  const points = vtkPoints.newInstance();
  points.setData(pointValues, 3);
  dataset.setPoints(points);

  const polys = vtkCellArray.newInstance();
  polys.setData(Uint32Array.from(polygonValues));
  dataset.setPolys(polys);
  return dataset;
}
