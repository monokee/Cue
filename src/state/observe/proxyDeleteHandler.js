
function proxyDeleteHandler(target, prop) {

  if (!isReacting) {

    if (target.hasOwnProperty(prop)) {

      const instance = target[__CUE__];

      const oldValue = instance.valueCache.get(prop);

      let inQueue = instance.attemptCue(prop, undefined, oldValue);

      if (instance.parent) {
        const oldTarget = Array.isArray(target) ? target.slice() : Object.assign({}, target);
        inQueue += instance.parent.attemptCue.call(instance.parent, instance.ownPropertyName, target, oldTarget);
      }

      _delete(target, prop);
      instance.valueCache.delete(prop);

      if (inQueue > 0 && !isAccumulating) {
        react();
      }

      return true;

    }

  } else {

    console.warn(`Deletion of "${prop}" ignored. Don't mutate state in a reaction. Refactor to computed properties instead.`);

  }

}