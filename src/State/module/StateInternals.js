
/**
 * Attaches itself to a reactive state instance under private [__CUE__] symbol.
 * Properties and methods are required for reactivity engine embedded into every Cue State Instance
 */
class StateInternals {

  constructor(module, type) {

    this.type = type;

    this.valueCache = new Map();

    // Pointer to underlying module (shared by all instances of module)
    this.module = module;
    this.imports = module.imports;
    this.mounted = false;

    this.internalGetters = EMPTY_MAP;
    this.internalSetters = EMPTY_MAP;

  }

  instanceWillUnmount() {
    console.log('[todo: instanceWillUnmount]', this);
  }

  cueConsumers(providerInstance, consumers, prop, value) {

    // Find consumer instances and recurse into each branch

    let key, childState;
    for (key in this.plainState) {

      childState = this.plainState[key];

      if (childState && (childState = childState[__CUE__])) { // property is a child state instance

        let provider;
        for (provider of childState.providersOf.values()) {
          if (provider.sourceInternals === providerInstance && provider.sourceProperty === prop) {
            // this will branch off into its own search from a new root for a new property in case the provided property is passed down at multiple levels in the state tree...
            childState.propertyDidChange.call(childState, provider.targetProperty, value); // continue recursion in this branch
          }
        }

        // even if we did find a match above we have to recurse, potentially creating a parallel search route (if the provided prop is also provided from another upstream state)
        childState.cueConsumers.call(childState, providerInstance, consumers, prop, value);

      }

    }

  }

}

class InstanceInternals extends StateInternals {

  constructor(module, type) {
    super(module, type);
  }

  instanceDidMount(parent, ownPropertyName) {

    // ------------------INLINE "SUPER" CALL----------------------

    this.parentInternals = parent[__CUE__];
    let rootInternals = this.parentInternals;
    this.ownPropertyName = ownPropertyName;
    let rootPropertyName = this.ownPropertyName; //something

    // Find the root internals (root !== parent. root is the closest module-based ancestor)
    const pathFromRoot = [];
    while (rootInternals && rootInternals.type !== STATE_TYPE_INSTANCE) {
      rootInternals = rootInternals.rootInternals;
      rootPropertyName = rootInternals.rootPropertyName;
      pathFromRoot.unshift(rootPropertyName);
    }

    this.rootInternals = rootInternals;
    this.rootPropertyName = rootPropertyName;
    this.pathFromRoot = pathFromRoot;
    this.propertyPathPrefix = pathFromRoot.length > 0 ? `${pathFromRoot.join('.')}.` : ''; // note the trailing dot

    // -------------------------------------------------------------

    this.name = this.module.name;

    this.internalGetters = this.module.internalGetters;
    this.internalSetters = this.module.internalSetters;
    this.consumersOf = this.module.consumersOf;
    this.observersOf = new Map();       // 1D map [propertyName -> handler]
    this.derivativesOf = new Map();     // 2D map [propertyName -> 1D array[...Derivatives]]
    this.derivedProperties = new Map(); // 1D map [propertyName -> Derivative]
    this.providersOf = new Map();       // 1D map [ownPropertyName -> provider{sourceInstance: instance of this very class on an ancestor state, sourceProperty: name of prop on source}]

    if (this.module.providersToInstall.size) {
      this.injectProviders();
    }

    if (this.module.derivativesToInstall.size) {
      this.installDerivatives();
    }

    this.mounted = true;
    this.module.initialize.call(this.proxyState, this.initialProps);
    this.initialProps = undefined;

  }

  propertyDidChange(prop, value) {

    const observers = this.observersOf.get(prop);
    const derivatives = this.derivativesOf.get(prop);

    if (observers || derivatives) {
      if (isAccumulating) {
        cueImmediate(prop, value, prop, observers, derivatives, false);
      } else {
        cueAll(prop, value, prop, observers, derivatives, false);
      }
    }

    const consumers = this.consumersOf.get(prop);

    // 2. if the changed property has consumers, find them and recurse
    if (consumers) {
      this.cueConsumers(this, consumers, prop, value, prop);
    }

  }

