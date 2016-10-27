// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
'use strict';

import {
  IRenderMime
} from 'jupyterlab/lib/rendermime';

import {
  OutputAreaWidget, OutputAreaModel
} from 'jupyterlab/lib/notebook/output-area';

import {
  IListChangedArgs
} from 'jupyterlab/lib/common/observablelist';

import {
  nbformat
} from 'jupyterlab/lib/notebook/notebook/nbformat';

import {
  DragDropPanel, DragPanel, findChild
} from '../common/dragpanel';

import {
  Widget
} from 'phosphor/lib/ui/widget';

import {
  Panel, PanelLayout
} from 'phosphor/lib/ui/panel';

import {
  FlexPanel
} from '../upstreaming/flexpanel';

import {
  createNbdimeMergeView
} from '../common/mergeview';

import {
  CollapsiblePanel
} from '../common/collapsiblepanel';

import {
  NotebookMergeModel, CellMergeModel, MetadataMergeModel
} from './model';

import {
  IStringDiffModel, StringDiffModel, IDiffModel, OutputDiffModel
} from '../diff/model';

import {
  CellDiffWidget
} from '../diff/widget';


const NBMERGE_CLASS = 'jp-Notebook-merge';

const ROOT_METADATA_CLASS = 'jp-Metadata-diff';
const CELLMERGE_CLASS = 'jp-Cell-merge';
const CELL_HEADER_CLASS = 'jp-Merge-cellHeader';
const CELL_HEADER_TITLE_CLASS = 'jp-Merge-cellHeader-title';

const MARKED_DELETE = 'jp-mod-todelete';

const SOURCE_ROW_CLASS = 'jp-Cellrow-source';
const METADATA_ROW_CLASS = 'jp-Cellrow-metadata';
const OUTPUTS_ROW_CLASS = 'jp-Cellrow-outputs';

// Merge classes:
const BASE_MERGE_CLASS = 'jp-Merge-base';
const LOCAL_MERGE_CLASS = 'jp-Merge-local';
const REMOTE_MERGE_CLASS = 'jp-Merge-remote';
const MERGED_MERGE_CLASS = 'jp-Merge-merged';

const ONEWAY_LOCAL_CLASS = 'jp-Merge-oneway-local';
const ONEWAY_REMOTE_CLASS = 'jp-Merge-oneway-remote';
const TWOWAY_ADDITION_CLASS = 'jp-Merge-twoway-addition';
const TWOWAY_DELETION_CLASS = 'jp-Merge-twoway-deletion';

const MERGE_CLASSES = [BASE_MERGE_CLASS, LOCAL_MERGE_CLASS,
    REMOTE_MERGE_CLASS, MERGED_MERGE_CLASS];


/**
 * An OutputAreaModel which allows for reordering of its
 * outputs.
 */
class ReorderableOutputModel extends OutputAreaModel {

  insert(index: number, item: OutputAreaModel.Output): void {
    // Note: We do not need worry about consolidating outputs
    // like the `add` method in parent class.
    this.list.insert(index, item);
  }

  move(fromIndex: number, toIndex: number): void {
    // Note: We do not need worry about consolidating outputs
    // like the `add` method in parent class.
    this.list.move(fromIndex, toIndex);
  }
}

/**
 * An OutputAreaWidget which supports the reordering
 * capabilities of ReorderableOutputModel
 */
class ReorderableOutputWidget extends OutputAreaWidget {

  model: ReorderableOutputModel;

  protected onModelStateChanged(sender: OutputAreaModel, args: IListChangedArgs<nbformat.IOutput>) {
    switch (args.type) {
    case 'add':
      // Children are NOT always added at the end.
      this.addChild(args.newIndex);
      break;
    case 'move':
      let layout = this.layout as PanelLayout;
      layout.insertWidget(args.newIndex,
        layout.widgets.at(args.oldIndex));
      break;
    default:
      return super.onModelStateChanged(sender, args);
    }
  }

