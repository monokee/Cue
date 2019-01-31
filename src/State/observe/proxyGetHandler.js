
/**
 * Intercept "get" requests of properties in a reactive state object.
 * When prop is special symbol key, interceptor can return special data for recursive access etc.
 * Auto-wraps any sub-objects (Plain Objects and Arrays) into reactive proxies (unless they are the result of a computation).
 * Auto-creates -and caches intercepted array mutator functions when the get request is to an array mutator.
 * @function proxyGetHandler
 * @param   {object}            target  - The state instance from which a property is being requested.
 * @param   {(string|symbol)}   prop    - The property that is being requested.
 * @returns {*}                 value   - Either the plain state value or a special value when get request has been made to an internal symbol.
 */
function proxyGetHandler(target, prop) {

  // never intercept special properties
  if (prop === __CUE__ || prop === __INTERCEPTED_METHODS__) {
    return target[prop];
  }

  if (prop === __TARGET__) {
    return target;
  }

  const value = _get(target, prop);

  // if falsy or proxy, quick return
  if (!value || value[__CUE__]) {
    return value;
  }

  // proxify nested objects that are not the result of a computation
  if (typeof value === 'object' && !target[__CUE__].derivedProperties.has(prop)) {
    return createProxy(StateInternals.assignTo(value, target, prop));
  }


  if (ARRAY_MUTATORS.has(prop) && isFunction(value)) {
    const cache = target[__INTERCEPTED_METHODS__];
    return cache.get(prop) || (cache.set(prop, createInterceptedArrayMutator(value))).get(prop);
  }

  return value;

}