(function(window) {
const LocalStorage = window.localStorage;
const pendingCalls = new Map();
const ALL_KEYS = 'CUE_SERVER_CACHE::KEYS';
const EMPTY_CACHE_STORAGE_KEY = Symbol();

const Server = Object.defineProperty({

  fetch(url, expires = 0, token) {

    return new Promise((resolve, reject) => {

      const data = getCache(url);

      if (data === EMPTY_CACHE_STORAGE_KEY) {
        makeCall(url, 'GET', token).then(response => {
          setCache(url, response, expires);
          resolve(response);
        }).catch(error => {
          reject(error);
        });
      } else {
        resolve(data);
      }

    });

  },

  post(url, data, token) {
    return new Promise((resolve, reject) => {
      makeCall(url, 'POST', token, data)
        .then(response => resolve(response))
        .catch(error => reject(error));
    });
  },

}, 'clearCache', {
  value: clearCache
});

// --------------------------------------------------------

function setCache(url, value, expires) {

  const now = Date.now();
  const schedule = now + expires * 1000;

  if (typeof value === 'object') value = JSON.stringify(value);

  const url_stamped = `${url}::ts`;
  LocalStorage.setItem(url, value);
  LocalStorage.setItem(url_stamped, `${schedule}`);

  let allKeys = LocalStorage.getItem(ALL_KEYS);
  if (allKeys === null) {
    allKeys = `${url},${url_stamped},`;
  } else if (allKeys.indexOf(`${url},`) === -1) {
    allKeys = `${allKeys}${url},${url_stamped},`;
  }

  LocalStorage.setItem(ALL_KEYS, allKeys);

}

function getCache(url) {

  const timestamp = LocalStorage.getItem(`${url}::ts`);

  if (timestamp === null) {
    return EMPTY_CACHE_STORAGE_KEY;
  } else {
    if (Number(timestamp) < Date.now()) {
      clearCache(url);
      return EMPTY_CACHE_STORAGE_KEY;
    } else {
      return JSON.parse(LocalStorage.getItem(url));
    }
  }

}

function clearCache(url) {
  if (url) {
    if (LocalStorage.getItem(url) !== null) {
      const url_stamped = `${url}::ts`;
      LocalStorage.removeItem(url);
      LocalStorage.removeItem(url_stamped);
      const _allKeys = LocalStorage.getItem(ALL_KEYS);
      if (_allKeys !== null) {
        const allKeys = _allKeys.split(',');
        allKeys.splice(allKeys.indexOf(url), 1);
        allKeys.splice(allKeys.indexOf(url_stamped), 1);
        LocalStorage.setItem(ALL_KEYS, `${allKeys.join(',')},`);
      }
    }
  } else {
    const _allKeys = LocalStorage.getItem(ALL_KEYS);
    if (_allKeys !== null) {
      const allKeys = _allKeys.split(',');
      for (let i = 0; i < allKeys.length; i++) {
        LocalStorage.removeItem(allKeys[i]);
      }
      LocalStorage.removeItem(ALL_KEYS);
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

      fetch(url, {
        method: method,
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: headers,
        redirect: 'follow',
        referrer: 'no-referrer',
        body: method === 'GET' ? null : typeof data === 'string' ? data : JSON.stringify(data)
      }).then(res => {
        if (!res.ok) {
          res.json().then(error => reject(error));
        } else {
          res.json().then(data => resolve(data));
        }
      }).catch(error => {
        reject(error);
      }).finally(() => {
        pendingCalls.delete(url);
      });

    }));

    return pendingCalls.get(url);

  }

}

const NOOP = (() => {});

const RESOLVED_PROMISE = Promise.resolve();

function deepEqual(a, b) {

  if (a === b) {
    return true;
  }

  if (a && b && typeof a === 'object' && typeof b === 'object') {

    if (a.constructor !== b.constructor) return false;

    let i;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (i = length; i-- !== 0;) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    const keys = Object.keys(a);
    const length = keys.length;

    if (length !== Object.keys(b).length) return false;

    for (i = length; i-- !== 0;) {
      if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
    }

    for (i = length; i-- !== 0;) {
      const key = keys[i];
      if (!deepEqual(a[key], b[key])) return false;
    }

    return true;

  }

  return a!==a && b!== b;

}

function deepClone(x) {

  if (!x || typeof x !== 'object') {
    return x;
  }

  if (Array.isArray(x)) {
    const y = [];
    for (let i = 0; i < x.length; i++) {
      y.push(deepClone(x[i]));
    }
    return y;
  }

  const keys = Object.keys(x);
  const y = {};
  for (let i = 0, k; i < keys.length; i++) {
    k = keys[i];
    y[k] = deepClone(x[k]);
  }

  return y;

}

function areArraysShallowEqual(a, b) {

  if (a.length !== b.length) {
    return false;
  }

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

let PENDING_PROMISE = null;
let CURRENT_RESOLVE = null;
let FLUSHING_BUFFER = false;

const EVENTS = new Map();
const CALLBACKS = new Map();
const COMPUTED_PROPERTIES = new Map();
const DEPENDENCIES = new Map();
const RESOLVED = [];

const Reactor = {

  cueEvent(eventHandler, value) {
    EVENTS.set(eventHandler, value);
  },

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
    return PENDING_PROMISE || (PENDING_PROMISE = new Promise(reactionResolver));
  }

};