  protected addChild(index?: number): void {
    super.addChild();
    let layout = this.layout as PanelLayout;
    if (index !== undefined && index !== layout.widgets.length - 1) {
      // Move the widget added at the end
      layout.insertWidget(index,
        layout.widgets.at(layout.widgets.length - 1));
      // Update new widget to match the newly inserted
      // model item
      this.updateChild(index);
    }
  }
}

/**
 * Widget for showing side by side comparison and picking of merge outputs
 */
class RenderableOutputsMergeView extends DragDropPanel {

  static makeOutputsDraggable(area: OutputAreaWidget): void {
    let i = area.layout.iter();
    for (let w = i.next(); w !== undefined; w = i.next()) {
      DragPanel.makeHandle(w);
    }
  }

  /**
   *
   */
  constructor(merged: nbformat.IOutput[],
              classes: string[], rendermime: IRenderMime,
              base: nbformat.IOutput[] | null, remote: nbformat.IOutput[] | null,
              local: nbformat.IOutput[] | null) {
    super();

    if (!base !== !remote || !base !== !local) {
      // Assert that either none, or all of base/remote/local are given
      throw new Error(
        'Renderable outputs merge-view either takes only merged output ' +
        'or a full set of four output lists.');
    }

    if (base) {
      this.base = new OutputAreaModel();
      for (let output of base) {
          this.base.add(output);
      }
      this.remote = new OutputAreaModel();
      for (let output of remote!) {
          this.remote.add(output);
      }
      this.local = new OutputAreaModel();
      for (let output of local!) {
          this.local.add(output);
      }
    }
    this.merged = new ReorderableOutputModel();
    for (let output of merged) {
        this.merged.add(output);
    }
    this.rendermime = rendermime;
    this.panes = [];

    this.init(classes);
  }

  init(classes: string[]): void {
    let row = new FlexPanel({direction: 'left-to-right', evenSizes: true});
    if (this.local) {
      let leftPane = new OutputAreaWidget({rendermime: this.rendermime});
      leftPane.addClass(classes[1]);
      leftPane.model = this.local;
      row.addWidget(leftPane);
      this.panes.push(leftPane);
    }
    if (this.base) {
      let basePane = new OutputAreaWidget({rendermime: this.rendermime});
      basePane.addClass(classes[0]);
      basePane.model = this.base;
      row.addWidget(basePane);
      this.panes.push(basePane);
    }
    if (this.remote) {
      let rightPane = new OutputAreaWidget({rendermime: this.rendermime});
      rightPane.addClass(classes[2]);
      rightPane.model = this.remote;
      row.addWidget(rightPane);
      this.panes.push(rightPane);
    }
    if (row.widgets.length > 0) {
      this.addWidget(row);
      row = new FlexPanel({direction: 'left-to-right', evenSizes: true});
    }
    this.mergePane = new ReorderableOutputWidget({rendermime: this.rendermime});
    this.mergePane.addClass(classes[3]);
    this.mergePane.model = this.merged;
    row.addWidget(this.mergePane);
    this.panes.push(this.mergePane);
    this.addWidget(row);

    for (let p of this.panes) {
      RenderableOutputsMergeView.makeOutputsDraggable(p);
    }
  }

  /**
   * Overrided version to allow drag and drop from source lists to merged list
   */
  protected findDragTarget(handle: HTMLElement): HTMLElement | null {
    // First check for a drag handle
    if (handle === null) {
      return null;
    }

    // Next find out which pane it belongs to, and which output it belongs to
    for (let pane of this.panes) {
      let child = findChild(pane.node, handle);
      if (child !== null) {
        return child;
      }
    }
    return null;
  }

  /**
   * Overrided version to allow identifying source pane and source output
   */
  protected targetFromKey(key: any): Widget {
    let indices = key as number[];
    let paneIndex = indices[0];
    let outputIndex = indices[1];
    let pane = this.panes[paneIndex];
    return (pane.layout as PanelLayout).widgets.at(outputIndex);
  }

  protected getIndexOfChildNode(node: HTMLElement, parent?: PanelLayout): any {
    for (let pane of this.panes) {
      let child = findChild(pane.node, node);
      if (child !== null) {
        let paneIndex = this.panes.indexOf(pane);
        return [paneIndex, super.getIndexOfChildNode(child,
                pane.layout as PanelLayout)];
      }
    }
    return null;
  }


