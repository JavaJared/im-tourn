// Serialize writes, retaining the earliest unsaved baseline and latest edits.
export function createSaveBuffer(write, notify) {
  let baseline, desired, pending = false, running = null;
  const flush = () => {
    if (running) return running;
    if (!pending) return Promise.resolve(true);
    notify('saving');
    const task = Promise.resolve().then(async () => {
      while (pending) {
        const target = desired;
        try { await write(baseline, target); }
        catch (error) { notify('error', error); return false; }
        baseline = target;
        if (desired === target) pending = false;
      }
      notify('saved'); return true;
    });
    running = task;
    task.finally(() => { if (running === task) running = null; });
    return task;
  };
  return {
    save(before, next) { if (!pending) baseline = before; desired = next; pending = true; return flush(); },
    retry: flush, hasPending: () => pending,
  };
}
