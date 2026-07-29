"use client";

let listenersCount = 0;
let getDocCount = 0;
let getDocsCount = 0;

export const firestoreDiagnostics = {
  getStats: () => ({
    listeners: listenersCount,
    getDoc: getDocCount,
    getDocs: getDocsCount,
  }),
  incrementListener: () => {
    listenersCount++;
  },
  decrementListener: () => {
    listenersCount = Math.max(0, listenersCount - 1);
  },
  incrementGetDoc: () => {
    getDocCount++;
  },
  incrementGetDocs: () => {
    getDocsCount++;
  },
};