  /**
   * Called when something has been dropped in the panel.
   *
   * As only internal moves are supported, we know the type of the keys
   */
  protected move(from: number[], to: number[]): void {
    let paneFrom = from[0];
    let paneTo = to[0];
    if (this.panes[paneTo] !== this.mergePane) {
      // Shouldn't happen if drop target code is correct...
      return;
    }
    let outputFrom = from[1];
    let outputTo = to[1];
    let adjustedTo = outputTo;
    if (paneFrom === paneTo) {
      if (outputTo > outputFrom) {
        // Have to adjust index for insertWidget in same instance
        adjustedTo -= 1;
        to[1] = adjustedTo;
      } else if (outputFrom === outputTo) {
        // No-op, same position
        return;
      }
    }
    let toModel = this.mergePane.model;
    let fromModel = this.panes[paneFrom].model;
    if (paneTo !== paneFrom) {
      toModel.insert(adjustedTo, fromModel.get(outputFrom));
    } else {
      toModel.move(outputFrom, adjustedTo);
    }
    RenderableOutputsMergeView.makeOutputsDraggable(this.mergePane);
  }

  /**
   * Find a drop target from a given node
   *
   * Returns null if no valid drop target was found.
   */
  protected findDropTarget(node: HTMLElement): HTMLElement | null {
    // Only valid drop target is in merge pane!
    return findChild(this.mergePane.node, node);
  }

  protected getDragImage(handle: HTMLElement) {
    let target = this.findDragTarget(handle);
    if (target) {
      let image = target.cloneNode(true) as HTMLElement;
      image.style.width = target.offsetWidth.toString() + 'px';
      return image;
    }
    return null;
  }

  base: OutputAreaModel | null = null;

  remote: OutputAreaModel | null = null;

  local: OutputAreaModel | null = null;

  merged: ReorderableOutputModel;

  mergePane: ReorderableOutputWidget;

  panes: OutputAreaWidget[];

  rendermime: IRenderMime;
}

/**
 * CellMergeWidget for cell changes
 */
export
class CellMergeWidget extends Panel {

  static createMergeView(local: IDiffModel, remote: IDiffModel, merged: IDiffModel,
                         editorClasses: string[]): Widget | null {
    let view: Widget | null = null;
    if (merged instanceof StringDiffModel) {
      view = createNbdimeMergeView(remote as IStringDiffModel, editorClasses,
        local as IStringDiffModel, merged);
    }
    return view;
  }

  protected static getOutputs(models: OutputDiffModel[], base?: boolean): nbformat.IOutput[] {
    let raw: nbformat.IOutput[] = [];
    for (let m of models) {
      if (base === true) {
        if (m.base) {
          raw.push(m.base);
        }
      } else {
        if (m.remote) {
          raw.push(m.remote);
        }
      }
    }
    return raw;
  }

  /**
   *
   */
  constructor(model: CellMergeModel, rendermime: IRenderMime,
              mimetype: string) {
    super();
    this.addClass(CELLMERGE_CLASS);
    this._model = model;
    this._rendermime = rendermime;
    this.mimetype = mimetype;

    this.init();
  }

