
/**
 * Intercept "set" requests of properties in a reactive state object.
 * Only sets properties when not currently reacting to state changes. Disallows and console.warns when mutating state inside of reactions.
 * Automatically assigns "parent" and "ownPropertyName" to value if value is a reactive state instance that does not yet have these required properties.
 * Compares new value to cached value before attempting to queue reactions.
 * @function proxySetHandler
 * @param   {object}            target  - The state instance on which a new or existing property is being set.
 * @param   {string}            prop    - The property that is being set.
 * @param   {*}                 value   - The value that is being assigned to target.prop.
 * @returns {(boolean|undefined)}       - True if the set operation has been successful. Undefined if not set.
 */
function proxySetHandler(target, prop, value) {

  if (!isReacting) {

    const nestedInstance = value ? value[__CUE__] : undefined;

    if (nestedInstance && nestedInstance.parentInternals === null) {
      nestedInstance.instanceDidMount.call(nestedInstance, target, prop);
    }

    const instance = target[__CUE__];

    // Forward set request to root provider
    if (instance.providersOf.has(prop)) {
      // triggers forwarding setter on prototype until we arrive at the root provider (warns if setting a read-only)
      // at the root provider this check will fail (no more providers) and the actual property will be set.
      target[prop] = value;
      return true;
    }

    // Handle normal set requests

    const oldValue = instance.valueCache.get(prop);

    // compare to cache
    if (value !== oldValue) {

      // queue reactions
      instance.propertyDidChange.call(instance, prop, value);

      // mutate the target object (this will not mutate the "oldTarget" shallow copy we created above)
      target[prop] = value;

      // update the cache
      instance.valueCache.set(prop, value);

      // run through all reactions in the queue
      react();

      return true;

    }

  } else {

    console.warn(`Setting of "${prop}" ignored. Don't mutate state in a reaction. Refactor to computed properties or willChange/didChange handlers instead.`);

  }

}