  injectProviders() {

    let description, sourceModule, sourceProperty, targetModule, targetProperty, rootProvider;
    for (description of this.module.providersToInstall.values()) {

      // only install providers onto children when they are allowed to mutate the providing parent state
      if (description.readOnly === false) {

        sourceModule = description.sourceModule;        // the name of the module-based source state that the provided property comes from
        sourceProperty = description.sourceProperty;   // the top-level property name on a state instance created from sourceModule.
        targetModule = description.targetModule;      // the name of the module that is consuming the property (here its this.module.name!)
        targetProperty = description.targetProperty; // the top-level property name on this instance that is consuming from the parent

        // Traverse through the parent hierarchy until we find the first parent that has been created from a module that matches the name of the providerModule
        let rootInternals = this.rootInternals;

        while (rootInternals && rootInternals.type !== STATE_TYPE_INSTANCE && rootInternals.name !== sourceModule) {
          rootInternals = rootInternals.rootInternals;
        }

        if (rootInternals) { // found a parent instance that matches the consuming child module name

          // now we have to check if the found state instance is the actual source of the provided property or if it is also consuming it from another parent state.
          rootProvider = rootInternals.providersOf.get(sourceProperty);

          if (rootProvider) { // the provider is a middleman that receives the data from another parent.
            rootProvider = getRootProvider(rootProvider);
          } else {
            rootProvider = {sourceInternals: rootInternals, sourceProperty, targetModule, targetProperty};
          }

          // -> inject the rootProvider. We now have direct access to the data source on a parent, no matter how many levels of indirection the data has taken to arrive here.
          // all get and set requests to this piece of data will be directly forwarded to the source. Forwarded set mutations will recursively traverse back down through the state tree and notify each consumer along the way.
          this.providersOf.set(targetProperty, rootProvider);

        } else {

          // If we traversed until there are no more parents and we haven't found a state created from our providerModule, throw:
          throw new Error(`[${targetModule}]: Can't inject "${targetProperty}" from "${sourceModule}" because it's not an ancestor of the injecting module instance.`);

        }

      }

    }

  }

  installDerivatives() {

    let vDerivative, i, derivative, sourceProperty, dependencies, superDerivative;
    for (vDerivative of this.module.derivativesToInstall.values()) {

      // 3.0 Create Derivative instance
      derivative = new Derivative(vDerivative.ownPropertyName, vDerivative.computation, vDerivative.sourceProperties);

      // 3.1 Install instance as derivedProp
      this.derivedProperties.set(vDerivative.ownPropertyName, derivative);

      // 3.2 Add derivative as derivativeOf of its sourceProperties (dependencyGraph)
      for (i = 0; i < vDerivative.sourceProperties.length; i++) {
        sourceProperty = vDerivative.sourceProperties[i];
        dependencies = this.derivativesOf.get(sourceProperty);
        if (dependencies) {
          dependencies.push(derivative);
        } else {
          this.derivativesOf.set(sourceProperty, [ derivative ]);
        }
      }

      // 3.3 Enhance Derivative for self-aware traversal
      for (i = 0; i < vDerivative.superDerivatives.length; i++) {
        // because the module derivatives are topologically sorted, we know that the superDerivative is available
        superDerivative = this.derivedProperties.get(vDerivative.superDerivatives[i].ownPropertyName);
        derivative.superDerivatives.push(superDerivative);
        superDerivative.subDerivatives.push(derivative);
      }

      // 3.4 Fill internal cache of Derivative with proxy. (traps will get values from other resolved derivatives and provided props)
      derivative.fillCache(this.proxyState);

    }

  }

