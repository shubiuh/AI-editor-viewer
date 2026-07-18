import "@kitware/vtk.js/Rendering/Profiles/Geometry";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkCellArray from "@kitware/vtk.js/Common/Core/CellArray";
import vtkCellPicker from "@kitware/vtk.js/Rendering/Core/CellPicker";
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkLookupTable from "@kitware/vtk.js/Common/Core/LookupTable";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkPoints from "@kitware/vtk.js/Common/Core/Points";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";

import { geologicalCameraPose } from "./camera-presets";
import { createPropertyScalarPlan, createReservoirRenderPlan, readPropertyValue, type ReservoirRenderPlan } from "./render-plan";
import type { GeologicalView, IJKClip, ReservoirPickResult, ReservoirProperty, ReservoirRenderGeometry, ReservoirRepresentation, ReservoirVisibility } from "./types";

export class ReservoirViewer {
  private container: HTMLElement | undefined;
  private genericRenderWindow: ReturnType<typeof vtkGenericRenderWindow.newInstance> | undefined;
  private actor: ReturnType<typeof vtkActor.newInstance> | undefined;
  private mapper: ReturnType<typeof vtkMapper.newInstance> | undefined;
  private polyData: ReturnType<typeof vtkPolyData.newInstance> | undefined;
  private lookupTable: ReturnType<typeof vtkLookupTable.newInstance> | undefined;
  private readonly picker = vtkCellPicker.newInstance();
  private resizeObserver: ResizeObserver | undefined;
  private geometry: ReservoirRenderGeometry | undefined;
  private property: ReservoirProperty | undefined;
  private visibility: ReservoirVisibility = {};
  private clip: IJKClip = {};
  private representation: ReservoirRepresentation = "surface";
  private renderPlan: ReservoirRenderPlan | undefined;

  public attach(container: HTMLElement): void {
    if (this.container === container && this.genericRenderWindow) {
      return;
    }
    this.detachRenderWindow();
    this.container = container;
    this.genericRenderWindow = vtkGenericRenderWindow.newInstance({ background: [0.055, 0.075, 0.095] });
    this.genericRenderWindow.setContainer(container);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.rebuildGeometry();
  }

  public setGeometry(geometry: ReservoirRenderGeometry): void {
    this.geometry = geometry;
    this.rebuildGeometry();
  }

  public setProperty(property: ReservoirProperty | undefined): void {
    this.property = property;
    this.updatePropertyScalars();
  }

  public setVisibility(visibility: ReservoirVisibility): void {
    this.visibility = visibility;
    this.rebuildGeometry();
  }

  public setIJKClip(clip: IJKClip): void {
    this.clip = clip;
    this.rebuildGeometry();
  }

  public setRepresentation(representation: ReservoirRepresentation): void {
    this.representation = representation;
    this.applyRepresentation();
    this.render();
  }

  public resetCamera(): void {
    this.genericRenderWindow?.getRenderer().resetCamera();
    this.render();
  }

  public setGeologicalView(view: GeologicalView): void {
    if (!this.genericRenderWindow || !this.renderPlan) {
      return;
    }
    const camera = this.genericRenderWindow.getRenderer().getActiveCamera();
    const pose = geologicalCameraPose(this.renderPlan.localBounds, view);
    camera.setPosition(...pose.position);
    camera.setFocalPoint(...pose.focalPoint);
    camera.setViewUp(...pose.viewUp);
    this.genericRenderWindow.getRenderer().resetCameraClippingRange();
    this.render();
  }