  protected init() {
    let model = this.model;
    let CURR_CLASSES = MERGE_CLASSES.slice();  // copy

    this.createHeader();

    /*
     Two different display layouts depending on cell merge type:
     1. Unchanged or one way insert/delete of cell, or identical insert/delete:
        Single r/w editor (merged), with appropriate coloring for insert/delete
     2. Everything else:
        Full 4x merge view
    */
    let ladd = model.local && model.local.added;
    let ldel = model.local && model.local.deleted;
    let radd = model.remote && model.remote.added;
    let rdel = model.remote && model.remote.deleted;
    if (ladd && !radd || ldel && !rdel) {
      this.headerTitle = ladd ? 'Cell added locally' : 'Cell deleted locally';
    } else if (radd && !ladd || rdel && !ldel) {
      this.headerTitle = radd ? 'Cell added remotely' : 'Cell deleted remotely';
    }

    if (model.local === null || model.remote === null || (  // One sided change
          model.local.unchanged && model.remote.unchanged &&
          model.merged.unchanged) ||  // Unchanged
          model.local.added !== model.remote.added ||  // Onesided addition
          model.local.deleted && model.remote.unchanged ||  // Onesided deletion (other side unchanged)
          model.local.unchanged && model.remote.deleted ||  // Onesided deletion (other side unchanged)
          model.local.added && model.agreedCell || // Identical additions
          model.local.deleted && model.remote.deleted   // Deletion on both
          ) {
      // Add single view of source:
      let view = CellDiffWidget.createView(
        model.merged.source, model.merged, CURR_CLASSES, this._rendermime);
      if (ladd && !radd || ldel && !rdel) {
        this.addClass(ONEWAY_LOCAL_CLASS);
      } else if (radd && !ladd || rdel && !ldel) {
        this.addClass(ONEWAY_REMOTE_CLASS);
      } else if (ldel && rdel) {
        this.headerTitle = 'Deleted on both sides';
        this.addClass(TWOWAY_DELETION_CLASS);
      } else if (ladd && radd) {
        this.headerTitle = 'Added on both sides';
        this.addClass(TWOWAY_ADDITION_CLASS);
      }
      view.addClass(SOURCE_ROW_CLASS);
      this.addWidget(view);
    } else {
      // Setup full 4-way mergeview of source, metadata and outputs
      // as needed (if changed). Source/metadata/output are each a "row"
      let sourceView: Widget | null = null;
      if (model.local.source.unchanged && model.remote.source.unchanged &&
          model.merged.source.unchanged) {
        // Use single unchanged view of source
        sourceView = CellDiffWidget.createView(
          model.merged.source, model.merged, CURR_CLASSES, this._rendermime);
      } else {
        sourceView = CellMergeWidget.createMergeView(
          model.local.source,
          model.remote.source,
          model.merged.source,
          CURR_CLASSES);
      }
      if (sourceView === null) {
        throw new Error('Was not able to create merge view for cell!');
      }
      sourceView.addClass(SOURCE_ROW_CLASS);
      this.addWidget(sourceView);

      let metadataChanged = false;
      let outputsChanged = false;
      for (let m of model.subModels) {
        if (!m || m.deleted) {
          // Don't consider deleted cells
          continue;
        }
        metadataChanged = metadataChanged || (
          !!m.metadata && !m.metadata.unchanged);

        if (m.outputs && m.outputs.length > 0) {
          for (let o of m.outputs) {
            outputsChanged = outputsChanged || !o.unchanged;
          }
        }
      }

      if (metadataChanged) {
        let metadataView = CellMergeWidget.createMergeView(
            model.local.metadata,
            model.remote.metadata,
            model.merged.metadata,
            CURR_CLASSES);
        if (metadataView === null) {
          throw new Error('Was not able to create merge view for cell metadata!');
        }
        let container = new Panel();
        container.addWidget(metadataView);

        let header = 'Metadata changed';
        let collapser = new CollapsiblePanel(container, header, true);
        collapser.addClass(METADATA_ROW_CLASS);
        this.addWidget(collapser);
      }
      if (outputsChanged || model.merged.outputs && model.merged.outputs.length > 0) {
        // We know here that we have code cell
        // -> all have outputs !== null
        let baseOut = CellMergeWidget.getOutputs(model.local.outputs!, true);
        let localOut = CellMergeWidget.getOutputs(model.local.outputs!);
        let remoteOut = CellMergeWidget.getOutputs(model.remote.outputs!);
        let mergedOut = CellMergeWidget.getOutputs(model.merged.outputs!);
        let view = new RenderableOutputsMergeView(
          mergedOut, MERGE_CLASSES, this._rendermime,
          baseOut, remoteOut, localOut);

        let header = outputsChanged ? 'Outputs changed' : 'Outputs unchanged';
        let collapser = new CollapsiblePanel(view, header, !outputsChanged);
        collapser.addClass(OUTPUTS_ROW_CLASS);
        this.addWidget(collapser);
      }
    }
  }