  addChangeReaction(property, handler, scope, autorun = true) {

    if (!isFunction(handler)) {
      throw new TypeError(`Property change reaction for "${property}" is not a function...`);
    }

    const boundHandler = handler.bind(scope);

    if (this.observersOf.has(property)) {
      this.observersOf.get(property).push(boundHandler);
    } else {
      this.observersOf.set(property, [ boundHandler ]);
    }

    if (this.derivedProperties.has(property)) {
      const derivative = this.derivedProperties.get(property);
      derivative.observers.push(boundHandler);
      setEndOfPropagationInBranchOf(derivative, TRAVERSE_DOWN);
    }

    if (autorun === true) {
      const val = this.proxyState[property];
      boundHandler(val, property);
    }

    return boundHandler;

  }

  removeChangeReaction(property, handler) {

    if (this.observersOf.has(property)) {

      const reactions = this.observersOf.get(property);
      const derivative = this.derivedProperties.get(property);

      if (handler === undefined) {

        this.observersOf.delete(property);

        if (derivative) {
          derivative.observers.splice(0, derivative.observers.length);
          setEndOfPropagationInBranchOf(derivative, TRAVERSE_UP);
        }

      } else if (isFunction(handler)) {

        let i = reactions.indexOf(handler);

        if (i > -1) {
          reactions.splice(i, 1);
        } else {
          console.warn(`Can't remove the passed handler from reactions of "${property}" because it is not registered.`);
        }

        if (derivative) {

          i = derivative.observers.indexOf(handler);

          if (i > -1) {
            derivative.observers.splice(i, 1);
            setEndOfPropagationInBranchOf(derivative, TRAVERSE_UP);
          } else {
            console.warn(`Can't remove the passed handler from observers of derived property "${property}" because it is not registered.`);
          }

        }

      }

    } else {
      console.warn(`Can't unobserve property "${property}" because no reaction has been registered for it.`);
    }

  }

}

class ExtensionInternals extends StateInternals {

  constructor(module, type) {
    super(module, type);
  }

  instanceDidMount(parent, ownPropertyName) {

    // ------------------INLINE "SUPER" CALL----------------------

    this.parentInternals = parent[__CUE__];
    let rootInternals = this.parentInternals;
    this.ownPropertyName = ownPropertyName;
    let rootPropertyName = this.ownPropertyName; //something

    // Find the root internals (root !== parent. root is the closest module-based ancestor)
    const pathFromRoot = [];
    while (rootInternals && rootInternals.type !== STATE_TYPE_INSTANCE) {
      rootInternals = rootInternals.rootInternals;
      rootPropertyName = rootInternals.rootPropertyName;
      pathFromRoot.unshift(rootPropertyName);
    }

    this.rootInternals = rootInternals;
    this.rootPropertyName = rootPropertyName;
    this.pathFromRoot = pathFromRoot;
    this.propertyPathPrefix = pathFromRoot.length > 0 ? `${pathFromRoot.join('.')}.` : ''; // note the trailing dot

    // -------------------------------------------------------------

    this.internalGetters = ARRAY_MUTATOR_GETTERS;
    this.mounted = true;

  }

  propertyDidChange(prop) {

    // propagate changes to the root instance.

    const root = this.rootInternals;
    const rootProp = this.rootPropertyName;
    const rootVal = root.plainState[rootProp];
    const path = this.propertyPathPrefix + prop;

    // 1. recurse over direct dependencies
    const observers = root.observersOf.get(rootProp);
    const derivatives = root.derivativesOf.get(rootProp);
    if (observers || derivatives) {
      if (isAccumulating) {
        cueImmediate(rootProp, rootVal, path, observers, derivatives, false);
      } else {
        cueAll(rootProp, rootVal, path, observers, derivatives, false);
      }
    }

    // 2. Notify consumers of the property
    const consumers = root.consumersOf.get(rootProp);
    if (consumers) {
      root.cueConsumers.call(root, root, consumers, rootProp, rootVal, path);
    }

  }

}