  public pick(x: number, y: number): ReservoirPickResult | undefined {
    if (!this.genericRenderWindow || !this.geometry || !this.renderPlan) {
      return undefined;
    }
    this.picker.pick([x, y, 0], this.genericRenderWindow.getRenderer());
    const renderedCellId = this.picker.getCellId();
    if (renderedCellId < 0) {
      return undefined;
    }
    const sourceFaceIndex = this.renderPlan.visibleFaceIndices[renderedCellId];
    if (sourceFaceIndex === undefined) {
      return undefined;
    }
    const ijkOffset = sourceFaceIndex * 3;
    const i = this.geometry.surface.faceIJK[ijkOffset] ?? 0;
    const j = this.geometry.surface.faceIJK[ijkOffset + 1] ?? 0;
    const k = this.geometry.surface.faceIJK[ijkOffset + 2] ?? 0;
    const cellId = this.renderPlan.faceLocalCellIds[renderedCellId] ?? 0;
    const originalCellId = this.geometry.surface.faceOriginalCellIds[cellId] ?? 0;
    const localPosition = this.picker.getPickPosition();
    return {
      originalCellId,
      ijk: [i, j, k],
      propertyValue: readPropertyValue(this.property, cellId),
      worldCoordinate: [
        (localPosition[0] ?? 0) + this.geometry.localOrigin[0],
        (localPosition[1] ?? 0) + this.geometry.localOrigin[1],
        (localPosition[2] ?? 0) + this.geometry.localOrigin[2]
      ]
    };
  }

  public resize(): void {
    this.genericRenderWindow?.resize();
    this.render();
  }

  public clear(): void {
    this.geometry = undefined;
    this.property = undefined;
    this.renderPlan = undefined;
    this.removeVtkGeometry();
    this.render();
  }

  public dispose(): void {
    this.clear();
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.picker.delete();
    this.detachRenderWindow();
  }

  private rebuildGeometry(): void {
    if (!this.geometry || !this.genericRenderWindow) {
      return;
    }
    this.renderPlan = createReservoirRenderPlan(this.geometry, this.visibility, this.clip);
    this.removeVtkGeometry();

    const points = vtkPoints.newInstance();
    points.setData(this.renderPlan.pointCoordinates, 3);
    const polygons = vtkCellArray.newInstance();
    polygons.setData(this.renderPlan.vtkPolygons);
    this.polyData = vtkPolyData.newInstance();
    this.polyData.setPoints(points);
    this.polyData.setPolys(polygons);
    this.mapper = vtkMapper.newInstance();
    this.mapper.setInputData(this.polyData);
    this.mapper.setScalarModeToUsePointData();
    this.mapper.setScalarVisibility(true);
    this.lookupTable = vtkLookupTable.newInstance();
    this.actor = vtkActor.newInstance();
    this.actor.setMapper(this.mapper);
    this.genericRenderWindow.getRenderer().addActor(this.actor);
    this.applyRepresentation();
    this.updatePropertyScalars();
    this.genericRenderWindow.getRenderer().resetCamera();
    this.render();
  }

  private updatePropertyScalars(): void {
    if (!this.polyData || !this.mapper || !this.lookupTable || !this.renderPlan) {
      return;
    }
    const scalarPlan = createPropertyScalarPlan(this.renderPlan, this.property);
    this.polyData.getPointData().setScalars(vtkDataArray.newInstance({
      name: "reservoir-property",
      values: scalarPlan.scalars,
      numberOfComponents: 1
    }));
    this.lookupTable.setRange(...scalarPlan.range);
    this.lookupTable.setHueRange([0.67, 0]);
    this.lookupTable.setNanColor([...scalarPlan.undefinedColor]);
    this.lookupTable.build();
    this.mapper.setLookupTable(this.lookupTable);
    this.mapper.setScalarRange(...scalarPlan.range);
    this.polyData.modified();
    this.render();
  }

  private applyRepresentation(): void {
    if (!this.actor) {
      return;
    }
    const property = this.actor.getProperty();
    if (this.representation === "wireframe") {
      property.setRepresentationToWireframe();
      property.setEdgeVisibility(false);
    } else {
      property.setRepresentationToSurface();
      property.setEdgeVisibility(this.representation === "surface-with-edges");
      property.setEdgeColor(0.1, 0.12, 0.14);
    }
  }

  private removeVtkGeometry(): void {
    if (this.actor && this.genericRenderWindow) {
      this.genericRenderWindow.getRenderer().removeActor(this.actor);
    }
    this.actor?.delete();
    this.mapper?.delete();
    this.polyData?.delete();
    this.lookupTable?.delete();
    this.actor = undefined;
    this.mapper = undefined;
    this.polyData = undefined;
    this.lookupTable = undefined;
  }

  private detachRenderWindow(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.genericRenderWindow?.delete();
    this.genericRenderWindow = undefined;
    this.container = undefined;
  }

  private render(): void {
    this.genericRenderWindow?.getRenderWindow().render();
  }
}