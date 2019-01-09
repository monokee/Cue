
function proxyGetHandler(target, prop) {

  // never intercept special properties
  if (prop === __CUE__ || prop === __INTERCEPTED_METHODS__) {
    return target[prop];
  }

  if (prop === __TARGET__) {
    return target;
  }

  if (derivativeToConnect !== null) {
    target[__CUE__].installDerivativeOf(prop, derivativeToConnect);
    return;
  }

  const value = _get(target, prop);

  if (!value || value[__CUE__]) {
    return value;
  }

  if (isArray(value) || value.constructor === Object) {
    return createProxy(CueStateInternals.assignTo(value, target, prop));
  }

  if (ARRAY_MUTATORS.has(prop) && typeof value === 'function') {

    const cache = target[__INTERCEPTED_METHODS__];
    return cache.get(prop) || (cache.set(prop, createInterceptedArrayMutator(value))).get(prop);

  }

  return value;

}