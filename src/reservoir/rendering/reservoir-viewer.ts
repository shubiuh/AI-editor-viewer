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
import vtkTubeFilter from "@kitware/vtk.js/Filters/General/TubeFilter";
import vtkTextActor from "@kitware/vtk.js/Rendering/Core/TextActor";
import vtkTextProperty from "@kitware/vtk.js/Rendering/Core/TextProperty";

import { geologicalCameraPose } from "./camera-presets";
import { createPropertyScalarPlan, createReservoirRenderPlan, readPropertyValue, type ReservoirRenderPlan } from "./render-plan";
import { createTrajectoryPolylinePlan, createTrajectoryTickPlan, findNearestTrajectoryStation } from "./trajectory-render-plan";
import type { GeologicalView, IJKClip, ReservoirPickResult, ReservoirProperty, ReservoirRenderGeometry, ReservoirRepresentation, ReservoirVisibility, WellTrajectoryPickResult, WellTrajectoryRenderInput } from "./types";

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
  private wells: readonly WellTrajectoryRenderInput[] = [];
  private readonly wellEntries: WellRenderEntry[] = [];

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
    this.rebuildWells();
  }

  /** Replaces only the well layer; reservoir surface topology is deliberately untouched. */
  public setWells(wells: readonly WellTrajectoryRenderInput[]): void {
    this.wells = wells;
    this.rebuildWells();
    this.render();
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

  public pick(x: number, y: number): ReservoirPickResult | WellTrajectoryPickResult | undefined {
    if (!this.genericRenderWindow || !this.geometry || !this.renderPlan) {
      return undefined;
    }
    this.picker.pick([x, y, 0], this.genericRenderWindow.getRenderer());
    const pickedMapper = this.picker.getMapper();
    const wellEntry = this.wellEntries.find((entry) => entry.mapper === pickedMapper);
    if (wellEntry) {
      const localPosition = this.picker.getPickPosition();
      return findNearestTrajectoryStation(
        wellEntry.input.trajectory,
        [localPosition[0] ?? 0, localPosition[1] ?? 0, localPosition[2] ?? 0],
        this.geometry.localOrigin
      );
    }
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
    const originalCellId = this.geometry.surface.faceOriginalCellIds[sourceFaceIndex] ?? 0;
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
    this.wells = [];
    this.removeWells();
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

  private rebuildWells(): void {
    this.removeWells();
    if (!this.geometry || !this.genericRenderWindow) {
      return;
    }
    const modelBounds = this.geometry.surface.modelBounds;
    const bounds: readonly [number, number, number, number, number, number] = [
      modelBounds[0] ?? 0, modelBounds[1] ?? 0,
      modelBounds[2] ?? 0, modelBounds[3] ?? 0,
      modelBounds[4] ?? 0, modelBounds[5] ?? 0
    ];
    const renderer = this.genericRenderWindow.getRenderer();
    for (const input of this.wells) {
      if (!input.settings.visible) {
        continue;
      }
      const polylinePlan = createTrajectoryPolylinePlan(
        input.trajectory,
        this.geometry.localOrigin,
        input.settings.clipToReservoirBounds ? bounds : undefined
      );
      if (polylinePlan.localPoints.length < 6) {
        continue;
      }
      const points = vtkPoints.newInstance();
      points.setData(polylinePlan.localPoints, 3);
      const lines = vtkCellArray.newInstance();
      lines.setData(polylinePlan.vtkLines);
      const polyData = vtkPolyData.newInstance();
      polyData.setPoints(points);
      polyData.setLines(lines);
      const mapper = vtkMapper.newInstance();
      const tubeFilter = input.settings.representation === "tube"
        ? vtkTubeFilter.newInstance({ radius: input.settings.radius, numberOfSides: 12, capping: true })
        : undefined;
      if (tubeFilter) {
        tubeFilter.setInputData(polyData);
        mapper.setInputConnection(tubeFilter.getOutputPort());
      } else {
        mapper.setInputData(polyData);
      }
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      actor.getProperty().setColor(...input.settings.color);
      actor.getProperty().setLineWidth(Math.max(1, input.settings.radius * 4));
      renderer.addActor(actor);
      const entry: WellRenderEntry = { input, actor, mapper, polyData, tubeFilter };

      if (input.settings.showMdTicks) {
        const tickPlan = createTrajectoryTickPlan(input.trajectory, this.geometry.localOrigin, input.settings.mdTickInterval, input.settings.radius * 2);
        if (tickPlan.localPoints.length > 0) {
          const tickPoints = vtkPoints.newInstance();
          tickPoints.setData(tickPlan.localPoints, 3);
          const tickLines = vtkCellArray.newInstance();
          tickLines.setData(tickPlan.vtkLines);
          const tickPolyData = vtkPolyData.newInstance();
          tickPolyData.setPoints(tickPoints);
          tickPolyData.setLines(tickLines);
          const tickMapper = vtkMapper.newInstance();
          tickMapper.setInputData(tickPolyData);
          const tickActor = vtkActor.newInstance();
          tickActor.setMapper(tickMapper);
          tickActor.getProperty().setColor(...input.settings.color);
          tickActor.getProperty().setLineWidth(1);
          renderer.addActor(tickActor);
          entry.tickActor = tickActor;
          entry.tickMapper = tickMapper;
          entry.tickPolyData = tickPolyData;
        }
      }

      if (input.settings.showLabel) {
        const labelActor = vtkTextActor.newInstance();
        labelActor.setInput(input.trajectory.wellName);
        labelActor.setDisplayPosition(0, 0);
        const labelProperty = vtkTextProperty.newInstance({
          fontColor: [...input.settings.color],
          resolution: 24,
          shadowColor: [0, 0, 0],
          shadowBlur: 1,
          shadowOffset: [1, 1]
        });
        labelActor.setProperty(labelProperty);
        renderer.addActor2D(labelActor);
        entry.labelActor = labelActor;
        entry.labelProperty = labelProperty;
        entry.labelPosition = [
          (input.trajectory.xyz[0] ?? 0) - this.geometry.localOrigin[0],
          (input.trajectory.xyz[1] ?? 0) - this.geometry.localOrigin[1],
          (input.trajectory.xyz[2] ?? 0) - this.geometry.localOrigin[2]
        ];
      }
      this.wellEntries.push(entry);
    }
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

  private removeWells(): void {
    const renderer = this.genericRenderWindow?.getRenderer();
    for (const entry of this.wellEntries) {
      renderer?.removeActor(entry.actor);
      if (entry.tickActor) {
        renderer?.removeActor(entry.tickActor);
      }
      if (entry.labelActor) {
        renderer?.removeActor2D(entry.labelActor);
      }
      entry.actor.delete();
      entry.mapper.delete();
      entry.polyData.delete();
      entry.tubeFilter?.delete();
      entry.tickActor?.delete();
      entry.tickMapper?.delete();
      entry.tickPolyData?.delete();
      entry.labelActor?.delete();
      entry.labelProperty?.delete();
    }
    this.wellEntries.splice(0);
  }

  private detachRenderWindow(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.genericRenderWindow?.delete();
    this.genericRenderWindow = undefined;
    this.container = undefined;
  }

  private render(): void {
    this.updateWellLabels();
    this.genericRenderWindow?.getRenderWindow().render();
  }

  private updateWellLabels(): void {
    if (!this.genericRenderWindow || !this.container) {
      return;
    }
    const renderer = this.genericRenderWindow.getRenderer();
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    for (const entry of this.wellEntries) {
      if (!entry.labelActor || !entry.labelPosition) {
        continue;
      }
      const display = renderer.worldToNormalizedDisplay(...entry.labelPosition, width / height);
      entry.labelActor.setDisplayPosition(Math.round((display[0] ?? 0) * width) + 8, Math.round((display[1] ?? 0) * height) + 8);
    }
  }
}

interface WellRenderEntry {
  readonly input: WellTrajectoryRenderInput;
  readonly actor: ReturnType<typeof vtkActor.newInstance>;
  readonly mapper: ReturnType<typeof vtkMapper.newInstance>;
  readonly polyData: ReturnType<typeof vtkPolyData.newInstance>;
  readonly tubeFilter: ReturnType<typeof vtkTubeFilter.newInstance> | undefined;
  tickActor?: ReturnType<typeof vtkActor.newInstance>;
  tickMapper?: ReturnType<typeof vtkMapper.newInstance>;
  tickPolyData?: ReturnType<typeof vtkPolyData.newInstance>;
  labelActor?: ReturnType<typeof vtkTextActor.newInstance>;
  labelProperty?: ReturnType<typeof vtkTextProperty.newInstance>;
  labelPosition?: readonly [number, number, number];
}