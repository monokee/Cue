const LocalStorage = window.localStorage;
const pendingCalls = new Map();

const Server = {

  fetch(url, expires = 24 * 60 * 60, token) {

    return new Promise((resolve, reject) => {

      const data = getCache(url);

      if (data !== null) {
        resolve(JSON.parse(data));
      } else {
        makeCall(url, 'GET', token).then(response => {
          setCache(url, response, expires);
          resolve(JSON.parse(response));
        }).catch(error => {
          reject(error);
        });
      }

    });

  },

  post(url, data, token) {
    return new Promise((resolve, reject) => {
      makeCall(url, 'POST', token, data)
        .then(response => resolve(JSON.parse(response)))
        .catch(error => reject(error));
    });
  }

};

// --------------------------------------------------------

function setCache(url, value, expires) {
  const now = Date.now();
  const schedule = now + expires * 1000;
  if (typeof value === 'object') value = JSON.stringify(value);
  LocalStorage.setItem(url, value);
  LocalStorage.setItem(`${url}::ts`, schedule);
}

function getCache(url) {

  const timestamp = LocalStorage.getItem(`${url}::ts`);

  if (timestamp === null) {

    return null;

  } else {

    if (timestamp < Date.now()) {

      LocalStorage.removeItem(url);
      LocalStorage.removeItem(`${url}::ts`);

      return null;

    } else {

      return LocalStorage.getItem(url);

    }

  }

}

