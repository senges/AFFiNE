import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { dropTargetForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import type {
  DragLocationHistory,
  DropTargetRecord,
  ElementDragType,
  ExternalDragType,
} from '@atlaskit/pragmatic-drag-and-drop/types';
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import {
  attachInstruction,
  extractInstruction,
  type Instruction,
  type ItemMode,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { DNDData } from './types';

export type DropTargetDropEvent<D extends DNDData> = {
  treeInstruction: Instruction | null;
  closestEdge: Edge | null;
  /**
   * Location history for the drag operation
   */
  location: DragLocationHistory;
  /**
   * Data associated with the entity that is being dragged
   */
  source: Exclude<ElementDragType['payload'], 'data'> & {
    data: D['draggable'];
  };
  self: DropTargetRecord;
};

export type DropTargetDragEvent<D extends DNDData> = DropTargetDropEvent<D>;

export type DropTargetTreeInstruction = Instruction;

export type ExternalDragPayload = ExternalDragType['payload'];

type DropTargetGetFeedback<D extends DNDData> = Parameters<
  NonNullable<Parameters<typeof dropTargetForElements>[0]['canDrop']>
>[0] & {
  source: {
    data: D['draggable'];
  };
} & {
  treeInstruction: Instruction | null;
  closestEdge: Edge | null;
};

type DropTargetGet<T, D extends DNDData> =
  | T
  | ((data: DropTargetGetFeedback<D>) => T);

export type ExternalGetDataFeedbackArgs = Parameters<
  NonNullable<Parameters<typeof dropTargetForExternal>[0]['getData']>
>[0];

export type ExternalDataAdapter<D extends DNDData> = (
  args: ExternalGetDataFeedbackArgs
) => D['draggable'];

const getAdaptedEventArgs = <
  D extends DNDData,
  Args extends Pick<DropTargetGetFeedback<D>, 'source'>,
>(
  options: DropTargetOptions<D>,
  args: Args
): Args => {
  const data =
    !args.source['data'] && options.externalDataAdapter
      ? // @ts-expect-error hack for external data adapter (source has no data field)
        options.externalDataAdapter(args as ExternalGetDataFeedbackArgs)
      : args.source['data'];

  return {
    ...args,
    source: {
      ...args.source,
      data,
    },
  };
};

function dropTargetGet<T, D extends DNDData>(
  get: T,
  options: DropTargetOptions<D>
): T extends undefined
  ? undefined
  : T extends DropTargetGet<infer I, D>
    ? (
        args: Omit<DropTargetGetFeedback<D>, 'treeInstruction' | 'closestEdge'>
      ) => I
    : never {
  if (get === undefined) {
    return undefined as any;
  }

  return ((
    args: Omit<DropTargetGetFeedback<D>, 'treeInstruction' | 'closestEdge'>
  ) => {
    if (typeof get === 'function') {
      return (get as any)({
        ...getAdaptedEventArgs(options, args),
        get treeInstruction() {
          return options.treeInstruction
            ? extractInstruction(
                attachInstruction(
                  {},
                  {
                    input: args.input,
                    element: args.element,
                    currentLevel: options.treeInstruction.currentLevel,
                    indentPerLevel: options.treeInstruction.indentPerLevel,
                    mode: options.treeInstruction.mode,
                    block: options.treeInstruction.block,
                  }
                )
              )
            : null;
        },
        get closestEdge() {
          return options.closestEdge
            ? extractClosestEdge(
                attachClosestEdge(
                  {},
                  {
                    input: args.input,
                    element: args.element,
                    allowedEdges: options.closestEdge.allowedEdges,
                  }
                )
              )
            : null;
        },
      });
    } else {
      return {
        ...get,
        ...getAdaptedEventArgs(options, args),
      };
    }
  }) as any;
}

export interface DropTargetOptions<D extends DNDData = DNDData> {
  data?: DropTargetGet<D['dropTarget'], D>;
  canDrop?: DropTargetGet<boolean, D>;
  dropEffect?: DropTargetGet<'copy' | 'link' | 'move', D>;
  isSticky?: DropTargetGet<boolean, D>;
  treeInstruction?: {
    block?: Instruction['type'][];
    mode: ItemMode;
    currentLevel: number;
    indentPerLevel: number;
  };
  closestEdge?: {
    allowedEdges: Edge[];
  };
  onDrop?: (data: DropTargetDropEvent<D>) => void;
  onDrag?: (data: DropTargetDragEvent<D>) => void;
  /**
   * external data adapter.
   * if this is provided, the drop target will handle external elements as well.
   *
   * @default undefined
   */
  externalDataAdapter?: ExternalDataAdapter<D>;
}

export const useDropTarget = <D extends DNDData = DNDData>(
  getOptions: () => DropTargetOptions<D> = () => ({}),
  deps: any[] = []
) => {
  const dropTargetRef = useRef<any>(null);
  const [draggedOver, setDraggedOver] = useState<boolean>(false);
  const [treeInstruction, setTreeInstruction] = useState<Instruction | null>(
    null
  );
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [dropEffect, setDropEffect] = useState<'copy' | 'link' | 'move' | null>(
    null
  );
  const [draggedOverDraggable, setDraggedOverDraggable] = useState<
    DropTargetDropEvent<D>['source'] | null
  >(null);
  const [draggedOverPosition, setDraggedOverPosition] = useState<{
    /**
     * relative position to the drop target element top-left corner
     */
    relativeX: number;
    relativeY: number;
    clientX: number;
    clientY: number;
  }>({ relativeX: 0, relativeY: 0, clientX: 0, clientY: 0 });

  const enableDraggedOver = useRef(false);
  const enableDraggedOverDraggable = useRef(false);
  const enableDraggedOverPosition = useRef(false);
  const enableDropEffect = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(getOptions, deps);

  const dropTargetOptions = useMemo(() => {
    return {
      get element() {
        return dropTargetRef.current;
      },
      canDrop: dropTargetGet(options.canDrop, options),
      getDropEffect: dropTargetGet(options.dropEffect, options),
      getIsSticky: dropTargetGet(options.isSticky, options),
      onDrop: (args: DropTargetDropEvent<D>) => {
        args = getAdaptedEventArgs(options, args);
        if (enableDraggedOver.current) {
          setDraggedOver(false);
        }
        if (enableDraggedOverDraggable.current) {
          setDraggedOverDraggable(null);
        }
        if (enableDraggedOverPosition.current) {
          setDraggedOverPosition({
            relativeX: 0,
            relativeY: 0,
            clientX: 0,
            clientY: 0,
          });
        }
        if (options.treeInstruction) {
          setTreeInstruction(null);
          if (dropTargetRef.current) {
            delete dropTargetRef.current.dataset['treeInstruction'];
          }
        }
        if (options.closestEdge) {
          setClosestEdge(null);
        }
        if (enableDropEffect.current) {
          setDropEffect(null);
        }
        if (dropTargetRef.current) {
          delete dropTargetRef.current.dataset['draggedOver'];
        }
        if (
          args.location.current.dropTargets[0]?.element ===
          dropTargetRef.current
        ) {
          options.onDrop?.({
            ...args,
            treeInstruction: extractInstruction(args.self.data),
            closestEdge: extractClosestEdge(args.self.data),
          } as DropTargetDropEvent<D>);
        }
      },
      getData: (args: DropTargetGetFeedback<D>) => {
        args = getAdaptedEventArgs(options, args);
        const originData = dropTargetGet(options.data ?? {}, options)(args);
        const { input, element } = args;
        const withInstruction = options.treeInstruction
          ? attachInstruction(originData, {
              input,
              element,
              currentLevel: options.treeInstruction.currentLevel,
              indentPerLevel: options.treeInstruction.indentPerLevel,
              mode: options.treeInstruction.mode,
              block: options.treeInstruction.block,
            })
          : originData;
        const withClosestEdge = options.closestEdge
          ? attachClosestEdge(withInstruction, {
              element,
              input,
              allowedEdges: options.closestEdge.allowedEdges,
            })
          : withInstruction;
        return withClosestEdge;
      },
      onDrag: (args: DropTargetDragEvent<D>) => {
        args = getAdaptedEventArgs(options, args);
        if (
          args.location.current.dropTargets[0]?.element ===
          dropTargetRef.current
        ) {
          if (enableDraggedOverDraggable.current) {
            setDraggedOverDraggable(args.source);
          }
          let instruction = null;
          let closestEdge = null;
          if (options.treeInstruction) {
            instruction = extractInstruction(args.self.data);
            setTreeInstruction(instruction);
            if (dropTargetRef.current) {
              dropTargetRef.current.dataset['treeInstruction'] =
                instruction?.type;
            }
          }
          if (options.closestEdge) {
            closestEdge = extractClosestEdge(args.self.data);
            setClosestEdge(closestEdge);
          }
          if (enableDropEffect.current) {
            setDropEffect(args.self.dropEffect);
          }
          if (enableDraggedOverPosition.current) {
            const rect = args.self.element.getBoundingClientRect();
            const { clientX, clientY } = args.location.current.input;
            setDraggedOverPosition({
              relativeX: clientX - rect.x,
              relativeY: clientY - rect.y,
              clientX: clientX,
              clientY: clientY,
            });
          }
          options.onDrag?.({
            ...args,
            treeInstruction: instruction,
            closestEdge,
          } as DropTargetDropEvent<D>);
        }
      },
      onDropTargetChange: (args: DropTargetDropEvent<D>) => {
        args = getAdaptedEventArgs(options, args);
        if (
          args.location.current.dropTargets[0]?.element ===
          dropTargetRef.current
        ) {
          if (enableDraggedOver.current) {
            setDraggedOver(true);
          }
          if (options.treeInstruction) {
            const instruction = extractInstruction(args.self.data);
            setTreeInstruction(instruction);
            if (dropTargetRef.current) {
              dropTargetRef.current.dataset['treeInstruction'] =
                instruction?.type;
            }
          }
          if (options.closestEdge) {
            const closestEdge = extractClosestEdge(args.self.data);
            setClosestEdge(closestEdge);
          }
          if (enableDropEffect.current) {
            setDropEffect(args.self.dropEffect);
          }
          if (enableDraggedOverDraggable.current) {
            setDraggedOverDraggable(args.source);
          }
          if (enableDraggedOverPosition.current) {
            const rect = args.self.element.getBoundingClientRect();
            setDraggedOverPosition({
              relativeX: args.location.current.input.clientX - rect.x,
              relativeY: args.location.current.input.clientY - rect.y,
              clientX: args.location.current.input.clientX,
              clientY: args.location.current.input.clientY,
            });
          }
          if (dropTargetRef.current) {
            dropTargetRef.current.dataset['draggedOver'] = 'true';
          }
        } else {
          if (enableDraggedOver.current) {
            setDraggedOver(false);
          }
          if (enableDraggedOverDraggable.current) {
            setDraggedOverDraggable(null);
          }
          if (options.treeInstruction) {
            setTreeInstruction(null);
            if (dropTargetRef.current) {
              delete dropTargetRef.current.dataset['treeInstruction'];
            }
          }
          if (enableDropEffect.current) {
            setDropEffect(args.self.dropEffect);
          }
          if (enableDraggedOverPosition.current) {
            setDraggedOverPosition({
              relativeX: 0,
              relativeY: 0,
              clientX: 0,
              clientY: 0,
            });
          }
          if (options.closestEdge) {
            setClosestEdge(null);
          }
          if (dropTargetRef.current) {
            delete dropTargetRef.current.dataset['draggedOver'];
          }
        }
      },
    };
  }, [options]);

  useEffect(() => {
    if (!dropTargetRef.current) {
      return;
    }
    return dropTargetForElements(dropTargetOptions as any);
  }, [dropTargetOptions]);

  useEffect(() => {
    if (!dropTargetRef.current || !options.externalDataAdapter) {
      return;
    }
    return dropTargetForExternal(dropTargetOptions as any);
  }, [dropTargetOptions, options.externalDataAdapter]);

  return {
    dropTargetRef,
    get draggedOver() {
      enableDraggedOver.current = true;
      return draggedOver;
    },
    get draggedOverDraggable() {
      enableDraggedOverDraggable.current = true;
      return draggedOverDraggable;
    },
    get draggedOverPosition() {
      enableDraggedOverPosition.current = true;
      return draggedOverPosition;
    },
    get dropEffect() {
      enableDropEffect.current = true;
      return dropEffect;
    },
    treeInstruction,
    closestEdge,
  };
};
