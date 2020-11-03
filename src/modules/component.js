import { STORE_BINDING_ID } from './store.js';
import { NOOP, deepEqual, deepClone } from './utils.js';
import { ComputedProperty, setupComputedProperties, buildDependencyGraph } from "./computed.js";
import { Reactor } from "./reactor.js";

// Regex matches when $self is:
// - immediately followed by css child selector (space . : # [ > + ~) OR
// - immediately followed by opening bracket { OR
// - immediately followed by chaining comma ,
// - not followed by anything (end of line)
const SELF_REGEXP = /(\$self(?=[\\040,{.:#[>+~]))|\$self\b/g;
const CHILD_SELECTORS = [' ','.',':','#','[','>','+','~'];

let CLASS_COUNTER = -1;
let COMP_DATA_COUNTER = -1;

const COMP_DATA_CACHE = new Map();

const INTERNAL = Symbol('Component Data');

const TMP_DIV = document.createElement('div');

const CUE_CSS = {
  compiler: document.getElementById('cue::compiler') || Object.assign(document.head.appendChild(document.createElement('style')), {id: 'cue::compiler'}),
  components: document.getElementById('cue::components') || Object.assign(document.head.appendChild(document.createElement('style')), {id: 'cue::components'})
};

export const Component = {

  define(name, config) {

    // ---------------------- SETUP MODULE ----------------------
    let isConstructed = false;
    let isConnected = false;

    const Lifecycle = {
      initialize: NOOP,
      connected: NOOP,
      disconnected: NOOP
    };

    const Data = {
      static: {},
      computed: new Map(),
      bindings: {},
      reactions: {}
    };

    const Template = document.createElement('template');
    Template.innerHTML = config.element || '';

    const RefNames = collectElementReferences(Template.content, {});

    // ---------------------- CUSTOM ELEMENT INSTANCE ----------------------
    const CueElement = class CueElement extends HTMLElement {

      constructor() {

        super();

        // ---------------------- INSTANCE INTERNALS ----------------------
        this[INTERNAL]= {
          reactions: {},
          computedProperties: new Map(),
          subscriptions: [],
          refs: {},
          _data: {},
          initialized: false,
          dataEvent: new CustomEvent('data', {
            bubbles: true,
            cancelable: true,
            detail: {
              key: '',
              value: void 0
            }
          })
        };

        // ---------------------- RUN ONCE ON FIRST CONSTRUCT ----------------------
        if (isConstructed === false) {

          isConstructed = true;

          // ---------------------- CREATE SCOPED STYLES ----------------------
          if (typeof config.styles === 'string' && config.styles.length) {
            createComponentCSS(name, config.styles, RefNames);
          }

          // ---------------------- LIFECYCLE ----------------------
          if (typeof config.initialize === 'function') Lifecycle.initialize = config.initialize;
          if (typeof config.connectedCallback === 'function') Lifecycle.connected = config.connectedCallback;
          if (typeof config.disconnectedCallback === 'function') Lifecycle.disconnected = config.disconnectedCallback;

        }

      }

      connectedCallback() {

        // ----------- Connect Module (once) ----------
        if (isConnected === false) {

          isConnected = true;

          const allProperties = {};

          if (config.data) {

            config.data = typeof config.data === 'function' ? config.data() : config.data;

            for (const k in config.data) {

              const v = config.data[k];

              allProperties[k] = v.value;

              if (v.value && v.value.id === STORE_BINDING_ID) {
                Data.bindings[k] = v.value;
              } else if (typeof v.value === 'function') {
                Data.computed.set(k, new ComputedProperty(k, v.value));
              } else {
                Data.static[k] = v.value;
              }

              if (typeof v.reaction === 'function') {
                Data.reactions[k] = v.reaction;
              }

            }

          }

          // ---------------------- COMPUTED PROPERTIES ----------------------
          if (Data.computed.size > 0) {
            Data.computed = setupComputedProperties(allProperties, Data.computed);
          }

        }

        const internal = this[INTERNAL];

        // ------------- INSTANCE INIT ------------
        // (only run after initial construction, never on re-connect)

        if (internal.initialized === false) {

          internal.initialized = true;

          // ------------- Create Data Model
          const data = internal._data = Object.assign(deepClone(Data.static), internal._data);
          const computedProperties = internal.computedProperties;

          internal.data = new Proxy(data, {
            set: forbiddenProxySet,
            get(target, key) { // returns deep clone of bound store data, computed data or local data
              if (Data.bindings[key]) return Data.bindings[key].get(true); // true -> get deep clone
              if (computedProperties.has(key)) return computedProperties.get(key).value(internal.data);
              return deepClone(target[key]);
            }
          });

          // Clone Computed Properties
          for (const tuple of Data.computed.entries()) {
            const val = tuple[1];
            computedProperties.set(tuple[0], new ComputedProperty(val.ownPropertyName, val.computation, val.sourceProperties));
          }

          // Build Dependency Graph
          internal.dependencyGraph = buildDependencyGraph(internal.computedProperties);

          // Bind reactions with first argument as "refs" object, second argument the current value and third argument the entire "data" object
          for (const key in Data.reactions) {
            internal.reactions[key] = value => {
              Data.reactions[key](internal.refs, value, internal.data);
            };
          }

          // ----------- INSERT DOM AND ASSIGN REFS ----------
          if (this.innerHTML.length === 0) {
            this.innerHTML = Template.innerHTML;
          }

          // ---------------- ASSIGN REF ELEMENTS
          for (const refName in RefNames) {
            const el = this.querySelector(RefNames[refName]);
            if (el) {
              if (!el[INTERNAL]) {
                el[INTERNAL] = {};
                el.renderEach = renderEach; // give every ref element fast list rendering method
              }
              internal.refs[refName] = el; // makes ref available as $refName in js
            }
          }

          internal.refs['$self'] = this; // this === $self for completeness

          // ----------------- Parse attribute data into internal data model
          if (this.hasAttribute('cue-data')) {

            const dataKey = parseInt(this.getAttribute('cue-data'));
            const compData = COMP_DATA_CACHE.get(dataKey);

            Object.assign(internal._data, compData);

            this.removeAttribute('cue-data');
            COMP_DATA_CACHE.delete(dataKey);

          }

          // ---------------- Run reactions
          for (const key in internal.reactions) {
            Reactor.cueCallback(internal.reactions[key], internal.data[key]);
          }

          // ---------------- Trigger First Render
          Reactor.react();

          // ---------------- Initialize after First Render
          requestAnimationFrame(() => {
            Lifecycle.initialize.call(this, internal.refs);
            Lifecycle.connected.call(this, internal.refs);
          });

        } else {

          Lifecycle.connected.call(this, internal.refs); // runs whenever instance is (re-) inserted into DOM

        }

        // Add Store Subscriptions on every connect callback - unbind in disconnectedCallback
        for (const key in Data.bindings) {

          // Computation Subscriptions
          internal.dependencyGraph.has(key) && internal.subscriptions.push(Data.bindings[key].store.subscribe(
            Data.bindings[key].key,
            () => Reactor.cueComputations(internal.dependencyGraph, internal.reactions, key, internal.data)
          ));

          // Reaction Subscriptions
          internal.reactions[key] && internal.subscriptions.push(Data.bindings[key].store.subscribe(
            Data.bindings[key].key,
            internal.reactions[key]
          ));

        }

      }

      disconnectedCallback() {

        const internal = this[INTERNAL];
        const subscriptions = internal.subscriptions;
        while (subscriptions.length) {
          subscriptions.pop().unsubscribe();
        }

        Lifecycle.disconnected.call(this, internal.refs);

      }

      getData(key) {

        if (!key) {
          // when no key is passed, retrieve object of all settable properties (all except computed)
          const internal = this[INTERNAL];
          const dataClone = {};
          let key;

          for (key in Data.bindings) {
            dataClone[key] = Data.bindings[key].get(true); // true -> get deep clone
          }

          for (key in internal._data) {
            dataClone[key] = deepClone(internal._data[key]); // make deep clone
          }

          return dataClone;

        }

        return this[INTERNAL].data[key]; // proxy returns deep clone

      }

      setData(key, value) {

        if (typeof key === 'object') {
          for (const prop in key) {
            this.setData(prop, key[prop]);
          }
        }

        if (Data.computed.has(key)) {
          throw new Error(`You can not set property "${key}" because it is a computed property.`);
        }

        const internal = this[INTERNAL];

        if (Data.bindings[key] && !deepEqual(Data.bindings[key].get(false), value)) {

          internal.dataEvent.detail.key = key;
          internal.dataEvent.detail.value = deepClone(value);
          this.dispatchEvent(internal.dataEvent);

          Data.bindings[key].set(value);

        } else if (!deepEqual(internal._data[key], value)) {

          internal._data[key] = value;

          internal.dataEvent.detail.key = key;
          internal.dataEvent.detail.value = deepClone(value);
          this.dispatchEvent(internal.dataEvent);

          if (internal.reactions[key]) {
            Reactor.cueCallback(internal.reactions[key], value);
          }

          if (internal.dependencyGraph.has(key)) {
            Reactor.cueComputations(internal.dependencyGraph, internal.reactions, key, internal.data);
          }

          Reactor.react();

        }

      }

    };

    // ---------------------- ADD METHODS TO PROTOTYPE ----------------------
    for (const k in config) {
      if (typeof config[k] === 'function' && k !== 'initialize') {
        CueElement.prototype[k] = config[k];
      }
    }

    // ---------------------- ADD SPECIAL METHODS TO PROTOTYPE ----------------------
    CueElement.prototype.renderEach = renderEach;

    // ---------------------- DEFINE CUSTOM ELEMENT ----------------------
    customElements.define(name, CueElement);

    // ----------------------- RETURN HTML STRING FACTORY FOR EMBEDDING THE ELEMENT WITH ATTRIBUTES -----------------------
    const openTag = '<'+name, closeTag = '</'+name+'>';

    return attributes => {

      let htmlString = openTag, att, val;

      for (att in attributes) {

        val = attributes[att];

        if (att === 'data' && val && typeof val === 'object') {

          ++COMP_DATA_COUNTER;
          COMP_DATA_CACHE.set(COMP_DATA_COUNTER, val);

          htmlString += ' cue-data="' + COMP_DATA_COUNTER + '"';

        } else {

          htmlString += ' att="' + val + '"';

        }

      }

      htmlString += '>' + Template.innerHTML + closeTag;

      return htmlString

    };

  },

  create(node) {

    node = typeof node === 'function' ? node() : node;
    node = node.trim();

    if (typeof node !== 'string' || node[0] !== '<') {
      throw new Error('[Cue.js] - Component.create(node) -> argument "node" is not valid HTML: "' + node + '"');
    }

    TMP_DIV.innerHTML = node;
    return TMP_DIV.children[0];

  }

};

// -----------------------------------

// html
function collectElementReferences(root, refNames) {

  for (let i = 0, child, ref, cls1, cls2; i < root.children.length; i++) {

    child = root.children[i];

    ref = child.getAttribute('$');

    if (ref) {
      cls1 = child.getAttribute('class');
      cls2 = ref + ++CLASS_COUNTER;
      refNames['$' + ref] = '.' + cls2;
      child.setAttribute('class', cls1 ? cls1 + ' ' + cls2 : cls2);
      child.removeAttribute('$');
    }

    collectElementReferences(child, refNames);

  }

  return refNames;

}

// css
function createComponentCSS(name, styles, refNames) {

  // Re-write $self to component-name
  styles = styles.replace(SELF_REGEXP, name);

  // Re-write $refName(s) in style text to class selector
  for (const refName in refNames) {
    // replace $refName with internal .class when $refName is:
    // - immediately followed by css child selector (space . : # [ > + ~) OR
    // - immediately followed by opening bracket { OR
    // - immediately followed by chaining comma ,
    // - not followed by anything (end of line)
    styles = styles.replace(new RegExp("(\\" + refName + "(?=[\\40{,.:#[>+~]))|\\" + refName + "\b", 'g'), refNames[refName]);
  }

  CUE_CSS.compiler.innerHTML = styles;
  const tmpSheet = CUE_CSS.compiler.sheet;

  let styleNodeInnerHTML = '', styleQueries = '';
  for (let i = 0, rule; i < tmpSheet.rules.length; i++) {

    rule = tmpSheet.rules[i];

    if (rule.type === 7 || rule.type === 8) { // do not scope @keyframes
      styleNodeInnerHTML += rule.cssText;
    } else if (rule.type === 1) { // style rule
      styleNodeInnerHTML += constructScopedStyleRule(rule, name);
    } else if (rule.type === 4 || rule.type === 12) { // @media/@supports query
      styleQueries += constructScopedStyleQuery(name, rule);
    } else {
      console.warn(`CSS Rule of type "${rule.type}" is not currently supported by Cue Components.`);
    }

  }

  // write queries to the end of the rules AFTER the other rules (issue #13)
  styleNodeInnerHTML += styleQueries;

  // Empty Compiler styleSheet
  CUE_CSS.compiler.innerHTML = '';
  CUE_CSS.components.innerHTML += styleNodeInnerHTML;

}

function constructScopedStyleQuery(name, query, cssText = '') {

  if (query.type === 4) {
    cssText += '@media ' + query.media.mediaText + ' {';
  } else {
    cssText += '@supports ' + query.conditionText + ' {';
  }

  let styleQueries = '';

  for (let i = 0, rule; i < query.cssRules.length; i++) {

    rule = query.cssRules[i];

    if (rule.type === 7 || rule.type === 8) { // @keyframes
      cssText += rule.cssText;
    } else if (rule.type === 1) {
      cssText += constructScopedStyleRule(rule, name, cssText);
    } else if (rule.type === 4 || rule.type === 12) { // nested query
      styleQueries += constructScopedStyleQuery(name, rule);
    } else {
      console.warn(`CSS Rule of type "${rule.type}" is not currently supported by Components.`);
    }

  }

  // write nested queries to the end of the surrounding query (see issue #13)
  cssText += styleQueries + ' }';

  return cssText;

}

function constructScopedStyleRule(rule, componentName) {

  let cssText = '';

  if (rule.selectorText.indexOf(',') > -1) {

    const selectors = rule.selectorText.split(',');
    const scopedSelectors = [];

    for (let i = 0, selector; i < selectors.length; i++) {

      selector = selectors[i].trim();

      if (selector.lastIndexOf(':root', 0) === 0) { // escape context (dont scope) :root notation
        scopedSelectors.push(selector.replace(':root', ''));
      } else if (isTopLevelSelector(selector, componentName)) { // dont scope component-name
        scopedSelectors.push(selector);
      } else { // prefix with component-name to create soft scoping
        scopedSelectors.push(componentName + ' ' + selector);
      }

    }

    cssText += scopedSelectors.join(', ') + rule.cssText.substr(rule.selectorText.length);

  } else {

    if (rule.selectorText.lastIndexOf(':root', 0) === 0) { // escape context (dont scope) :root notation
      cssText += rule.cssText.replace(':root', ''); // remove first occurrence of :root
    } else if (isTopLevelSelector(rule.selectorText, componentName)) { // dont scope component-name
      cssText += rule.cssText;
    } else { // prefix with component-name to create soft scoping
      cssText += componentName + ' ' + rule.cssText;
    }

  }

  return cssText;

}

function isTopLevelSelector(selectorText, componentName) {
  if (selectorText === componentName) { // is componentName
    return true;
  } else if (selectorText.lastIndexOf(componentName, 0) === 0) { // starts with componentName
    return CHILD_SELECTORS.indexOf(selectorText.charAt(componentName.length)) > -1; // character following componentName is valid child selector
  } else { // nada
    return false;
  }
}

// utils
function forbiddenProxySet(target, key, value) {
  throw new Error(`Can not change data in reactions: this.${key} = ${value} has been ignored.`);
}

function renderEach(dataArray, createElement, updateElement = NOOP) {

  // accept arrays, convert plain objects to arrays, convert null or undefined to array
  dataArray = Array.isArray(dataArray) ? dataArray : Object.values(dataArray || {});

  // this function is attached directly to dom elements. "this" refers to the element
  const previousData = this[INTERNAL].childData || [];
  this[INTERNAL].childData = dataArray;

  if (dataArray.length === 0) {
    this.innerHTML = '';
  } else if (previousData.length === 0) {
    for (let i = 0; i < dataArray.length; i++) {
      this.appendChild(createElement(dataArray[i], i, dataArray));
    }
  } else {
    reconcile(this, previousData, dataArray, createElement, updateElement);
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
          ? parentElement.insertBefore(createFn(newArray[newStart], newStart, newArray), afterNode)
          : parentElement.appendChild(createFn(newArray[newStart], newStart, newArray));
        newStart++
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
      parentElement.appendChild(createFn(newArray[i], i, newArray));
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
    tmpC = tmpC.nextSibling
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
        tempNode = createFn(newArray[i], i, newArray);
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