function makeCall(url, method, token, data = {}) {

  if (pendingCalls.has(url)) {

    return pendingCalls.get(url);

  } else {

    const headers = {
      'Content-Type': 'application/json'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    pendingCalls.set(url, new Promise((resolve, reject) => {

      const response = fetch(url, {
        method: method,
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: headers,
        redirect: 'follow',
        referrer: 'no-referrer',
        body: method === 'GET' ? null : JSON.stringify(data)
      }).then(response => {
        response.json().then(json => {
          pendingCalls.delete(url);
          resolve(json);
        });
      }).catch(error => {
        pendingCalls.delete(url);
        reject(error);
      });
    }));

    return pendingCalls.get(url);

  }

}

const NOOP = (() => {});

function deepEqual(a, b) {

  if (Array.isArray(a)) {
    return !Array.isArray(b) || a.length !== b.length ? false : areArraysDeepEqual(a, b);
  }

  if (typeof a === 'object') {
    return typeof b !== 'object' || (a === null || b === null) && a !== b ? false : arePlainObjectsDeepEqual(a, b);
  }

  return a === b;

}

function deepClone(x) {
  return Array.isArray(x) ? deepCloneArray(x) : deepClonePlainObject(x);
}

function areArraysShallowEqual(a, b) {
  // pre-compare array length outside of this function!
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;

}

function arePlainObjectsShallowEqual(a, b) {

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (let i = 0, k; i < keysA.length; i++) {
    k = keysA[i];
    if (keysB.indexOf(k) === -1 || a[k] !== b[k]) {
      return false;
    }
  }

  return true;

}

function ifFn(x) {
  return typeof x === 'function' ? x : NOOP;
}

// ------------------------------------

function arePlainObjectsDeepEqual(a, b) {

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (let i = 0, k; i < keysA.length; i++) {
    k = keysA[i];
    if (keysB.indexOf(k) === -1 || !deepEqual(a[k], b[keysB[i]])) {
      return false;
    }
  }

  return true;

}

function areArraysDeepEqual(a, b) {

  for (let i = 0; i < a.length; i++) {
    if (!deepEqual(a[i], b[i])) {
      return false;
    }
  }

  return true;

}

function deepClonePlainObject(o) {

  const clone = {};
  const keys = Object.keys(o);

  for (let i = 0, prop, val; i < keys.length; i++) {
    prop = keys[i];
    val = o[prop];
    clone[prop] = !val ? val : Array.isArray(val) ? deepCloneArray(val) : typeof val === 'object' ? deepClonePlainObject(val) : val;
  }

  return clone;

}

function deepCloneArray(a) {

  const clone = [];

  for (let i = 0, val; i < a.length; i++) {
    val = a[i];
    clone[i] = !val ? val : Array.isArray(val) ? deepCloneArray(val) : typeof val === 'object' ? deepClonePlainObject(val) : val;
  }

  return clone;

}

const EVENTS = new Map();

const LocalStorage$1 = window.localStorage;
const KEY_ID = 'VCS::';
const DO_PARSE = `${KEY_ID}PARSE::`;
const DO_PARSE_LENGTH = DO_PARSE.length;
const ALL_KEYS = `${KEY_ID}ALL_KEYS`;

const Store = {

  get(path) {

    if (!path) {

      const entireStore = {};

      const keys = LocalStorage$1.getItem(ALL_KEYS);

      if (keys !== null) {

        const allKeys = keys.split(',');

        for (let i = 0; i < allKeys.length; i++) {
          const str = LocalStorage$1.getItem(`${KEY_ID}${allKeys[i]}`);
          entireStore[allKeys[i]] = isParsable(str) ? JSON.parse(str.substring(DO_PARSE_LENGTH)) : str;
        }

      }

      return entireStore;

    }

    const keys = path.split('/');
    const str = LocalStorage$1.getItem(`${KEY_ID}${keys[0]}`);

    if (str === null) return null;

    if (!isParsable(str)) return str;

    const data = JSON.parse(str.substring(DO_PARSE_LENGTH));

    if (keys.length > 1) { // slash into object tree
      const [targetNode, targetKey] = getNode(data, keys);
      return targetNode[targetKey];
    }

    return data;

  },

  set(path, value) {

    if (arguments.length === 1) {

      // assume "path" to be store singleton object
      if (typeof path !== 'object' || path === null) {
        throw new Error('Invalid arguments provided to Store.set...');
      }

      this.clear(true);
      for (const key in path) this.set(key, path[key]);
      return true;

    }

    const keys = path.split('/');
    const keyLocal = `${KEY_ID}${keys[0]}`;
    const str = LocalStorage$1.getItem(keyLocal);

    if (keys.length > 1) { // setting a sub-level prop

      if (isParsable(str)) {

        const root = JSON.parse(str.substring(DO_PARSE_LENGTH));
        const [node, key] = getNode(root, keys);

        if (!deepEqual(node[key], value)) {
          node[key] = value;
          LocalStorage$1.setItem(keyLocal, `${DO_PARSE}${JSON.stringify(root, jsonReplacer)}`);
          bubbleEvent(path, value, keys, root);
          return true;
        } else {
          return false;
        }

      } else {
        throw new Error(`Cannot set property at path: "${path}" because the current value is stored as a string.`);
      }

    }

    // setting top-level prop

    if (str === null) { // first write

      if (typeof value === 'string') { // simple write
        LocalStorage$1.setItem(keyLocal, value);
      } else {
        LocalStorage$1.setItem(keyLocal, `${DO_PARSE}${JSON.stringify(value)}`);
      }

      // when setting new top-level property, collect its (unique) storage key
      let allKeys = LocalStorage$1.getItem(ALL_KEYS);
      if (allKeys === null) {
        allKeys = `${keyLocal},`;
      } else if (allKeys.indexOf(`${keyLocal},`) === -1) {
        allKeys = `${allKeys}${keyLocal},`;
      }

      LocalStorage$1.setItem(ALL_KEYS, allKeys);
      dispatchEvent(path, value);
      return true;

    }

    if (isParsable(str)) {

      const root = JSON.parse(str.substring(DO_PARSE_LENGTH));

      if (!deepEqual(root, value)) {
        LocalStorage$1.setItem(keyLocal, `${DO_PARSE}${JSON.stringify(value, jsonReplacer)}`);
        dispatchEvent(path, value);
        return true;
      } else {
        return false;
      }

    }

    if (str !== value) {
      LocalStorage$1.setItem(keyLocal, `${JSON.stringify(value, jsonReplacer)}`);
      dispatchEvent(path, value);
      return true;
    }

    return false;

  },

  has(path) {

    const keys = path.split('/');
    const str = LocalStorage$1.getItem(`${KEY_ID}${keys[0]}`);

    if (keys.length > 1) {

      if (isParsable(str) === false) {

        return false;

      } else {

        try {
          getNode(JSON.parse(str.substring(DO_PARSE_LENGTH)), keys);
          return true;
        } catch (e) {
          return false;
        }

      }

    } else {

      return str !== null;

    }

  },

  remove(path) {

    const keys = path.split('/');
    const keyLocal = `${KEY_ID}${keys[0]}`;
    const str = LocalStorage$1.getItem(keyLocal);

    if (str === null) return;

    if (keys.length > 1) {

      if (isParsable(str) === true) {

        const root = JSON.parse(str.substring(DO_PARSE_LENGTH));
        const [targetNode, targetKey] = getNode(root, keys);

        if (Array.isArray(targetNode)) {
          targetNode.splice(parseInt(targetKey), 1);
        } else {
          delete targetNode[targetKey];
        }

        LocalStorage$1.setItem(keyLocal, `${DO_PARSE}${JSON.stringify(root, jsonReplacer)}`);
        bubbleEvent(path, undefined, keys, root);

      } else {
        throw new Error(`Cannot delete property at path: "${path}" because the current value is stored as a string.`);
      }

    } else {

      LocalStorage$1.removeItem(keyLocal);

      const allKeys = LocalStorage$1.getItem(ALL_KEYS).split(',');
      allKeys.splice(allKeys.indexOf(keyLocal), 1);
      LocalStorage$1.setItem(ALL_KEYS, `${allKeys.join(',')},`);

      dispatchEvent(path, undefined);

    }

  },

  clear(silently = false) {

    const keys = LocalStorage$1.getItem(ALL_KEYS);

    if (keys !== null) {

      const allKeys = keys.split(',');

      for (let i = 0; i < allKeys.length; i++) {
        LocalStorage$1.removeItem(allKeys[i]);
        silently === false && dispatchEvent(allKeys[i], undefined);
      }

      LocalStorage$1.removeItem(ALL_KEYS);

    }

  },

  bind(path, defaultValue) {
    return {
      id: this.id, // included for integrity check by internal modules
      path: path,
      defaultValue: defaultValue
    }
  },

  subscribe(path, handler, options = {}) {

    if (typeof path !== 'string' || typeof handler !== 'function' || (options === null || typeof options !== 'object')) {
      throw new Error(`Invalid arguments. Expect (path:String, handler:Function, [options:Object]`);
    }

    const event = Object.assign({
      scope: null,
      bubbles: false
    }, options, {
      handler: handler
    });

    if (EVENTS.has(path)) {
      EVENTS.get(path).push(event);
    } else {
      EVENTS.set(path, [event]);
    }

    return {
      unsubscribe() {
        const events = EVENTS.get(path);
        events.splice(events.indexOf(event), 1);
        if (events.length === 0) {
          EVENTS.delete(path);
        }
      }
    }

  }

};

Object.defineProperty(Store, 'id', {
  value: Symbol('Store ID')
});

// ----------------------------------

function isParsable(str) {
  for (let i = 0; i < DO_PARSE_LENGTH; i++) {
    if (str[i] !== DO_PARSE[i]) return false;
  }
  return true;
}

function jsonReplacer(key, value) {
  return value === undefined ? null : value;
}

function getNode(root, keys) {

  if (root !== null && typeof root === 'object') {

    let node, key;

    for (let i = 1; i < keys.length; i++) {
      key = keys[i];
      node = i === 1 ? root : node[keys[i - 1]];
    }

    if (node.hasOwnProperty(key)) {
      return [node, key];
    } else {
      throw new Error(`Can not access store path: "${keys.join('/')}". Property ".../${key}" does not exist.`);
    }

  } else {
    throw new Error(`Can not access store path: "${keys.join('/')}". The value stored at: "${keys[0]}" is not object or array.`);
  }

}

function bubbleEvent(path, value, keys, root) {

  let event = EVENTS.get(path);

  if (event && event.length) {

    let doBubble = false;
    let i, k, ev, e;
    for (i = 0; i < event.length; i++) {
      if (event[i].bubbles === true) {
        doBubble = true;
        break;
      }
    }

    if (doBubble === true) {

      const events = [];

      let key = keys[0];
      let node = root;
      let event = EVENTS.get(key);

      if (event && event.length) {
        for (i = 0; i < event.length; i++) {
          events.push([event[i], root]);
        }
      }

      for (i = 1; i < keys.length; i++) {
        key += `/${keys[i]}`;
        node = node[keys[i]];
        event = EVENTS.get(key);
        if (event && event.length) {
          for (k = 0; k < event.length; k++) {
            events.push([event[k], node]);
          }
        }
      }

      for (i = events.length - 1; i >= 0; i--) {
        ev = events[i];
        e = ev[0];
        e.handler.call(e.scope, ev[1]);
      }

    } else {

      for (i = 0; i < event.length; i++) {
        e = event[i];
        e.handler.call(e.scope, value);
      }

    }

  }

}

function dispatchEvent(key, payload) {
  const event = EVENTS.get(key);
  if (event && event.length) {
    for (let i = 0, e; i < event.length; i++) {
      e = event[i];
      e.handler.call(e.scope, payload);
    }
  }
}

const DATA_TYPE_UNDEFINED = -1;
const DATA_TYPE_PRIMITIVE = 0;
const DATA_TYPE_ARRAY = 1;
const DATA_TYPE_OBJECT = 2;

const COMP_INSTALLER = {
  computedProperty: null,
  computedProperties: null
};

let resolver_source = null;
let resolver_visited = [];

class ComputedProperty {

  constructor(ownPropertyName, computation, sourceProperties = []) {

    this.ownPropertyName = ownPropertyName;
    this.computation = computation; // the function that computes a result from data points on the source
    
    // Dependency Graph
    this.sourceProperties = sourceProperties; // property names this computedProperty depends on

    // Value Cache
    this.intermediate = undefined; // intermediate computation result
    this._value = undefined; // current computation result
    this._type = DATA_TYPE_UNDEFINED; // optimization flag

    // Optimization flags
    this.needsUpdate = true; // flag indicating that one or many dependencies have been updated (required by this.value)
    this.hasChanged = false; // flag indicating that the computation has yielded a new result (required for dependency traversal)

  }

  value(source) {

    if (this.needsUpdate === true) {

      this.intermediate = this.computation.call(source, source);

      if (Array.isArray(this.intermediate)) {

        if ((this.hasChanged = this._type !== DATA_TYPE_ARRAY || this.intermediate.length !== this._value.length || !areArraysShallowEqual(this._value, this.intermediate))) {
          this._value = this.intermediate.slice();
          this._type = DATA_TYPE_ARRAY;
        }

      } else if (typeof this.intermediate === 'object' && this.intermediate !== null) {

        if ((this.hasChanged = this._type !== DATA_TYPE_OBJECT || !arePlainObjectsShallowEqual(this._value, this.intermediate))) {
          this._value = Object.assign({}, this.intermediate);
          this._type = DATA_TYPE_OBJECT;
        }

      } else if ((this.hasChanged = this._value !== this.intermediate)) {

        this._value = this.intermediate;
        this._type = DATA_TYPE_PRIMITIVE;

      }

      this.needsUpdate = false;

    }

    return this._value;

  }

}

function setupComputedProperties(allProperties, computedProperties) {
  return resolveDependencies(installDependencies(allProperties, computedProperties));
}

function buildDependencyGraph(computedProperties) {

  const dependencyGraph = new Map();

  let computedProperty, i, sourceProperty;

  for (computedProperty of computedProperties.values()) {

    for(i = 0; i < computedProperty.sourceProperties.length; i++) {
      sourceProperty = computedProperty.sourceProperties[i];

      if (dependencyGraph.has(sourceProperty)) {
        dependencyGraph.get(sourceProperty).push(computedProperty);
      } else {
        dependencyGraph.set(sourceProperty, [ computedProperty ]);
      }

    }

  }

  return dependencyGraph;

}

// -------------------------------------------

function installDependencies(allProperties, computedProperties) {

  // set the current installer payload
  Object.assign(COMP_INSTALLER, {
    computedProperties: computedProperties
  });

  // intercept get requests to props object to grab sourceProperties
  const installer = new Proxy(allProperties, {
    get: dependencyGetInterceptor
  });

  // call each computation which will trigger the intercepted get requests
  let computedProperty;
  for (computedProperty of computedProperties.values()) {

    COMP_INSTALLER.computedProperty = computedProperty;

    try {
      // the computation itself will most definitely fail but we only care about the property dependencies so we can safely ignore all errors.
      computedProperty.computation.call(installer, installer);
    } catch(e) {
      if (e.type && e.type === 'cue-internal') {
        throw new Error(e.message);
      }
    }

  }

  // kill pointers
  COMP_INSTALLER.computedProperty = null;
  COMP_INSTALLER.computedProperties = null;

  return computedProperties;

}

function resolveDependencies(computedProperties) {

  resolver_source = computedProperties;

  const target = new Map();

  let sourceProperty;
  for (sourceProperty of computedProperties.keys()) {
    visitDependency(sourceProperty, [], target);
  }

  resolver_source = null;
  resolver_visited = [];

  return target;

}

function dependencyGetInterceptor(target, sourceProperty) {

  const {computedProperty} = COMP_INSTALLER;

  if (!target.hasOwnProperty(sourceProperty)) {
    throw {
      type: 'cue-internal',
      message: `Cannot resolve computed property "${computedProperty.ownPropertyName}" because dependency "${sourceProperty}" doesn't exist.`
    };
  }

  // add the property as a sourceProperty to the computedProperty
  if (computedProperty.sourceProperties.indexOf(sourceProperty) === -1) {
    computedProperty.sourceProperties.push(sourceProperty);
  }

}

function visitDependency(sourceProperty, dependencies, target) {

  if (resolver_source.has(sourceProperty)) {

    dependencies.push(sourceProperty);
    resolver_visited.push(sourceProperty);

    const computedProperty = resolver_source.get(sourceProperty);

    for (let i = 0, name; i < computedProperty.sourceProperties.length; i++) {

      name = computedProperty.sourceProperties[i];

      if (dependencies.indexOf(name) !== -1) {
        throw new Error(`Circular dependency. "${computedProperty.ownPropertyName}" is required by "${name}": ${dependencies.join(' -> ')}`);
      }

      if (resolver_visited.indexOf(name) === -1) {
        visitDependency(name, dependencies, target);
      }

    }

    if (!target.has(sourceProperty)) {
      target.set(sourceProperty, computedProperty);
    }

  }

}

let REACTION_BUFFER = null;
let FLUSHING_BUFFER = false;

const CALLBACKS = new Map();
const COMPUTED_PROPERTIES = new Map();
const DEPENDENCIES = new Map();
const RESOLVED = [];

const Reactor = {

  cueCallback(handler, value) {
    CALLBACKS.set(handler, value);
  },

  cueComputations(dependencyGraph, callbacks, key, dataSource) {
    const computedProperties = dependencyGraph.get(key);
    const context = [dependencyGraph, callbacks, dataSource];
    for (let i = 0; i < computedProperties.length; i++) {
      COMPUTED_PROPERTIES.set(computedProperties[i], context);
    }
  },

  react() {
    if (REACTION_BUFFER === null && FLUSHING_BUFFER === false) {
      REACTION_BUFFER = requestAnimationFrame(flushReactionBuffer);
    }
  }

};

// ----------------------------------------

function flushReactionBuffer() {

  FLUSHING_BUFFER = true;

  let i, tuple, deps, computedProperty, context, callbacks, dependencyGraph, result;

  // RESOLVE COMPUTED_PROPERTIES ------------>
  while (COMPUTED_PROPERTIES.size > 0) {

    for (tuple of COMPUTED_PROPERTIES.entries()) {

      computedProperty = tuple[0];

      if (RESOLVED.indexOf(computedProperty) === -1) {

        context = tuple[1];

        dependencyGraph = context[0];
        callbacks = context[1];

        computedProperty.needsUpdate = true;
        result = computedProperty.value(context[2]); // context[2] === dataSource

        if (computedProperty.hasChanged === true) {

          if (callbacks[computedProperty.ownPropertyName]) {
            CALLBACKS.set(callbacks[computedProperty.ownPropertyName], result);
          }

          DEPENDENCIES.set(computedProperty, context);

        }

        RESOLVED.push(computedProperty);

      }

    }

    COMPUTED_PROPERTIES.clear();

    for (tuple of DEPENDENCIES.entries()) {

      computedProperty = tuple[0];
      context = tuple[1];
      deps = context[0].get(computedProperty.ownPropertyName); // context[0] === dependencyGraph

      if (deps) {
        for (i = 0; i < deps.length; i++) {
          COMPUTED_PROPERTIES.set(deps[i], context);
        }
      }

    }

    DEPENDENCIES.clear();

  }

  // CALLBACKS ----------->
  for (tuple of CALLBACKS.entries()) {
    tuple[0](tuple[1]);
  }

  // RESET BUFFERS -------->
  CALLBACKS.clear();

  while(RESOLVED.length > 0) {
    RESOLVED.pop();
  }

  REACTION_BUFFER = null;
  FLUSHING_BUFFER = false;

}

const REF_ID = 'ref';
const INTERNAL = Symbol('Component Data');
const CUE_STYLESHEET = (() => {
  const stylesheet = document.createElement('style');
  stylesheet.id = 'cue::components';
  document.head.appendChild(stylesheet);
  return stylesheet.sheet;
})();
const TMP_STYLESHEET = document.createElement('style');

const Component = {

  define(name, config) {

    // ---------------------- LAZY MODULE CONFIG ----------------------
    let Module = null;

    // ---------------------- ATTRIBUTES (PRE-MODULE) ----------------------
    const observedAttributes = config.attributes ? Object.keys(config.attributes) : [];
    //const attributeChangedCallbacks = observedAttributes.map(name => config.attributes[name]);

    // ---------------------- CUSTOM ELEMENT INSTANCE ----------------------
    const component = class extends HTMLElement {

      constructor() {

        super();

        let key, tuple;

        // Lazy Module Init
        if (Module === null) {

          Module = createModule(name, config);

          // Add Methods to this class' prototype
          component.prototype.renderEach = renderEach;
          for (key in Module.methods) {
            component.prototype[key] = Module.methods[key];
          }

        }

        // Establish Computed Properties
        const _computedProperties = new Map();

        // Create Internal Data Structure
        const _data = deepClone(Module.data);

        const internal = this[INTERNAL] = {
          _data: _data,
          data: new Proxy(_data, {
            get(target, key) {
              if (Module.storeBindings[key]) return Store.get(Module.storeBindings[key].path);
              if (_computedProperties.has(key)) return _computedProperties.get(key).value(internal.data);
              const value = target[key];
              if (Array.isArray(value)) return value.slice();
              if (typeof value === 'object' && value !== null) return Object.assign({}, value);
              return value;
            }
          }),
          computedProperties: _computedProperties,
          reactions: {},
          attributeChangedCallbacks: {},
          subscriptions: [],
          refs: {},
          initialized: false
        };

        // Clone Computed Properties
        for (tuple of Module.computedProperties.entries()) {
          _computedProperties.set(tuple[0], new ComputedProperty(tuple[1].ownPropertyName, tuple[1].computation, tuple[1].sourceProperties));
        }

        // Build Dependency Graph
        internal.dependencyGraph = buildDependencyGraph(internal.computedProperties);

        // Bind reactions with first argument as "refs" object ("this" is explicitly null to discourage impurity)
        for (key in Module.reactions) {
          internal.reactions[key] = Module.reactions[key].bind(null, internal.refs);
        }

        // Same for Attribute Reactions
        for (key in Module.attributeChangedCallbacks) {
          internal.attributeChangedCallbacks[key] = Module.attributeChangedCallbacks[key].bind(null, internal.refs);
        }

        // Construct Lifecycle
        Module.construct.call(this, this); // only ref that is available is self...

      }

      connectedCallback() {

        const internal = this[INTERNAL];

        // ALWAYS add Store Subscriptions (unbind in disconnectedCallback)
        for (const key in Module.storeBindings) {

          internal.dependencyGraph.has(key) && internal.subscriptions.push(Store.subscribe(
            Module.storeBindings[key].path,
            () => {
              Reactor.cueComputations(internal.dependencyGraph, internal.reactions, key, internal.data);
              Reactor.react();
            }
          ));

          internal.reactions[key] && internal.subscriptions.push(Store.subscribe(
            Module.storeBindings[key].path,
            value => {
              Reactor.cueCallback(internal.reactions[key], value);
              Reactor.react();
            }
          ));

        }

        // INITIALIZER - RUN ONLY ONCE
        if (internal.initialized === false) {

          let i, path, key;

          // ------------- Create DOM
          if (Module.encapsulated === true) {

            const shadow = internal.shadowDom = this.attachShadow({mode: 'open'});

            shadow.innerHTML = Module.styles; // styles will be string

            // move inline child nodes into shadowDOM
            for (i = 0; i < this.childNodes.length; i++) {
              shadow.appendChild(this.childNodes[i]);
            }

            // write template to the beginning
            for (i = Module.template.children.length - 1; i >= 0; i--) {
              shadow.insertBefore(Module.template.children[i].cloneNode(true), this.firstChild);
            }

          } else {

            // Style has already been added to global CSS...
            // Clone template into light dom (if element has content, the content is automatically rendered AFTER the internal template nodes)
            for (i = Module.template.children.length - 1; i >= 0; i--) {
              this.insertBefore(Module.template.children[i].cloneNode(true), this.firstChild);
            }

          }

          // ---------------- Create Refs
          assignElementReferences(Module.encapsulated ? internal.shadowDom : this, internal.refs, Module.refNames);

          // ---------------- Consider Element Initialized
          internal.initialized = true;

          // ----------------- Bind / Cue Store
          for (key in Module.storeBindings) {
            path = Module.storeBindings[key].path;
            if (Store.has(path) && internal.reactions[key]) { // store has value, run local handler with store value (local handler === store subscription handler)
              Reactor.cueCallback(internal.reactions[key], Store.get(path));
            } else if (Module.storeBindings[key].hasOwnProperty('defaultValue')) { // if default value has been provided and store has no value yet, component writes to store
              Store.set(path, Module.storeBindings[key].defaultValue); // will trigger Reactor
            } else {
              throw new Error(`Component data of "${name}" has property "${key}" bound to Store["${path}"] but Store has no value and component specifies no default.`);
            }
          }

          // ---------------- Run reactions
          for (key in internal.reactions) {
            Reactor.cueCallback(internal.reactions[key], internal.data[key]);
          }

          // ----------------- Run Attribute Changed Callbacks
          for (key in internal.attributeChangedCallbacks) {
            Reactor.cueCallback(internal.attributeChangedCallbacks[key], this.getAttribute(key));
          }

          // ---------------- Assign default attributes in case the element doesn't have them
          for (key in Module.defaultAttributeValues) {
            if (!this.hasAttribute(key)) {
              this.setAttribute(key, Module.defaultAttributeValues[key]);
            }
          }

          // ---------------- Trigger First Render
          Reactor.react();

          Module.initialize.call(this, internal.refs);

        }

        Module.connected.call(this, internal.refs); // runs whenever instance is (re-) inserted into DOM

      }

      disconnectedCallback() {

        const subscriptions = this[INTERNAL].subscriptions;
        while (subscriptions.length) {
          subscriptions.pop().unsubscribe();
        }

        Module.disconnected.call(this, this[INTERNAL].refs);

      }

      adoptedCallback() {
        Module.adopted.call(this, this[INTERNAL].refs);
      }

      get(key) {
        return this[INTERNAL].data[key];
      }

      set(key, value) {

        if (Module.storeBindings[key]) {

          Store.set(Module.storeBindings[key].path, value);

        } else if (Module.computedProperties.has(key)) {

          throw new Error(`You can not set property "${key}" because it is a computed property.`);

        } else {

          const internal = this[INTERNAL];
          const oldValue = internal._data[key]; // skip proxy

          if (!deepEqual(oldValue, value)) {

            internal._data[key] = value; // skip proxy

            if (internal.reactions[key]) {
              Reactor.cueCallback(internal.reactions[key], value);
            }

            if (internal.dependencyGraph.has(key)) {
              Reactor.cueComputations(internal.dependencyGraph, internal.reactions, key, internal.data);
            }

            Reactor.react();

          }

        }

      }

      static get observedAttributes() {
        return observedAttributes;
      }

      attributeChangedCallback(name, oldValue_omitted, newValue) {

        const internal = this[INTERNAL];

        if (internal.initialized === true) { // only on initialized elements

          const reaction = internal.attributeChangedCallbacks[name];

          if (reaction) {
            Reactor.cueCallback(reaction, newValue);
            Reactor.react();
          }

        }

      }

    };

    // ---------------------- DEFINE CUSTOM ELEMENT ----------------------
    customElements.define(name, component);

    // ----------------------- RETURN HTML STRING FACTORY FOR EMBEDDING THE ELEMENT WITH ATTRIBUTES -----------------------
    return (attributes = {}) => {
      let htmlString = '<' + name;
      for (const att in attributes) htmlString += ` ${att}="${attributes[att]}"`;
      return htmlString += `></${name}>`;
    };

  },

  create(node, data) {

    node = node.trim();

    const element = node[0] === '<' ? document.createRange().createContextualFragment(node).firstChild : document.createElement(node);

    if (typeof data === 'object' && data !== null) {
      if (element[INTERNAL]) {
        for (const prop in data) {
          if (element[INTERNAL]._data.hasOwnProperty(prop)) {
            element[INTERNAL]._data[prop] = data[prop]; // element will self-react with this data in connectedCallback...
          } else {
            console.warn(`Cannot pass data property "${prop}" to component "${element.tagName}" because the property has not been explicitly defined in the components data model.`);
          }
        }
      } else {
        console.warn(`Cannot set data on element "${element.tagName}" because it has not been defined via Component.define!`);
      }
    }

    return element;

  }

};

// -----------------------------------

function createModule(name, config) {

  const Module = {};

  // ---------------------- TEMPLATE ----------------------
  Module.encapsulated = config.encapsulated === true;

  Module.template = document.createRange().createContextualFragment(
    `<cue-template>${config.element.trim()}</cue-template>`
  ).firstChild;

  // ---------------------- REFS ----------------------
  const _refElements = Module.template.querySelectorAll(`[${REF_ID}]`);
  Module.refNames = new Map();

  let i, k, v, tuple;
  for (i = 0; i < _refElements.length; i++) {
    k = _refElements[i].getAttribute(REF_ID);
    k && k.length && Module.refNames.set(k, `[${REF_ID}="${k}"]`);
  }

  // ---------------------- STYLES ----------------------
  Module.styles = '';
  if (typeof config.styles === 'string' && config.styles.length) {

    Module.styles = config.styles;

    // rewrite refs from "name" to [ref="name"] to allow for shorthand styling
    for (tuple of Module.refNames.entries()) {
      Module.styles = Module.styles.split(tuple[0]).join(tuple[1]); //TODO: this messes things up when two refs contain the same sequence of letters!
    }

    // not encapsulated in shadowDOM, scope all styles to name-tag
    if (Module.encapsulated === false) {
      scopeStylesToComponent(name, Module.styles);
    }

  }

  // ---------------------- REACTIONS ----------------------
  const reactions = {}; // reactionName -> Function
  if (config.reactions) {
    const assignedReactions = new Set();
    for (k in config.reactions) {
      v = config.reactions[k];
      if (typeof v !== 'function') throw new Error(`Reaction "${k}" is not a function...`);
      if (assignedReactions.has(v)) throw new Error(`Reaction "${k}" already in use. You can't use the same reaction for multiple data properties.`);
      reactions[k] = v;
      assignedReactions.add(v);
    }
  }

  // ---------------------- METHODS ----------------------
  Module.methods = {};
  for (k in config) {
    k !== 'initialize'
    && k !== 'connectedCallback'
    && k !== 'adoptedCallback'
    && k !== 'disconnectedCallback'
    && typeof config[k] === 'function'
    && (Module.methods[k] = config[k]);
  }

  // ---------------------- LIFECYCLE ----------------------
  Module.construct = ifFn(config.construct);
  Module.initialize = ifFn(config.initialize);
  Module.connected = ifFn(config.connectedCallback);
  Module.disconnected = ifFn(config.disconnectedCallback);
  Module.adopted = ifFn(config.adoptedCallback);

  // ---------------------- DATA ----------------------
  Module.data = {};
  Module.storeBindings = {};
  Module.reactions = {};

  const _allProperties = {};
  const _computedProperties = new Map();

  if (config.data) {

    for (k in config.data) {

      v = config.data[k];

      _allProperties[k] = v.value;

      if (typeof v.value === 'object' && v.value !== null && v.value.id === Store.id) {
        Module.storeBindings[k] = v.value;
      } else if (typeof v.value === 'function') {
        _computedProperties.set(k, new ComputedProperty(k, v.value));
      } else {
        Module.data[k] = v.value;
      }

      if (v.reaction) {
        if (typeof v.reaction === 'string') {
          if (!reactions[v.reaction]) throw new Error(`No Reaction with name "${v.reaction}" exists.`);
          Module.reactions[k] = reactions[v.reaction];
        } else if (typeof v.reaction === 'function') {
          if (reactions[k] || Module.reactions[k]) throw new Error(`A reaction for data property "${k}" has already been registered.`);
          Module.reactions[k] = v.reaction;
        }
      }

    }

  }

  // --------------------- ATTRIBUTES ---------------------
  Module.defaultAttributeValues = {};
  Module.attributeChangedCallbacks = {};

  if (config.attributes) {

    for (k in config.attributes) {

      v = config.attributes[k];

      if (typeof v.value !== 'undefined') {
        if (typeof v.value !== 'string') {
          throw new Error(`Attribute value for ${k} is not a String.`);
        } else {
          Module.defaultAttributeValues[k] = v.value;
        }
      }

      if (typeof v.reaction === 'string') {
        if (!reactions[v.reaction]) throw new Error(`No Reaction with name "${v.reaction}" exists.`);
        Module.attributeChangedCallbacks[k] = reactions[v.reaction];
      } else if (typeof v.reaction === 'function') {
        Module.attributeChangedCallbacks[k] = v.reaction;
      }

    }

  }

  // ---------------------- COMPUTED PROPERTIES ----------------------
  Module.computedProperties = setupComputedProperties(_allProperties, _computedProperties);

  return Module;

}

function scopeStylesToComponent(name, styles) {

  TMP_STYLESHEET.innerHTML = styles;
  document.head.appendChild(TMP_STYLESHEET);
  const tmpSheet = TMP_STYLESHEET.sheet;

  for (let i = 0, rule, text; i < tmpSheet.rules.length; i++) {

    rule = tmpSheet.rules[i];

    if (rule.type === 1) { // style
      text = rule.selectorText;
      if (text.lastIndexOf(name, 0) === 0) { // do not scope self...
        CUE_STYLESHEET.insertRule(rule.cssText);
      } else if (text.lastIndexOf('self', 0) === 0) { // replace "self" with name
        CUE_STYLESHEET.insertRule(rule.cssText.split('self').join(name));
      } else { // prefix with element tag to create scoping
        CUE_STYLESHEET.insertRule(`${name} ${rule.cssText}`);
      }
    } else if (rule.type === 7 || rule.type === 8) { // @keyframe(s)
      CUE_STYLESHEET.insertRule(rule.cssText);
    } else if (rule.type === 4 || rule.type === 12) { // @media OR @supports
      CUE_STYLESHEET.insertRule(constructScopedCSSText(name, rule));
    } else {
      console.warn(`CSS Rule of type "${rule.type}" is not currently supported by Components.`);
    }

  }

  TMP_STYLESHEET.innerHTML = '';
  document.head.removeChild(TMP_STYLESHEET);

}

function constructScopedCSSText(name, rule, cssText = '') {

  cssText += `${rule.type === 4 ? '@media' : '@supports'} ${rule.conditionText} {`;

  for (let i = 0, r; i < rule.cssRules.length; i++) {

    r = rule.cssRules[i];

    if (r.type === 1) {
      if (r.selectorText.lastIndexOf(name, 0) === 0) {
        cssText += r.cssText;
      } else if (r.selectorText.lastIndexOf('self', 0) === 0) {
        cssText += r.cssText.split('self').join(name);
      } else {
        cssText += `${name} ${r.cssText}`;
      }
    } else if (r.type === 7 || r.type === 8) {
      cssText += r.cssText;
    } else if (r.type === 4 || r.type === 12) {
      cssText += constructScopedCSSText(name, r, cssText);
    } else {
      console.warn(`CSS Rule of type "${r.type}" is not currently supported by Components.`);
    }

  }

  return `${cssText} }`;

}

function assignElementReferences(parentElement, refs, names) {

  let tuple, el; //tuple[0] === refName, tuple[1] === selector
  for (tuple of names.entries()) {
    el = parentElement.querySelector(tuple[1]);
    if (!el[INTERNAL]) {
      el[INTERNAL] = {};
      el.renderEach = renderEach;
    }
    refs[tuple[0]] = el;
  }

  refs['self'] = parentElement;

}

function renderEach(dataArray, createElement, updateElement = NOOP) {

  // guard against undefined
  dataArray || (dataArray = []);

  // this function is attached directly to dom elements. "this" refers to the element
  const previousData = this[INTERNAL].childData || [];
  this[INTERNAL].childData = dataArray;

  // differentiate between encapsulated elements (have shadowDOM) and open elements
  if (dataArray.length === 0) {
    (this[INTERNAL].shadowDom || this).textContent = '';
  } else if (previousData.length === 0) {
    const el = this[INTERNAL].shadowDom || this;
    for (let i = 0; i < dataArray.length; i++) {
      el.appendChild(createElement(dataArray[i]));
    }
  } else {
    reconcile((this[INTERNAL].shadowDom || this), previousData, dataArray, createElement, updateElement);
  }

}

function reconcile(parentElement, currentArray, newArray, createFn, updateFn) {

  // optimized array reconciliation algorithm based on the following implementations
  // https://github.com/localvoid/ivi
  // https://github.com/adamhaile/surplus
  // https://github.com/Freak613/stage0

  let prevStart = 0, newStart = 0;
  let loop = true;
  let prevEnd = currentArray.length - 1, newEnd = newArray.length - 1;
  let a, b;
  let prevStartNode = parentElement.firstChild, newStartNode = prevStartNode;
  let prevEndNode = parentElement.lastChild, newEndNode = prevEndNode;
  let afterNode;

  // scan over common prefixes, suffixes, and simple reversals
  outer : while (loop) {

    loop = false;

    let _node;

    // Skip prefix
    a = currentArray[prevStart];
    b = newArray[newStart];

    while (a === b) {

      updateFn(prevStartNode, b);

      prevStart++;
      newStart++;

      newStartNode = prevStartNode = prevStartNode.nextSibling;

      if (prevEnd < prevStart || newEnd < newStart) {
        break outer;
      }

      a = currentArray[prevStart];
      b = newArray[newStart];

    }

    // Skip suffix
    a = currentArray[prevEnd];
    b = newArray[newEnd];

    while (a === b) {

      updateFn(prevEndNode, b);

      prevEnd--;
      newEnd--;

      afterNode = prevEndNode;
      newEndNode = prevEndNode = prevEndNode.previousSibling;

      if (prevEnd < prevStart || newEnd < newStart) {
        break outer;
      }

      a = currentArray[prevEnd];
      b = newArray[newEnd];

    }

    // Swap backward
    a = currentArray[prevEnd];
    b = newArray[newStart];

    while (a === b) {

      loop = true;
      updateFn(prevEndNode, b);

      _node = prevEndNode.previousSibling;
      parentElement.insertBefore(prevEndNode, newStartNode);
      newEndNode = prevEndNode = _node;

      newStart++;
      prevEnd--;

      if (prevEnd < prevStart || newEnd < newStart) {
        break outer;
      }

      a = currentArray[prevEnd];
      b = newArray[newStart];

    }

    // Swap forward
    a = currentArray[prevStart];
    b = newArray[newEnd];

    while (a === b) {

      loop = true;

      updateFn(prevStartNode, b);

      _node = prevStartNode.nextSibling;
      parentElement.insertBefore(prevStartNode, afterNode);
      afterNode = newEndNode = prevStartNode;
      prevStartNode = _node;

      prevStart++;
      newEnd--;

      if (prevEnd < prevStart || newEnd < newStart) {
        break outer;
      }

      a = currentArray[prevStart];
      b = newArray[newEnd];

    }

  }

  // Remove Node(s)
  if (newEnd < newStart) {
    if (prevStart <= prevEnd) {
      let next;
      while (prevStart <= prevEnd) {
        if (prevEnd === 0) {
          parentElement.removeChild(prevEndNode);
        } else {
          next = prevEndNode.previousSibling;
          parentElement.removeChild(prevEndNode);
          prevEndNode = next;
        }
        prevEnd--;
      }
    }
    return;
  }

  // Add Node(s)
  if (prevEnd < prevStart) {
    if (newStart <= newEnd) {
      while (newStart <= newEnd) {
        afterNode
          ? parentElement.insertBefore(createFn(newArray[newStart]), afterNode)
          : parentElement.appendChild(createFn(newArray[newStart]));
        newStart++;
      }
    }
    return;
  }

  // Simple cases don't apply. Prepare full reconciliation:

  // Collect position index of nodes in current DOM
  const positions = new Array(newEnd + 1 - newStart);
  // Map indices of current DOM nodes to indices of new DOM nodes
  const indices = new Map();

  let i;

  for (i = newStart; i <= newEnd; i++) {
    positions[i] = -1;
    indices.set(newArray[i], i);
  }

  let reusable = 0, toRemove = [];

  for (i = prevStart; i <= prevEnd; i++) {

    if (indices.has(currentArray[i])) {
      positions[indices.get(currentArray[i])] = i;
      reusable++;
    } else {
      toRemove.push(i);
    }

  }

  // Full Replace
  if (reusable === 0) {

    parentElement.textContent = '';

    for (i = newStart; i <= newEnd; i++) {
      parentElement.appendChild(createFn(newArray[i]));
    }

    return;

  }

  // Full Patch around longest increasing sub-sequence
  const snake = longestIncreasingSubsequence(positions, newStart);

  // gather nodes
  const nodes = [];
  let tmpC = prevStartNode;

  for (i = prevStart; i <= prevEnd; i++) {
    nodes[i] = tmpC;
    tmpC = tmpC.nextSibling;
  }

  for (i = 0; i < toRemove.length; i++) {
    parentElement.removeChild(nodes[toRemove[i]]);
  }

  let snakeIndex = snake.length - 1, tempNode;
  for (i = newEnd; i >= newStart; i--) {

    if (snake[snakeIndex] === i) {

      afterNode = nodes[positions[snake[snakeIndex]]];
      updateFn(afterNode, newArray[i]);
      snakeIndex--;

    } else {

      if (positions[i] === -1) {
        tempNode = createFn(newArray[i]);
      } else {
        tempNode = nodes[positions[i]];
        updateFn(tempNode, newArray[i]);
      }

      parentElement.insertBefore(tempNode, afterNode);
      afterNode = tempNode;

    }

  }

}

function longestIncreasingSubsequence(ns, newStart) {

  // inline-optimized implementation of longest-positive-increasing-subsequence algorithm
  // https://en.wikipedia.org/wiki/Longest_increasing_subsequence

  const seq = [];
  const is = [];
  const pre = new Array(ns.length);

  let l = -1, i, n, j;

  for (i = newStart; i < ns.length; i++) {

    n = ns[i];

    if (n < 0) continue;

    let lo = -1, hi = seq.length, mid;

    if (hi > 0 && seq[hi - 1] <= n) {

      j = hi - 1;

    } else {

      while (hi - lo > 1) {

        mid = Math.floor((lo + hi) / 2);

        if (seq[mid] > n) {
          hi = mid;
        } else {
          lo = mid;
        }

      }

      j = lo;

    }

    if (j !== -1) {
      pre[i] = is[j];
    }

    if (j === l) {
      l++;
      seq[l] = n;
      is[l] = i;
    } else if (n < seq[j + 1]) {
      seq[j + 1] = n;
      is[j + 1] = i;
    }

  }

  for (i = is[l]; l >= 0; i = pre[i], l--) {
    seq[l] = i;
  }

  return seq;

}

window.Cue = {Server, Store, Component};

export { Component, Server, Store };
