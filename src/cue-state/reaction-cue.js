
// Reaction Handling

function cue(type, prop, value, mutationDetails, observers, derivatives, stopPropagation) {

  // Collect observers and derivatives of the changed property and, recursively those of all of it's descendant derivatives

  let i, l, item;

  if (observers) {
    for (i = 0; i < observers.length; i++) {
      item = observers[i];
      if (MAIN_QUEUE.indexOf(item) === -1) {
        MAIN_QUEUE.push(item, new Observation(type, prop, value, mutationDetails));
      }
    }
  }

  if (derivatives && (l = derivatives.length) && stopPropagation === false) {

    // update internal cache of derivatives
    for (i = 0; i < l; i++) {
      derivatives[i].updateProperty(prop, value);
    }

    // recompute value and recurse
    let result;

    for (i = 0; i < l; i++) {

      item = derivatives[i];
      result = item.value; // calls "getter" -> recomputes value

      if (item.hasChanged) { // has value changed after recomputation -> recurse
        cue('change', item.ownPropertyName, result, undefined, item.observers, item.derivatives, item.stopPropagation);
      }

    }

  }

}

function cueImmediate(type, prop, value, mutationDetails, observers, derivatives, stopPropagation) {

  // Collect immediate observers and derivatives of the changed property. Don't recurse over sub-derivatives just yet.

  let i, item;

  if (observers) {
    for (i = 0; i < observers.length; i++) {
      item = observers[i];
      if (MAIN_QUEUE.indexOf(item) === -1) {
        MAIN_QUEUE.push(item, new Observation(type, prop, value, mutationDetails));
      }
    }
  }

  if (derivatives && stopPropagation === false) {
    for (i = 0; i < derivatives.length; i++) {
      derivatives[i].updateProperty(prop, value);
    }
  }

}

function cueAccumulated(derivatives) {

  for (let i = 0, item, result; i < derivatives.length; i++) {
    item = derivatives[i];
    result = item.value; // calls "getter" -> recomputes value
    if (item.hasChanged) {
      cue('change', item.ownPropertyName, result, undefined, item.observers, item.derivatives, item.stopPropagation);
    }
  }

}

function react() {

  isReacting = true;

  const l = MAIN_QUEUE.length;

  // MAIN_QUEUE contains tuples of [observer, changedValue, changedProperty]
  for (let i = 0; i < l; i += 3) {
    MAIN_QUEUE[i].react(MAIN_QUEUE[i + 1], MAIN_QUEUE[i + 2]);
  }

  // empty the queue
  MAIN_QUEUE.splice(0, l);

  isReacting = false;

}