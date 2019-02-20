
const REACTION_BUFFER_TIME = 1000 / 60;
let REACTION_BUFFER = null;

/**
 * Runs through the Main Queue to execute each collected reaction with each collected property value as the first and only argument.
 * Calls to react() are automatically buffered and internal flush() is only called ~16.7ms after the last call to react().
 * This accumulates reactions during batch operations with many successive calls to react() and flushes them in one go when the call
 * rate is decreased. Because reactions likely trigger rendering, this attempts to defer and separate rendering from internal value updating and change propagation.
 * Main Queue is emptied after each call to react.
 * Since react is the last function called after a property has changed (with each change increasing the accumulation depth), we decrease the depth by one for
 * each call to react and empty the accumulation arrays when accumulationDepth === 0 ie: we've "stepped out of" the initial change and all of it's derived changes throughout the state tree.
 * Note that this is done synchronously and outside of buffering.
 */
function react() {

  clearTimeout(REACTION_BUFFER);

  REACTION_BUFFER = setTimeout(flushReactionBuffer, REACTION_BUFFER_TIME);

  if (--accumulationDepth === 0) {
    while(ACCUMULATED_INSTANCES.length) ACCUMULATED_INSTANCES.pop();
    while(QUEUED_DERIVATIVE_INSTANCES.length) QUEUED_DERIVATIVE_INSTANCES.pop();
  }

}

function flushReactionBuffer() {
  // Queue contains tuples of (handler, value) -> call i[0](i[1]) ie handler(value)
  for (let i = 0; i < MAIN_QUEUE.length; i += 2) MAIN_QUEUE[i](MAIN_QUEUE[i + 1]);
  while(MAIN_QUEUE.length) MAIN_QUEUE.pop(); // flush
  REACTION_BUFFER = null;
}