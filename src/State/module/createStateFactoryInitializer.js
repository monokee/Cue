
function createStateFactoryInitializer(name, initializer) {

  return props => {

    // the returned function will run once when the module is first used
    // it internally creates a StateFactory function for the model that is called on
    // any subsequent requests.

    const module = initializeStateModule(initializer);

    // Create a Factory Function that will be used to instantiate the module
    const StateFactory = createStateFactory(module);

    // Add module properties to StateFactory.prototype
    extendStateFactoryPrototype(StateFactory, module);

    // Overwrite this initialization function with the StateFactory for subsequent calls
    CUE_STATE_MODULES.set(name, StateFactory);

    // Call the StateFactory
    return StateFactory.call(null, props);

  }
  
}