import { create } from 'zustand';
import { Checkpoint, HistoryEntry, Patch } from '../types/history';
import {guardProjectPublicationFields} from '../services/storage/projectPublication';
import type {HistorySnapshot} from '../services/storage/historyRepository';

/** Prepare one exact Undo/Redo change without touching either live store. */
export function prepareHistoryCommit(snapshot:HistorySnapshot,label:string,patches:Patch[],inversePatches:Patch[],backups:Array<{label:string;screenSnapshot:Checkpoint['screenSnapshot']}>=[]):HistorySnapshot{
 const timestamp=Date.now(),entry:HistoryEntry={id:`hist_${timestamp}_${crypto.randomUUID().slice(0,8)}`,label,timestamp,patches:structuredClone(patches),inversePatches:structuredClone(inversePatches)};
 const checkpoints=backups.map(backup=>({id:`cp_${timestamp}_${crypto.randomUUID().slice(0,8)}`,label:backup.label,timestamp,screenSnapshot:structuredClone(backup.screenSnapshot)})).reverse();
 return {past:[...snapshot.past.slice(-199),entry],future:[],checkpoints:[...checkpoints,...snapshot.checkpoints].slice(0,50)};
}

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  checkpoints: Checkpoint[];
  archiveError:string|null;
  setArchiveError:(message:string|null)=>void;

  canUndo: () => boolean;
  canRedo: () => boolean;
  
  commit: (label: string, patches: Patch[], inversePatches: Patch[]) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  clear: () => void;
  /** 从归档恢复整条历史（工程打开时调用，传 null 表示以空栈启动） */
  restore: (snapshot: { past: HistoryEntry[]; future: HistoryEntry[]; checkpoints: Checkpoint[] } | null) => void;

  // D17 / §3.8.4 Checkpoint API
  addCheckpoint: (label: string, screenSnapshot: Checkpoint['screenSnapshot']) => string;
  getCheckpoints: () => Checkpoint[];
}

let applyPatchesHandler: ((patches: Patch[]) => void) | null = null;

export const setApplyPatchesHandler = (handler: (patches: Patch[]) => void) => {
  applyPatchesHandler = handler;
};

export const useHistoryStore = create<HistoryState>((rawSet, get) => {
 const set:typeof rawSet=(partial,replace)=>{const next=typeof partial==='function'?partial(get()):partial;guardProjectPublicationFields(get(),next,replace,['past','future','checkpoints','archiveError']);rawSet(next,replace);};
 return ({
  past: [],
  future: [],
  checkpoints: [],
  archiveError:null,
  setArchiveError:archiveError=>set({archiveError}),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  commit: (label: string, patches: Patch[], inversePatches: Patch[]) => {
    const entry: HistoryEntry = {
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label,
      timestamp: Date.now(),
      patches,
      inversePatches
    };

    set((state) => ({
      past: [...state.past.slice(-199), entry], // keep up to 200
      future: [] // branching drops redo stack
    }));
  },

  undo: () => {
    const { past, future } = get();
    if (past.length === 0) return null;
    const entry = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [entry, ...future]
    });
    if (applyPatchesHandler) {
      applyPatchesHandler(entry.inversePatches);
    }
    return entry;
  },

  redo: () => {
    const { past, future } = get();
    if (future.length === 0) return null;
    const entry = future[0];
    set({
      past: [...past, entry],
      future: future.slice(1)
    });
    if (applyPatchesHandler) {
      applyPatchesHandler(entry.patches);
    }
    return entry;
  },

  clear: () => set({ past: [], future: [] }),

  restore: (snapshot) =>
    set({
      archiveError:null,
      past: snapshot?.past ?? [],
      future: snapshot?.future ?? [],
      checkpoints: snapshot?.checkpoints ?? []
    }),

  addCheckpoint: (label: string, screenSnapshot: Checkpoint['screenSnapshot']) => {
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const checkpoint: Checkpoint = {
      id,
      label,
      timestamp: Date.now(),
      screenSnapshot
    };
    set((state) => ({
      checkpoints: [checkpoint, ...state.checkpoints.slice(0, 49)] // keep up to 50
    }));
    return id;
  },

  getCheckpoints: () => get().checkpoints
 });
});
const setHistoryState=useHistoryStore.setState;
useHistoryStore.setState=(partial,replace)=>{const next=typeof partial==='function'?partial(useHistoryStore.getState()):partial;guardProjectPublicationFields(useHistoryStore.getState(),next,replace,['past','future','checkpoints','archiveError']);setHistoryState(next,replace);};