// ----------------------------------------

function reactionResolver(resolve) {
  if (FLUSHING_BUFFER === false) {
    CURRENT_RESOLVE = resolve;
    requestAnimationFrame(flushReactionBuffer);
  }
}

function flushReactionBuffer() {

  FLUSHING_BUFFER = true;

  let i, tuple, deps, computedProperty, context, callbacks, dependencyGraph, result;

  for (tuple of EVENTS.entries()) {
    tuple[0](tuple[1]);
  }

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
  EVENTS.clear();
  CALLBACKS.clear();

  while(RESOLVED.length > 0) {
    RESOLVED.pop();
  }

  FLUSHING_BUFFER = false;

  CURRENT_RESOLVE();

  CURRENT_RESOLVE = null;
  PENDING_PROMISE = null;

}

const STORE = new Map();
const EVENTS$1 = new Map();

const Store = Object.defineProperty({

  get(path) {

    if (!path) {

      const entireStore = {};

      for (const tuple of STORE.entries()) {
        entireStore[tuple[0]] = deepClone(tuple[1]);
      }

      return entireStore;

    }

    const keys = path.split('/');
    const root = STORE.get(keys[0]);

    if (root === void 0) {
      return void 0;
    }

    if (keys.length > 1) { // slash into object tree
      const [targetNode, targetKey] = getNode(root, keys);
      return deepClone(targetNode[targetKey]);
    }

    return deepClone(root);

  },

  set(path, value) {

    if (arguments.length === 1 && typeof path === 'object' && path !== null) {

      let didChange = false;

      for (const prop in path) {

        const keys = prop.split('/');
        const root = STORE.get(keys[0]);
        const newValue = path[prop];

        if (keys.length > 1) {
          const [targetNode, targetKey] = getNode(root, keys);
          if (!deepEqual(targetNode[targetKey], newValue)) {
            didChange = true;
            targetNode[targetKey] = newValue;
            bubbleEvent(prop, newValue, keys, root);
          }
        } else if (root === void 0 || !deepEqual(root, newValue)) {
          didChange = true;
          STORE.set(prop, newValue);
          dispatchEvent(prop, newValue);
        }

      }

      return didChange ? Reactor.react() : RESOLVED_PROMISE;

    }

    const keys = path.split('/');
    const root = STORE.get(keys[0]);

    if (keys.length > 1) { // sub-property

      const [targetNode, targetKey] = getNode(root, keys);

      if (deepEqual(targetNode[targetKey], value)) {
        return RESOLVED_PROMISE;
      }

      targetNode[targetKey] = value;
      return bubbleEvent(path, value, keys, root);

    }

    if (root === void 0 || !deepEqual(root, value)) { // first write or full replace
      STORE.set(path, value);
      return dispatchEvent(path, value);
    }

    return RESOLVED_PROMISE;

  },

  has(path) {

    const keys = path.split('/');
    const root = STORE.get(keys[0]);

    if (STORE.has(keys[0])) {

      if (keys.length > 1) {
        try {
          getNode(root, keys);
          return true;
        } catch(e) {
          return false;
        }
      }

      return true;

    }

    return false;

  },

  remove(path) {

    const keys = path.split('/');
    const root = STORE.get(keys[0]);

    if (root === void 0) {
      console.warn(`Can't remove Store entry "${path}" because it doesn't exist.`);
      return RESOLVED_PROMISE;
    }

    if (keys.length > 1) {

      const [targetNode, targetKey] = getNode(root, keys);

      if (Array.isArray(targetNode)) {
        targetNode.splice(parseInt(targetKey), 1);
      } else {
        delete targetNode[targetKey];
      }

      return bubbleEvent(path, void 0, keys, root);

    }

    STORE.delete(keys[0]);
    return dispatchEvent(path, void 0);

  },

  clear(options = {silently: false}) {

    if (STORE.size === 0) {
      return RESOLVED_PROMISE;
    }

    if (options.silently === true) {
      STORE.clear();
      return RESOLVED_PROMISE;
    }

    const keys = STORE.keys();

    STORE.clear();

    const promises = [];
    for (const key of keys) {
      promises.push(dispatchEvent(key, void 0));
    }

    return Promise.all(promises);

  },

  bind(path, defaultValue) {
    const storeBinding = {id: this.id, path};
    return arguments.length === 1
      ? storeBinding
      : Object.assign(storeBinding, {defaultValue});
  },

  subscribe(path, handler, options = {}) {

    if (typeof path !== 'string' || typeof handler !== 'function' || (options === null || typeof options !== 'object')) {
      throw new Error(`Invalid arguments. Expect (path:String, handler:Function, [options:Object]`);
    }

    const event = Object.assign({
      bubbles: false,
      autorun: true,
    }, options, {
      handler: options.scope ? handler.bind(options.scope) : handler
    });

    if (EVENTS$1.has(path)) {
      EVENTS$1.get(path).push(event);
    } else {
      EVENTS$1.set(path, [event]);
    }

    if (event.autorun === true) {

      const keys = path.split('/');
      const root = STORE.get(keys[0]);

      let warn = false;

      if (root === void 0) {
        warn = true;
      } else if (keys.length > 1) {
        const [targetNode, targetKey] = getNode(root, keys);
        if (targetNode[targetKey] === void 0) {
          warn = true;
        }
      }

      if (warn === true) {
        console.warn(`Can not auto-run Store subscription handler because value at "${path}" is undefined. Pass {autorun: false} option to avoid this warning.`);
      } else {
        if (event.bubbles === false) {
          dispatchEvent(path, STORE.get(path));
        } else {
          const keys = path.split('/');
          bubbleEvent(path, STORE.get(path), keys, STORE.get(keys[0]));
        }
      }
    }

    return {
      unsubscribe() {
        const events = EVENTS$1.get(path);
        events.splice(events.indexOf(event), 1);
        if (events.length === 0) {
          EVENTS$1.delete(path);
        }
      }
    }

  }

}, 'id', {
  value: Symbol('Store ID')
});