  protected createHeader(): void {
    let header = new Panel();
    header.addClass(CELL_HEADER_CLASS);

    // Add drag handle
    let w = DragPanel.createDefaultHandle();
    header.addWidget(w);

    // Add title widget
    w = new Widget();
    this.headerTitleWidget = w;
    w.addClass(CELL_HEADER_TITLE_CLASS);
    header.addWidget(w);

    // Add "delete cell" checkbox
    this.deleteToggle = document.createElement('input');
    this.deleteToggle.setAttribute('type', 'checkbox');
    this.deleteToggle.checked = this.model.deleteCell;
    if (this.model.deleteCell) {
      this.addClass(MARKED_DELETE);
    }
    // Map button -> model
    this.deleteToggle.onchange = (event) => {
      this.model.deleteCell = this.deleteToggle.checked;
      if (this.model.deleteCell) {
        this.addClass(MARKED_DELETE);
      } else {
        this.removeClass(MARKED_DELETE);
      }
    };
    // Map model -> button
    this.model.deleteCellChanged.connect((_model, value) => {
      this.deleteToggle.checked = value;
      if (value) {
        this.addClass(MARKED_DELETE);
      } else {
        this.removeClass(MARKED_DELETE);
      }
    });
    // Create label for checkbox:
    w = new Widget();
    let label = document.createElement('label');
    label.innerText = 'Delete cell';
    // Combine checkbox and label:
    label.insertBefore(this.deleteToggle, label.childNodes[0]);
    // Add checkbox to header:
    w.node.appendChild(label);
    w.addClass('jp-Merge-delete-toggle');
    header.addWidget(w);

    // Add header to widget
    this.addWidget(header);
    this.header = header;
  }

  mimetype: string;

  header: Panel;
  deleteToggle: HTMLInputElement;
  headerTitleWidget: Widget;

  set headerTitle(value: string) {
    this.headerTitleWidget.node.innerText = value;
  }

  /**
   * Get the model for the widget.
   *
   * #### Notes
   * This is a read-only property.
   */
  get model(): CellMergeModel {
    return this._model;
  }

  protected _model: CellMergeModel;
  protected _rendermime: IRenderMime;
}

/**
 * MetadataWidget for changes to Notebook-level metadata
 */
export
class MetadataMergeWidget extends Panel {
  constructor(model: MetadataMergeModel) {
    super();
    this._model = model;
    this.addClass(ROOT_METADATA_CLASS);
    this.init();
  }

  init() {
    let model = this._model;
    let CURR_CLASSES = MERGE_CLASSES.slice();  // copy

    // We know/assume that MetadataMergeModel never has
    // null values for local/remote:
    let view: Widget = createNbdimeMergeView(
      model.remote!, CURR_CLASSES, model.local!, model.merged);
    view = new CollapsiblePanel(
      view, 'Notebook metadata changed', true);
    this.addWidget(view);
  }

  private _model: MetadataMergeModel;
}


/**
 * NotebookMergeWidget
 */
export
class NotebookMergeWidget extends DragDropPanel {
  constructor(model: NotebookMergeModel,
              rendermime: IRenderMime) {
    super();
    this._model = model;
    this._rendermime = rendermime;
    let layout = this.layout as PanelLayout;

    this.addClass(NBMERGE_CLASS);

    if (model.metadata.decisions.length > 0) {
      layout.addWidget(new MetadataMergeWidget(model.metadata));
    }
    for (let c of model.cells) {
      layout.addWidget(new CellMergeWidget(c, rendermime, model.mimetype));
    }
  }

  /**
   * Get the model for the widget.
   *
   * #### Notes
   * This is a read-only property.
   */
  get model(): NotebookMergeModel {
    return this._model;
  }

  protected move(from: number, to: number): void {
    // Move cell in model list
    this._model.cells.splice(to, 0, this._model.cells.splice(from, 1)[0]);
    super.move(from, to);
  }

  private _model: NotebookMergeModel;
  private _rendermime: IRenderMime;
}