// -------------------------------------

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

function dispatchEvent(path, payload) {
  const event = EVENTS$1.get(path);
  if (event) {
    for (let i = 0; i < event.length; i++) {
      Reactor.cueEvent(event[i].handler, payload);
    }
    return Reactor.react();
  } else {
    return RESOLVED_PROMISE;
  }
}

function bubbleEvent(path, value, keys, root) {

  const Event = EVENTS$1.get(path);

  if (Event) {

    let doBubble = false;
    let i, k, ev, e;
    for (i = 0; i < Event.length; i++) {
      if (Event[i].bubbles === true) {
        doBubble = true;
        break;
      }
    }

    if (doBubble === true) {

      const events = [];

      let key = keys[0];
      let node = root;
      let event = EVENTS$1.get(key);

      if (event) {
        for (i = 0; i < event.length; i++) {
          events.push([event[i], root]);
        }
      }

      for (i = 1; i < keys.length; i++) {
        key += `/${keys[i]}`;
        node = node[keys[i]];
        event = EVENTS$1.get(key);
        if (event) {
          for (k = 0; k < event.length; k++) {
            events.push([event[k], node]);
          }
        }
      }

      for (i = events.length - 1; i >= 0; i--) {
        ev = events[i];
        e = ev[0];
        Reactor.cueEvent(ev[0].handler, ev[1]);
      }

    } else {

      for (i = 0; i < Event.length; i++) {
        Reactor.cueEvent(Event[i].handler, value);
      }

    }

    return Reactor.react();

  } else {

    return RESOLVED_PROMISE;

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

        if ((this.hasChanged = this._type !== DATA_TYPE_ARRAY || !areArraysShallowEqual(this._value, this.intermediate))) {
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

const REF_ID = '$';
const REF_ID_JS = '\\' + REF_ID;

const INTERNAL = Symbol('Component Data');

const TMP_STYLESHEET = document.createElement('style');

const Component = {

  define(name, config) {

    // ---------------------- LAZY MODULE CONFIG ----------------------
    let Module = null;

    // ---------------------- ATTRIBUTES (PRE-MODULE) ----------------------
    const observedAttributes = config.attributes ? Object.keys(config.attributes) : [];

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
              if (Module.storeBindings[key]) return Store.get(Module.storeBindings[key].path); // does deep clone
              if (_computedProperties.has(key)) return _computedProperties.get(key).value(internal.data); // deep by default
              return deepClone(target[key]); // deep clone
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
            () => Reactor.cueComputations(internal.dependencyGraph, internal.reactions, key, internal.data),
            {autorun: false}
          ));

          internal.reactions[key] && internal.subscriptions.push(Store.subscribe(
            Module.storeBindings[key].path,
            value => Reactor.cueCallback(internal.reactions[key], value),
            {autorun: false}
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
          let storeBinding;
          for (key in Module.storeBindings) {

            storeBinding = Module.storeBindings[key];
            path = storeBinding.path;

            if (Store.has(path)) {
              if (internal.reactions[key]) {
                Reactor.cueCallback(internal.reactions[key], Store.get(path));
              }
            } else {
              if (storeBinding.hasOwnProperty('defaultValue')) {
                Store.set(path, storeBinding.defaultValue);
              } else {
                throw new Error(`Component data of "${name}" has property "${key}" bound to Store["${path}"] but Store has no value and component specifies no default.`);
              }
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
          Reactor.react().then(() => {
            Module.initialize.call(this, internal.refs);
            Module.connected.call(this, internal.refs);
          });

        } else {

          Module.connected.call(this, internal.refs); // runs whenever instance is (re-) inserted into DOM

        }

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

      getData(key) {

        if (!key) {
          // when no key is passed, retrieve object of all settable properties (all except computed)
          const internal = this[INTERNAL];
          const dataClone = {};
          let key;

          for (key in Module.storeBindings) {
            dataClone[key] = Store.get(Module.storeBindings[key].path); // returns deep clone
          }

          for (key in internal._data) {
            dataClone[key] = deepClone(internal._data[key]); // make deep clone
          }

          return dataClone;

        }

        return this[INTERNAL].data[key]; // proxy returns deep clone

      }

      setData(key, value) {

        if (arguments.length === 1 && typeof key === 'object' && key !== null) {

          const internal = this[INTERNAL];
          let didChange = false;

          for (const prop in key) {

            const oldValue = internal._data[prop];
            const newValue = key[prop];

            if (Module.computedProperties.has(prop)) {
              throw new Error(`You can not set property "${prop}" because it is a computed property.`);
            } else if (Module.storeBindings[prop]) {
              didChange = true;
              Store.set(Module.storeBindings[prop].path, newValue);
            } else if (!deepEqual(oldValue, newValue)) {
              didChange = true;
              internal._data[prop] = newValue;
              internal.reactions[prop] && Reactor.cueCallback(internal.reactions[prop], newValue);
              internal.dependencyGraph.has(prop) && Reactor.cueComputations(internal.dependencyGraph, internal.reactions, prop, internal.data);
            }

          }

          return didChange ? Reactor.react() : RESOLVED_PROMISE;

        }

        if (Module.storeBindings[key]) {
          return Store.set(Module.storeBindings[key].path, value);
        }

        if (Module.computedProperties.has(key)) {
          throw new Error(`You can not set property "${key}" because it is a computed property.`);
        }

        const internal = this[INTERNAL];
        const oldValue = internal._data[key]; // skip proxy

        if (deepEqual(oldValue, value)) {
          return RESOLVED_PROMISE;
        }

        internal._data[key] = value; // skip proxy

        if (internal.reactions[key]) {
          Reactor.cueCallback(internal.reactions[key], value);
        }

        if (internal.dependencyGraph.has(key)) {
          Reactor.cueComputations(internal.dependencyGraph, internal.reactions, key, internal.data);
        }

        return Reactor.react();

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
    `<cue-template>${config.element ? config.element.trim() : ''}</cue-template>`
  ).firstChild;

  // ---------------------- REFS ----------------------
  const _refElements = Module.template.querySelectorAll(`[${REF_ID_JS}]`);
  Module.refNames = new Map();

  let i, k, v;
  for (i = 0; i < _refElements.length; i++) {
    k = _refElements[i].getAttribute(REF_ID);
    k && k.length && Module.refNames.set(`${REF_ID}${k}`, `[${REF_ID_JS}="${k}"]`);
  }

  // ---------------------- STYLES ----------------------
  Module.styles = '';
  if (typeof config.styles === 'string' && config.styles.length) {
    Module.styles = config.styles;
    createComponentCSS(name, Module.styles, Module.refNames, Module.encapsulated);
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

function createComponentCSS(name, styles, refNames, encapsulated) {

  // Re-write $self to component-name
  styles = styles.split(`${REF_ID}self`).join(name);

  // Re-write $refName(s) in style text to [\$="refName"] selector
  for (const tuple of refNames.entries()) {
    styles = styles.split(tuple[0]).join(tuple[1]);
  }

  document.head.appendChild(TMP_STYLESHEET);
  TMP_STYLESHEET.innerHTML = styles;
  const tmpSheet = TMP_STYLESHEET.sheet;

  let styleNodeInnerHTML = '';
  for (let i = 0, rule, tls; i < tmpSheet.rules.length; i++) {

    rule = tmpSheet.rules[i];

    if (encapsulated === true || rule.type === 7 || rule.type === 8) { // don't scope shadow-encapsulated modules and @keyframes
      styleNodeInnerHTML += rule.cssText;
    } else if (rule.type === 1) { // style rule
      if ((tls = getTopLevelSelector(rule.selectorText, name)) !== false) { // dont scope component-name
        styleNodeInnerHTML += rule.cssText;
      } else { // prefix with component-name to create soft scoping
        styleNodeInnerHTML += `${name} ${rule.cssText}`;
      }
    } else if (rule.type === 4 || rule.type === 12) { // @media/@supports query
      styleNodeInnerHTML += constructScopedStyleQuery(name, rule, encapsulated);
    } else {
      console.warn(`CSS Rule of type "${rule.type}" is not currently supported by Cue Components.`);
    }

  }

  // Clean up temp stylesheet
  TMP_STYLESHEET.innerHTML = '';
  document.head.removeChild(TMP_STYLESHEET);

  // Build a new stylesheet for the component
  const componentStylesheet = document.createElement('style');
  componentStylesheet.id = 'cue::' + name;

  if (styleNodeInnerHTML.indexOf(REF_ID_JS) !== -1) { // Escape character still exists (Chromium, Firefox)
    componentStylesheet.innerHTML = styleNodeInnerHTML;
  } else { // Escape character has been removed, add it back (Safari)
    componentStylesheet.innerHTML = styleNodeInnerHTML.split(REF_ID).join(REF_ID_JS);
  }

  document.head.appendChild(componentStylesheet);

}

function getTopLevelSelector(selectorText, componentName) {
  return selectorText === componentName ? '' :
    selectorText.lastIndexOf(`${componentName} `, 0) === 0 ? ' ' : // generic child selector
      selectorText.lastIndexOf(`${componentName}.`, 0) === 0 ? '.' : // class selector
        selectorText.lastIndexOf(`${componentName}:`, 0) === 0 ? ':' : // pseudo-class AND/OR pseudo-element
          selectorText.lastIndexOf(`${componentName}#`, 0) === 0 ? '#' : // id selector
            selectorText.lastIndexOf(`${componentName}[`, 0) === 0 ? '[' : // attribute selector
              selectorText.lastIndexOf(`${componentName}>`, 0) === 0 ? '>' : // immediate child selector
                selectorText.lastIndexOf(`${componentName}+`, 0) === 0 ? '+' : // immediate sibling selector
                  selectorText.lastIndexOf(`${componentName}~`, 0) === 0 ? '~' : // generic sibling selector
                    false;
}

function constructScopedStyleQuery(name, query, encapsulated, cssText = '') {

  if (query.type === 4) {
    cssText += `@media ${query.media.mediaText} {`;
  } else {
    cssText += `@supports ${query.conditionText} {`;
  }

  for (let i = 0, rule, tls; i < query.cssRules.length; i++) {

    rule = query.cssRules[i];

    if (encapsulated === true || rule.type === 7 || rule.type === 8) { // @keyframes or encapsulated in shadow
      cssText += rule.cssText;
    } else if (rule.type === 1) {
      if ((tls = getTopLevelSelector(rule.selectorText, name)) !== false) { // own-name
        cssText += rule.cssText;
      } else { // soft scope with own-name prefix
        cssText += `${name} ${rule.cssText}`;
      }
    } else if (rule.type === 4 || rule.type === 12) { // nested query
      cssText += constructScopedStyleQuery(name, rule, encapsulated, cssText);
    } else {
      console.warn(`CSS Rule of type "${rule.type}" is not currently supported by Components.`);
    }

  }

  return `${cssText} }`;

}

function assignElementReferences(parentElement, targetObject, refNames) {

  let tuple, el; //tuple[0] = refName, tuple[1] = selector
  for (tuple of refNames.entries()) {
    el = parentElement.querySelector(tuple[1]);
    if (!el[INTERNAL]) {
      el[INTERNAL] = {};
      el.renderEach = renderEach;
    }
    targetObject[`${tuple[0]}`] = el; // makes ref available as $refName in js
  }

  targetObject[`${REF_ID}self`] = parentElement; // makes container available as $self in js

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

  // important: reconcile does not currently work with dynamically adding or removing elements that have $refAttributes

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

const ORIGIN = window.location.origin + window.location.pathname;
const ABSOLUTE_ORIGIN_NAMES = [ORIGIN, window.location.hostname, window.location.hostname + '/', window.location.origin];

if (ORIGIN[ORIGIN.length -1] !== '/') {
  ABSOLUTE_ORIGIN_NAMES.push(ORIGIN + '/');
}

if (window.location.pathname && window.location.pathname !== '/') {
  ABSOLUTE_ORIGIN_NAMES.push(window.location.pathname);
}

const ALLOWED_ORIGIN_NAMES = ['/', '#', '/#', '/#/', ...ABSOLUTE_ORIGIN_NAMES];

const ROUTES = new Set();
const ON_ROUTE_HANDLER_CACHE = new Map();
const ROUTES_STRUCT = {};

const ROUTE_HOOK_HANDLERS = new Map();
const BEFORE_EACH_HANDLERS = [];
const AFTER_EACH_HANDLERS = [];

let recursions = 0;
let onRoutesResolved = null;
let resolveCancelled = false;
let resolvedBaseNode = null;
let routesDidResolve = false;

let pendingRoute = '';
let navigationInProgress = false;
let listenerRegistered = false;
let currentRoute = '';

const defaultResponse = {
  then: cb => cb(window.location.href)
};

const Router = {

  options: {
    recursionWarningCount: 5,
    recursionThrowCount: 10
  },

  state: {
    get currentRoute() {
      return currentRoute;
    },
    navigation: {
      get inProgress() {
        return navigationInProgress;
      },
      get pendingRoute() {
        return pendingRoute;
      }
    }
  },

  hook(route, handler, scope = null, once = false) {

    route = getAbsRelRoute(route).relativeRoute;

    if (!ROUTE_HOOK_HANDLERS.has(route)) {
      ROUTE_HOOK_HANDLERS.set(route, []);
    }

    addRouterEvent(ROUTE_HOOK_HANDLERS.get(route), handler, scope, once);

  },

  trigger(route, params = {}) {

    const parts = splitRouteAtQuery(route);
    const relativeRoute = getAbsRelRoute(parts.shift()).relativeRoute;

    const routeHooks = ROUTE_HOOK_HANDLERS.get(relativeRoute);

    if (routeHooks) {

      const allParams = Object.assign(buildParamsFromQueryString(parts[0] ? `?${parts[0]}` : ''), params);
      const fullQueryString = buildQueryStringFromParams(allParams);

      for (let i = 0; i < routeHooks.length; i++) {
        routeHooks[i](allParams, fullQueryString);
      }

    }

  },

  beforeEach(handler, scope = null, once = false) {
    addRouterEvent(BEFORE_EACH_HANDLERS, handler, scope, once);
  },

  afterEach(handler, scope = null, once = false) {
    addRouterEvent(AFTER_EACH_HANDLERS, handler, scope, once);
  },

  subscribe(baseRoute, options) {

    if (!options) {
      throw new Error('Router.subscribe requires second parameter to be "options" object or "onRoute" handler function.');
    } else if (typeof options === 'function') {
      const onRoute = options;
      options = { onRoute };
    } else if (typeof options.beforeRoute !== 'function' && typeof options.onRoute !== 'function') {
      throw new Error('Router.subscribe requires "options" object with "beforeRoute", "onRoute" or both handler functions.');
    }

    baseRoute = getAbsRelRoute(baseRoute).relativeRoute;

    // dont register a route twice (do quick lookup)
    if (ROUTES.has(baseRoute)) {
      throw new Error('Router already has an active subscription for "' + baseRoute + '".');
    } else {
      ROUTES.add(baseRoute);
    }

    // create root struct if it doesnt exist
    const root = (ROUTES_STRUCT[ORIGIN] = ROUTES_STRUCT[ORIGIN] || {
      beforeRoute: undefined,
      onRoute: undefined,
      children: {}
    });

    // register the baseRoute structurally so that its callbacks can be resolved in order of change
    if (baseRoute === ORIGIN) {
      root.beforeRoute = options.beforeRoute;
      root.onRoute = options.onRoute;
    } else {
      const routeParts = baseRoute.split('/');
      const leafPart = routeParts[routeParts.length -1];
      routeParts.reduce((branch, part) => {
        if (branch[part]) {
          if (part === leafPart) {
            branch[part].beforeRoute = options.beforeRoute;
            branch[part].onRoute = options.onRoute;
          }
          return branch[part].children;
        } else {
          return (branch[part] = {
            beforeRoute: part === leafPart ? options.beforeRoute : undefined,
            onRoute: part === leafPart ? options.onRoute : undefined,
            children: {}
          }).children;
        }
      }, root.children);
    }

    if (listenerRegistered === false) {

      listenerRegistered = true;

      const urlHandler = (forceReload) => {
        Router.navigate(window.location.href, false, forceReload).then(route => {
          window.history.replaceState(null, document.title, route);
        });
      };

      if (document.readyState === 'complete') {
        urlHandler(true);
      } else {
        document.addEventListener('readystatechange', () => {
          document.readyState === 'complete' && urlHandler(true);
        });
      }

      window.addEventListener('hashchange', () => {
        urlHandler(false);
      });

    }

  },

  navigate(route, revertible = true, forceReload = false) {

    const routeParts = splitRouteAtQuery; // split url into [route, query]
    const { relativeRoute, absoluteRoute } = getAbsRelRoute(routeParts.shift());
    const queryString = routeParts[0] ? `?${routeParts[0]}` : window.location.search; // the query

    const routeHooks = ROUTE_HOOK_HANDLERS.get(relativeRoute);

    if (routeHooks) {
      const params = buildParamsFromQueryString(queryString);
      for (let i = 0; i < routeHooks.length; i++) {
        routeHooks[i](params, queryString);
      }
    }

    if (relativeRoute === currentRoute && forceReload === false) {
      fireRouterEvents(BEFORE_EACH_HANDLERS, currentRoute, relativeRoute);
      fireRouterEvents(AFTER_EACH_HANDLERS, currentRoute, relativeRoute);
      return defaultResponse;
    }

    if (navigationInProgress) {
      console.warn('Router.navigate to "' + absoluteRoute + '" not executed because navigation to "' + pendingRoute + '" is still in progress.');
      return defaultResponse;
    } else {
      pendingRoute = absoluteRoute;
      navigationInProgress = true;
    }

    fireRouterEvents(BEFORE_EACH_HANDLERS, currentRoute, relativeRoute);

    return new Promise(resolve => {

      buildRouteStruct(absoluteRoute).then(resolvedStruct => {

        buildURLFromStruct(resolvedStruct).then(finalRoute => {

          if (forceReload === false && finalRoute === currentRoute) {

            navigationInProgress = false;
            fireRouterEvents(AFTER_EACH_HANDLERS, currentRoute, finalRoute);
            resolve(finalRoute + queryString);

          } else {

            gatherRouteCallbacks(resolvedStruct).then(callbacks => {

              for (let i = 0, tuple, handler, param; i < callbacks.length; i++) {

                tuple = callbacks[i]; handler = tuple[0]; param = tuple[1];

                if (forceReload === true || !ON_ROUTE_HANDLER_CACHE.has(handler) || ON_ROUTE_HANDLER_CACHE.get(handler) !== param) {
                  handler(param);
                  ON_ROUTE_HANDLER_CACHE.set(handler, param);
                }

              }

              currentRoute = finalRoute;

              if (revertible === true) {
                window.history.pushState(null, document.title, finalRoute + queryString);
              }

              navigationInProgress = false;
              fireRouterEvents(AFTER_EACH_HANDLERS, currentRoute, finalRoute);
              resolve(finalRoute + queryString);

            });
          }

        });

      });

    });

  }

};

// --------------------------------------------------------

function buildRouteStruct(absoluteRoute) {

  return new Promise(resolve => {

    recursions = 0;
    resolveCancelled = false;
    resolvedBaseNode = null;
    onRoutesResolved = resolve;
    routesDidResolve = false;

    if (!ROUTES_STRUCT[ORIGIN]) {
      onRoutesResolved(null);
    }

    resolveRouteHandlers(absoluteRoute);

  });

}

function resolveRouteHandlers(route) {

  if (route === ORIGIN) {

    if (resolvedBaseNode !== null) {
      onRoutesResolved(resolvedBaseNode);
    } else {
      collectRouteNodes(ROUTES_STRUCT, [ORIGIN]).then(baseNode => {
        resolvedBaseNode = baseNode;
        if (routesDidResolve === false) {
          routesDidResolve = true;
          onRoutesResolved(resolvedBaseNode);
        }
      });
    }

  } else if (route.lastIndexOf(ORIGIN, 0) === 0) { // starts with origin (split at hash)

    const hashPart = route.substr(ORIGIN.length);

    if (hashPart[0] !== '#') {
      throw new Error('Invalid route "' + hashPart + '". Nested routes must be hash based.');
    }

    if (resolvedBaseNode !== null) {

      collectRouteNodes(ROUTES_STRUCT.children, hashPart.split('/')).then(hashNode => {
        if (routesDidResolve === false) {
          routesDidResolve = true;
          onRoutesResolved(Object.assign(resolvedBaseNode, {
            nextNode: hashNode
          }));
        }
      });

    } else {

      collectRouteNodes(ROUTES_STRUCT, [ORIGIN, ...hashPart.split('/')]).then(baseNode => {
        resolvedBaseNode = baseNode;
        if (routesDidResolve === false) {
          routesDidResolve = true;
          onRoutesResolved(resolvedBaseNode);
        }
      });

    }

  } else if (route[0] === '#') { // is hash

    collectRouteNodes(ROUTES_STRUCT[ORIGIN].children, route.split('/')).then(hashNode => {
      if (routesDidResolve === false) {
        routesDidResolve = true;
        onRoutesResolved(Object.assign(resolvedBaseNode, {
          nextNode: hashNode
        }));
      }
    });

  }

}

function collectRouteNodes(root, parts, rest = '') {

  return new Promise(resolve => {

    const currentNodeValue = parts[0];
    const frag = root[currentNodeValue];

    if (!frag || resolveCancelled) {

      resolve({
        value: parts.length && rest.length ? rest + '/' + parts.join('/') : parts.length ? parts.join('/') : rest.length ? rest : '/',
        nextNode: null
      });

    } else {

      rest += rest.length === 0 ? currentNodeValue : '/' + currentNodeValue;

      const nextParts = parts.slice(1);

      if (frag.beforeRoute) {

        const iNextNodeValue = getNextNodeValue(frag.children, nextParts);

        Promise.resolve(frag.beforeRoute(iNextNodeValue)).then(oNextNodeValue => {

          oNextNodeValue = typeof oNextNodeValue === 'string'
            ? normalizeAbsoluteOriginPrefix(removeSlashes(oNextNodeValue))
            : iNextNodeValue;

          if (iNextNodeValue === oNextNodeValue) { // route same, continue

            resolve({
              value: rest,
              onRoute: frag.onRoute,
              nextNode: collectRouteNodes(frag.children, nextParts)
            });

          } else { // route modified

            if (currentNodeValue === ORIGIN) { // current node is origin

              if (iNextNodeValue !== '/' && iNextNodeValue[0] !== '#') {
                throw new Error('Invalid Route Setup: "' + iNextNodeValue + '" can not directly follow root url. Routes at this level must start with a #.');
              }

              if(oNextNodeValue[0] !== '#') {
                throw new Error('Invalid Route "' + oNextNodeValue + '" returned from beforeRoute. Routes at this level must start with a #.');
              }

              // Append to self or replace current hash root at origin with new hash root oNextNodeValue
              resolve({
                value: rest,
                onRoute: frag.onRoute,
                nextNode: collectRouteNodes(frag.children, oNextNodeValue.split('/'))
              });

            } else if (currentNodeValue[0] === '#') { // current node is hash root

              if (iNextNodeValue === '/') { // next node is self (hash root)

                // if oNextNodeValue[0] == '#': replace currentNodeValue with new hash oNextNodeValue...
                // else: append oNextValue to current hash root currentNodeValue
                resolve({
                  value: rest,
                  onRoute: frag.onRoute,
                  nextNode: collectRouteNodes(frag.children, oNextNodeValue.split('/'))
                });

              } else { // next node is hash firstChild

                if (oNextNodeValue === '/' || oNextNodeValue[0] === '#') {

                  // if (oNextNodeValue === '/'): go from firstChild back to hash root
                  // if (oNextNodeValue[0] === '#): replace hash root with new hash root
                  if (tryRecursion(parts)) {
                    resolve(collectRouteNodes(root, oNextNodeValue.split('/')));
                  }

                } else {

                  // replace firstChild iNextNodeValue with new firstChild oNextNodeValue
                  resolve({ // type 1
                    value: rest,
                    onRoute: frag.onRoute,
                    nextNode: collectRouteNodes(frag.children, oNextNodeValue.split('/'))
                  });

                }

              }

            } else { // current node is nth child

              // rewritten to origin, hash or something that starts with origin
              if (oNextNodeValue === ORIGIN || oNextNodeValue[0] === '#' || oNextNodeValue.lastIndexOf(ORIGIN, 0) === 0) {

                if (tryRecursion(parts)) {
                  resolveRouteHandlers(oNextNodeValue);
                }

              } else { // relative re-write

                resolve({
                  value: rest,
                  onRoute: frag.onRoute,
                  nextNode: collectRouteNodes(frag.children, oNextNodeValue.split('/'))
                });

              }

            }

          }

        });

      } else if (frag.onRoute) { // no beforeRoute rewrites but onRoute handler (chunk url)

        resolve({
          value: rest,
          onRoute: frag.onRoute,
          nextNode: collectRouteNodes(frag.children, nextParts)
        });

      } else { // no beforeRoute and no onRoute (continue with rest)

        resolve(collectRouteNodes(frag.children, nextParts, rest));

      }

    }

  });

}

function getNextNodeValue(root, parts, rest = '') {

  const part = parts[0];
  const frag = root[part];

  if (!frag) {
    return parts.length && rest.length ? rest + '/' + parts.join('/') : parts.length ? parts.join('/') : rest.length ? rest : '/';
  }

  rest += rest.length === 0 ? part : '/' + part;

  if (frag.beforeRoute || frag.onRoute) {
    return rest;
  }

  return getNextNodeValue(frag.children, parts.slice(1), rest);

}

function gatherRouteCallbacks(routeNode, callbacks = []) {

  return new Promise(resolve => {

    if (routeNode.nextNode === null) {
      resolve(callbacks);
    }

    Promise.resolve(routeNode.nextNode).then(nextNode => {
      if (nextNode !== null) {
        if (routeNode.onRoute) {
          callbacks.push([routeNode.onRoute, nextNode.value]);
        }
        resolve(gatherRouteCallbacks(nextNode, callbacks));
      }
    });

  });

}

function buildURLFromStruct(routeNode, url = '') {

  return new Promise(resolve => {
    if (routeNode === null || routeNode.value === '/') {
      resolve(url);
    } else {
      Promise.resolve(routeNode.nextNode).then(nextNode => {
        url += routeNode.value === ORIGIN || routeNode.value[0] === '#' ? routeNode.value : `/${routeNode.value}`;
        resolve(buildURLFromStruct(nextNode, url));
      });
    }

  });

}

function tryRecursion(parts) {

  recursions++;

  if (recursions === Router.options.recursionThrowCount) {

    resolveCancelled = true;
    throw new Error('Router.navigate is causing potentially infinite route rewrites at "' + parts.join('/') + '". Stopped execution after ' + Router.options.recursionThrowCount + ' cycles...');

  } else {

    if (recursions === Router.options.recursionWarningCount) {
      console.warn('Router.navigate is causing more than ' + Router.options.recursionWarningCount + ' route rewrites...');
    }

    return true;

  }

}

function getAbsRelRoute(route) {

  if (ALLOWED_ORIGIN_NAMES.indexOf(route) > -1) {
    return {
      relativeRoute: ORIGIN,
      absoluteRoute: ORIGIN
    };
  }

  if (route[0] === '#') {
    return {
      relativeRoute: route,
      absoluteRoute: ORIGIN + route
    };
  }

  route = removeAllowedOriginPrefix(route);

  if (route[0] !== '#') {
    throw new Error('Invalid Route: "' + route + '". Nested routes must be hash based.');
  }

  return {
    relativeRoute: route,
    absoluteRoute: ORIGIN + route
  };

}

function removeSlashes(route) {

  // remove leading slash on all routes except single '/'
  if (route.length > 1 && route[0] === '/') {
    route = route.substr(1);
  }

  // remove trailing slash on all routes except single '/'
  if (route.length > 1 && route[route.length - 1] === '/') {
    route = route.slice(0, -1);
  }

  return route;

}

function removeAllowedOriginPrefix(route) {
  const lop = getLongestOccurringPrefix(route, ALLOWED_ORIGIN_NAMES);
  return lop ? route.substr(lop.length) : route;
}

function normalizeAbsoluteOriginPrefix(route) {
  const lop = getLongestOccurringPrefix(route, ABSOLUTE_ORIGIN_NAMES);
  return lop ? route.replace(lop, ORIGIN) : route;
}

function getLongestOccurringPrefix(s, prefixes) {
  return prefixes
    .filter(x => s.lastIndexOf(x, 0) === 0)
    .sort((a, b) => b.length - a.length)[0];
}

function splitRouteAtQuery(route) {
  return route.split(/\?(.+)/).filter(s => s);
}

function addRouterEvent(stack, handler, scope, once) {

  let _handler;

  if (once === false) {
    _handler = handler.bind(scope);
  } else {
    _handler = (a, b) => {
      handler.call(scope, a, b);
      const i = stack.indexOf(_handler);
      stack.splice(i, 1);
    };
  }

  stack.push(_handler);

}

function fireRouterEvents(stack, a, b) {
  // a/b = from/to || params/query
  for (let i = 0; i < stack.length; i++) {
    stack[i](a, b);
  }
}

function buildParamsFromQueryString(queryString) {

  const params = {};

  if (queryString.length > 1) {
    const queries = queryString.substring(1).replace(/\+/g, ' ').replace(/;/g, '&').split('&');
    for (let i = 0, kv, key; i < queries.length; i++) {
      kv = queries[i].split('=', 2);
      key = decodeURIComponent(kv[0]);
      if (key) {
        params[key] = kv.length > 1 ? decodeURIComponent(kv[1]) : true;
      }
    }
  }

  return params;

}

function buildQueryStringFromParams(params) {

  let queryString = '', key, k, v;

  for (key in params) {
    k = encodeURIComponent(key);
    if (k) {
      v = encodeURIComponent(params[key]);
      queryString += queryString.length ? `&${k}=${v}` : `?${k}=${v}`;
    }
  }

  return queryString;

}

//removeIf(esModule)
const Cue = {Component, Store, Server, Router};
if (typeof module === 'object' && typeof module.exports === 'object') {
  module.exports = Cue;
} else if (typeof define === 'function' && define.amd) {
  define('Cue', [], function() {
    return Cue;
  });
} else {
  window.Cue = Cue;
}
//endRemoveIf(esModule)
}(window || this));
